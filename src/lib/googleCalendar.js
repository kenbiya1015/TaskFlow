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

// ──────────────────────────────────────────────
// Google Identity Services（GIS）による「サイレント更新」レイヤ
// ──────────────────────────────────────────────
// 制約：SPA からは Google の refresh_token を取得できない（client_secret が必要）。
// 代替として GIS Token Client の prompt:'' を使うと、ブラウザの Google セッションが
// 生きている限り、隠し iframe 経由で UI なしに新しい access_token が取れる。
// = 実質「リフレッシュトークンの代わり」。Google セッションが切れた場合のみ再ログインを要求。

export const TOKEN_STORE_KEY = 'tf_gcal_user_tokens'
export const TOKEN_REFRESH_NOTICE_EVENT = 'tf-gcal-reconnect-needed'
export const TOKEN_REFRESH_OK_EVENT = 'tf-gcal-token-refreshed'

const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000   // 期限 5 分前にプリフライト
const TOKEN_RETRY_THROTTLE_MS = 30 * 1000        // 失敗連発防止

let _gsiPromise = null
function loadGsiScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (_gsiPromise) return _gsiPromise
  _gsiPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve()
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.defer = true
    s.onload = () => {
      if (window.google?.accounts?.oauth2) resolve()
      else reject(new Error('GIS script loaded but oauth2 missing'))
    }
    s.onerror = () => reject(new Error('GIS script load failed'))
    document.head.appendChild(s)
  })
  return _gsiPromise
}

// Token Client は client_id 単位でキャッシュ
const _tokenClients = new Map()

/**
 * サイレントにアクセストークンを再取得する。
 * - Google セッションが有効＆過去にこの client_id で承認済みなら、UI なしで token を返す。
 * - 失敗（同意未取得・セッション切れ等）なら null を返す。
 * @param {string} clientId
 * @param {string} [emailHint]  対象 Google アカウントの email（過去に取得済みなら指定）
 */
export async function requestTokenSilent(clientId, emailHint) {
  if (!clientId) return null
  try {
    await loadGsiScript()
  } catch {
    return null
  }
  return new Promise(resolve => {
    let settled = false
    const finish = (val) => { if (!settled) { settled = true; resolve(val) } }
    const callback = (resp) => {
      if (resp?.error) return finish(null)
      if (!resp?.access_token) return finish(null)
      finish({
        access_token: resp.access_token,
        expires_at: Date.now() + (Number(resp.expires_in) || 3600) * 1000,
        scope: resp.scope || SCOPE,
      })
    }
    let client = _tokenClients.get(clientId)
    if (!client) {
      client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        prompt: '',
        callback,
        error_callback: () => finish(null),
      })
      _tokenClients.set(clientId, client)
    }
    client.callback = callback
    try {
      client.requestAccessToken({ prompt: '', hint: emailHint || undefined })
    } catch {
      finish(null)
    }
    // 念のためタイムアウト（10秒）
    setTimeout(() => finish(null), 10000)
  })
}

/**
 * 新しく取れた access_token から Google アカウントの email を取得して保存する。
 * これを次回以降の silent refresh に `hint` として渡すことで、
 * 同一ブラウザに複数 Google アカウントがある場合でも正しいアカウントで更新できる。
 */
export async function fetchGoogleEmail(accessToken) {
  if (!accessToken) return null
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    return (data && data.email) || null
  } catch {
    return null
  }
}

export function tokenIsValid(token, marginMs = 0) {
  if (!token || !token.access_token) return false
  if (typeof token.expires_at !== 'number') return false
  return token.expires_at - marginMs > Date.now()
}

export function tokenIsExpiringSoon(token, marginMs = TOKEN_REFRESH_MARGIN_MS) {
  if (!token || !token.access_token) return true
  if (typeof token.expires_at !== 'number') return true
  return token.expires_at - marginMs <= Date.now()
}

function notifyReconnectNeeded(user) {
  try {
    window.dispatchEvent(new CustomEvent(TOKEN_REFRESH_NOTICE_EVENT, { detail: { user } }))
  } catch {}
}
function notifyRefreshed(user) {
  try {
    window.dispatchEvent(new CustomEvent(TOKEN_REFRESH_OK_EVENT, { detail: { user } }))
  } catch {}
}

// 同時並行の refresh を抑止
const _inflight = new Map() // user -> Promise

/**
 * 指定ユーザーの GCal トークンを「有効な状態」に保証する。
 * - 期限内なら現トークンを返す
 * - 期限切れ間近なら silent refresh を試みる
 * - silent 失敗時は null + TOKEN_REFRESH_NOTICE_EVENT を発火
 *
 * tokens はそのままミューテートせず、新しいオブジェクトを返す。
 * @returns {Promise<{token: object|null, tokens: object, refreshed: boolean}>}
 */
export async function ensureValidToken(clientId, user, tokens) {
  const safeTokens = (tokens && typeof tokens === 'object') ? tokens : {}
  if (!user) return { token: null, tokens: safeTokens, refreshed: false }
  const existing = safeTokens[user] || null
  if (tokenIsValid(existing, TOKEN_REFRESH_MARGIN_MS)) {
    return { token: existing, tokens: safeTokens, refreshed: false }
  }
  // 失敗直後のクールダウン中はサイレント再試行しない（フリッカ防止）
  const lastFail = existing?.lastSilentFailAt
  if (lastFail && Date.now() - lastFail < TOKEN_RETRY_THROTTLE_MS) {
    notifyReconnectNeeded(user)
    return { token: existing && existing.access_token ? existing : null, tokens: safeTokens, refreshed: false }
  }
  if (_inflight.has(user)) {
    const t = await _inflight.get(user)
    return { token: t || null, tokens: safeTokens, refreshed: !!t }
  }
  const p = (async () => {
    const fresh = await requestTokenSilent(clientId, existing?.email)
    if (!fresh) return null
    // 初回かつ email 未取得なら、ここで email も取り直して保存（次回の hint 用）
    let email = existing?.email || null
    if (!email) {
      email = await fetchGoogleEmail(fresh.access_token)
    }
    fresh.email = email || undefined
    return fresh
  })()
  _inflight.set(user, p)
  let fresh = null
  try {
    fresh = await p
  } finally {
    _inflight.delete(user)
  }

  if (fresh) {
    const nextTokens = { ...safeTokens, [user]: fresh }
    notifyRefreshed(user)
    return { token: fresh, tokens: nextTokens, refreshed: true }
  } else {
    // 失敗を記録（既存トークンが有効なら維持しつつ lastSilentFailAt を付ける）
    const failed = { ...(existing || {}), lastSilentFailAt: Date.now() }
    const nextTokens = existing ? { ...safeTokens, [user]: failed } : safeTokens
    notifyReconnectNeeded(user)
    return {
      token: tokenIsValid(existing) ? existing : null,
      tokens: nextTokens,
      refreshed: false,
    }
  }
}

// ──────────────────────────────────────────────
// 自動更新スケジューラ：期限の 5 分前 / タブ復帰 / 起動時に silent refresh
// ──────────────────────────────────────────────
let _schedulerHandle = null
let _schedulerCtx = null

/**
 * @param {object} opts
 * @param {() => string} opts.getClientId
 * @param {() => string} opts.getUser
 * @param {() => object} opts.getAllTokens
 * @param {(next: object) => void} opts.setAllTokens
 */
export function startGcalAutoRefresh(opts) {
  stopGcalAutoRefresh()
  _schedulerCtx = opts
  const tick = async () => {
    if (!_schedulerCtx) return
    const { getClientId, getUser, getAllTokens, setAllTokens } = _schedulerCtx
    const clientId = (getClientId?.() || '').trim()
    const user = getUser?.()
    const tokens = getAllTokens?.() || {}
    if (!clientId || !user) return scheduleNext(60 * 1000)
    const result = await ensureValidToken(clientId, user, tokens)
    if (result.tokens !== tokens) setAllTokens(result.tokens)
    const newToken = result.tokens[user]
    if (newToken?.expires_at) {
      const wait = Math.max(60 * 1000, newToken.expires_at - Date.now() - TOKEN_REFRESH_MARGIN_MS)
      scheduleNext(wait)
    } else {
      scheduleNext(60 * 1000)
    }
  }
  const scheduleNext = (ms) => {
    if (_schedulerHandle) clearTimeout(_schedulerHandle)
    _schedulerHandle = setTimeout(tick, ms)
  }

  // ① 起動時すぐ実行
  tick()
  // ② タブが見えるようになったら再チェック（モバイル復帰想定）
  const onVisible = () => {
    if (document.visibilityState === 'visible') tick()
  }
  document.addEventListener('visibilitychange', onVisible)
  // ③ ネット復帰でも
  const onOnline = () => tick()
  window.addEventListener('online', onOnline)

  // 解除関数を保持
  _schedulerCtx._cleanup = () => {
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', onOnline)
  }
}

export function stopGcalAutoRefresh() {
  if (_schedulerHandle) clearTimeout(_schedulerHandle)
  _schedulerHandle = null
  if (_schedulerCtx?._cleanup) {
    try { _schedulerCtx._cleanup() } catch {}
  }
  _schedulerCtx = null
}
