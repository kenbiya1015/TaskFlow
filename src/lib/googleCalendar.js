/*
  Google Calendar 連携のセットアップ手順（リダイレクト方式）
  ──────────────────────────────────────────────
  1. Google Cloud Console (https://console.cloud.google.com/) を開き、新しいプロジェクトを作成。
  2. 「API とサービス」→「ライブラリ」で  "Google Calendar API"  を検索して「有効化」。
  3. 「API とサービス」→「OAuth 同意画面」を開き、ユーザータイプ「外部」で作成。
     ・スコープに  ".../auth/calendar.readonly"  を追加。
     ・公開ステータスが「テスト中」のままなら、ログインに使う Google アカウントを「テストユーザー」に追加する必要があります。
  4. 「API とサービス」→「認証情報」→「認証情報を作成」→「OAuth クライアント ID」。
     アプリケーションの種類は  ウェブ アプリケーション 。
     「承認済みの JavaScript 生成元」に開発用と本番用の URL を両方登録：
        http://localhost:5173
        https://task-flow-khaki-one.vercel.app
     「承認済みのリダイレクト URI」にも以下を必ず登録：
        http://localhost:5173/auth/callback
        https://task-flow-khaki-one.vercel.app/auth/callback
  5. 発行された「クライアント ID」を、画面の  設定 → Google カレンダー連携  または
     スケジュール画面の  ⚙️設定  パネルに貼り付け、「📅 Googleカレンダー連携」ボタンを押すと
     Google の同意画面へリダイレクトします。許可後、本アプリの /auth/callback に戻ってきます。
  6. アクセストークンは 1 時間で失効します。期限切れになったら「再接続」ボタンで取り直してください。
  7. ユーザーごとに別々の Google アカウントを連携できます（state パラメータでユーザーを識別）。
*/

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const CALLBACK_PATH = '/auth/callback'

export function getRedirectUri() {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}${CALLBACK_PATH}`
}

// 認証開始前に「どのユーザーが、どのページに戻りたいか」を保持するためのキー
const PENDING_KEY = 'tf_gcal_oauth_pending'

export function startOAuthRedirect(clientId, user, returnTo) {
  if (!clientId) throw new Error('クライアント ID が未設定です')
  if (!user) throw new Error('ユーザーが指定されていません')

  // CSRF 対策の nonce と、戻り先情報を localStorage に格納
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36)
  const pending = { user, returnTo: returnTo || '', nonce, at: Date.now() }
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(pending))
  } catch { /* quota */ }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'token',
    scope: SCOPE,
    include_granted_scopes: 'true',
    state: nonce,
    prompt: 'consent select_account',
  })
  window.location.assign(`${AUTH_ENDPOINT}?${params.toString()}`)
}

// /auth/callback 着地時に呼ぶ。hash から token を取り出し、保留情報と突き合わせる。
// 成功すれば { user, returnTo, token } を返し、保留情報をクリア。
// 該当する保留情報が無ければ null を返す（callback URL 直叩きなど）。
export function consumeOAuthCallback() {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash || ''
  if (!hash || hash.length < 2) return null

  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  const accessToken = params.get('access_token')
  const expiresIn = params.get('expires_in')
  const state = params.get('state')
  const error = params.get('error')

  let pending = null
  try {
    const raw = window.localStorage.getItem(PENDING_KEY)
    pending = raw ? JSON.parse(raw) : null
  } catch { pending = null }

  if (error) {
    try { window.localStorage.removeItem(PENDING_KEY) } catch {}
    return { error: params.get('error_description') || error, user: pending?.user || '', returnTo: pending?.returnTo || '' }
  }

  if (!accessToken || !state) return null
  if (!pending || pending.nonce !== state) {
    // nonce 不一致：別ブラウザでの認証 or 古い state。安全のため破棄。
    try { window.localStorage.removeItem(PENDING_KEY) } catch {}
    return { error: '認証状態が一致しません（state 不一致）。もう一度お試しください。', user: '', returnTo: '' }
  }

  try { window.localStorage.removeItem(PENDING_KEY) } catch {}

  return {
    user: pending.user,
    returnTo: pending.returnTo || '',
    token: {
      access_token: accessToken,
      expires_at: Date.now() + (Number(expiresIn) || 3600) * 1000,
    },
  }
}

export async function fetchEvents(accessToken, dateFrom, dateTo) {
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  url.searchParams.set('timeMin', dateFrom.toISOString())
  url.searchParams.set('timeMax', dateTo.toISOString())
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')
  url.searchParams.set('maxResults', '100')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    let body = ''
    try { body = await res.text() } catch {}
    throw new Error(`Calendar API ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  return (data.items || []).map(ev => ({
    id: ev.id,
    title: ev.summary || '(無題)',
    start: ev.start?.dateTime || ev.start?.date,
    end: ev.end?.dateTime || ev.end?.date,
    allDay: !ev.start?.dateTime,
    location: ev.location || '',
    htmlLink: ev.htmlLink || '',
  }))
}

export function revokeToken(accessToken) {
  if (!accessToken) return
  // GIS スクリプトを読み込んでいなくても叩ける Google の revoke エンドポイント
  try {
    fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }).catch(() => {})
  } catch {}
}
