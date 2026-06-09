// Supabase Edge Function: gcal-oauth
// ──────────────────────────────────────────────
// Google カレンダー連携を「サーバーサイド」で管理する関数。
//
//   action: "exchange"   … 認可コード → access_token + refresh_token に交換し、
//                          refresh_token を gcal_tokens テーブルに保存。access_token を返す。
//   action: "token"      … 保存済み refresh_token で access_token を再発行して返す。
//   action: "disconnect" … refresh_token を Google で revoke し、行を削除。
//
// client_secret はこの関数（サーバー）だけが保持し、ブラウザには一切出ません。
//
// 必要な環境変数（Secrets）:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   … 手動で設定（supabase secrets set）
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  … デプロイ時に自動で注入される
//
// デプロイ:
//   supabase functions deploy gcal-oauth --no-verify-jwt
//
// 詳しい手順は docs/google-calendar-backend-setup.md を参照。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'
const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo'
const TABLE = 'gcal_tokens'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function getAdminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function fetchEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.email ?? null
  } catch {
    return null
  }
}

// ── action: exchange ───────────────────────────
async function handleExchange(body: Record<string, string>) {
  const { code, redirect_uri, workspace_id, user } = body
  if (!code || !redirect_uri) return json({ error: 'code / redirect_uri がありません' }, 400)
  if (!user) return json({ error: 'user がありません' }, 400)

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    return json({ error: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が未設定です' }, 500)
  }

  const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri,
      grant_type: 'authorization_code',
    }),
  })
  const tokenData = await tokenRes.json()
  if (!tokenRes.ok || !tokenData.access_token) {
    return json({ error: tokenData.error_description || tokenData.error || 'token exchange failed' }, 400)
  }

  const email = await fetchEmail(tokenData.access_token)
  const admin = getAdminClient()

  // refresh_token は「初回同意時」や prompt=consent のときだけ返る。
  // 返ってこない場合は既存の refresh_token を温存する。
  if (tokenData.refresh_token) {
    const { error } = await admin.from(TABLE).upsert({
      workspace_id: workspace_id || 'default',
      app_user: user,
      refresh_token: tokenData.refresh_token,
      email,
      updated_at: new Date().toISOString(),
    })
    if (error) return json({ error: `保存に失敗: ${error.message}` }, 500)
  } else if (email) {
    // email だけ更新（行が無ければ作らない）
    await admin.from(TABLE)
      .update({ email, updated_at: new Date().toISOString() })
      .eq('workspace_id', workspace_id || 'default')
      .eq('app_user', user)
  }

  return json({
    access_token: tokenData.access_token,
    expires_in: tokenData.expires_in,
    expires_at: Date.now() + (Number(tokenData.expires_in) || 3600) * 1000,
    email,
  })
}

// ── action: token（再発行）─────────────────────
async function handleToken(body: Record<string, string>) {
  const { workspace_id, user } = body
  if (!user) return json({ error: 'user がありません' }, 400)

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    return json({ error: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が未設定です' }, 500)
  }

  const admin = getAdminClient()
  const { data: row, error } = await admin.from(TABLE)
    .select('refresh_token, email')
    .eq('workspace_id', workspace_id || 'default')
    .eq('app_user', user)
    .maybeSingle()

  if (error) return json({ error: `読み込み失敗: ${error.message}` }, 500)
  if (!row || !row.refresh_token) {
    return json({ error: '未連携です。再連携してください。', code: 'reauth_required' }, 404)
  }

  const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const tokenData = await tokenRes.json()

  if (!tokenRes.ok || !tokenData.access_token) {
    // invalid_grant = リフレッシュトークンが失効/取り消し済み → 行を削除して再連携を促す
    if (tokenData.error === 'invalid_grant') {
      await admin.from(TABLE).delete()
        .eq('workspace_id', workspace_id || 'default')
        .eq('app_user', user)
      return json({ error: '連携が失効しました。再連携してください。', code: 'reauth_required' }, 410)
    }
    return json({ error: tokenData.error_description || tokenData.error || 'refresh failed' }, 400)
  }

  return json({
    access_token: tokenData.access_token,
    expires_in: tokenData.expires_in,
    expires_at: Date.now() + (Number(tokenData.expires_in) || 3600) * 1000,
    email: row.email ?? null,
  })
}

// ── action: disconnect ─────────────────────────
async function handleDisconnect(body: Record<string, string>) {
  const { workspace_id, user } = body
  if (!user) return json({ error: 'user がありません' }, 400)

  const admin = getAdminClient()
  const { data: row } = await admin.from(TABLE)
    .select('refresh_token')
    .eq('workspace_id', workspace_id || 'default')
    .eq('app_user', user)
    .maybeSingle()

  if (row?.refresh_token) {
    try {
      await fetch(`${GOOGLE_REVOKE_ENDPOINT}?token=${encodeURIComponent(row.refresh_token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    } catch { /* revoke 失敗は無視 */ }
  }

  await admin.from(TABLE).delete()
    .eq('workspace_id', workspace_id || 'default')
    .eq('app_user', user)

  return json({ ok: true })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'POST のみ対応' }, 405)

  let body: Record<string, string>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON ボディが不正です' }, 400)
  }

  try {
    switch (body.action) {
      case 'exchange':   return await handleExchange(body)
      case 'token':      return await handleToken(body)
      case 'disconnect': return await handleDisconnect(body)
      default:           return json({ error: `未知の action: ${body.action}` }, 400)
    }
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500)
  }
})
