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

import { GCAL_USE_BACKEND, GCAL_CLIENT_ID } from '../config'
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase'

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const CALLBACK_PATH = '/auth/callback'

export function getRedirectUri() {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}${CALLBACK_PATH}`
}

// 認証開始前に「どのユーザーが、どのページに戻りたいか」を保持するためのキー
const PENDING_KEY = 'tf_gcal_oauth_pending'

// 暗黙フロー・認可コードフロー共通の保留情報ヘルパ
function makeNonce() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
function writePending(pending) {
  try { window.localStorage.setItem(PENDING_KEY, JSON.stringify(pending)) } catch { /* quota */ }
}
function readPending() {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
function clearPending() {
  try { window.localStorage.removeItem(PENDING_KEY) } catch {}
}

export function startOAuthRedirect(clientId, user, returnTo) {
  if (!clientId) throw new Error('クライアント ID が未設定です')
  if (!user) throw new Error('ユーザーが指定されていません')

  // CSRF 対策の nonce と、戻り先情報を localStorage に格納
  const nonce = makeNonce()
  writePending({ user, returnTo: returnTo || '', nonce, at: Date.now(), flow: 'implicit' })

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

/**
 * 連携開始の入り口。設定フラグに応じて、サーバーサイド（認可コード）方式か
 * 従来のブラウザ専用（暗黙）方式かを自動で切り替える。
 */
export function startGcalConnect(clientId, user, returnTo) {
  if (GCAL_USE_BACKEND) return startServerOAuthRedirect(user, returnTo)
  return startOAuthRedirect(clientId, user, returnTo)
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

  const pending = readPending()

  if (error) {
    clearPending()
    return { error: params.get('error_description') || error, user: pending?.user || '', returnTo: pending?.returnTo || '' }
  }

  if (!accessToken || !state) return null
  if (!pending || pending.nonce !== state) {
    // nonce 不一致：別ブラウザでの認証 or 古い state。安全のため破棄。
    clearPending()
    return { error: '認証状態が一致しません（state 不一致）。もう一度お試しください。', user: '', returnTo: '' }
  }

  clearPending()

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

// ──────────────────────────────────────────────
// 「切れた通知は一度だけ」用の状態ストア
// ──────────────────────────────────────────────
// 連携が切れたら一度だけ静かに通知し、その後は催促しない。
// ユーザーごとに「切れた通知を出したか」を localStorage に持ち、
// 再連携・自動更新成功でクリアする（= 次に切れたらまた一度だけ通知できる）。
export const DISCONNECT_STORE_KEY = 'tf_gcal_disconnected'

function readDisconnectedMap() {
  try {
    const raw = window.localStorage.getItem(DISCONNECT_STORE_KEY)
    return raw ? (JSON.parse(raw) || {}) : {}
  } catch { return {} }
}
function writeDisconnectedMap(map) {
  try { window.localStorage.setItem(DISCONNECT_STORE_KEY, JSON.stringify(map)) } catch {}
}
/** すでに通知済みなら false（=これ以上催促しない）。新規に立てたら true。 */
function markDisconnected(user) {
  const map = readDisconnectedMap()
  if (map[user]) return false
  map[user] = true
  writeDisconnectedMap(map)
  return true
}
/** 連携が回復したらフラグを下ろす。 */
export function clearDisconnected(user) {
  const map = readDisconnectedMap()
  if (!map[user]) return
  delete map[user]
  writeDisconnectedMap(map)
}
/** スケジュール画面で「再連携」表示が必要かの判定に使う。 */
export function isDisconnected(user) {
  return !!readDisconnectedMap()[user]
}

// ──────────────────────────────────────────────
// サーバーサイド方式（Supabase Edge Functions）クライアント
// ──────────────────────────────────────────────
// 認可コードフローで取得したリフレッシュトークンを Supabase に保存し、
// アクセストークンの発行・更新をサーバー側（Edge Function）に委譲する。
// client_secret はブラウザに出さず Edge Function 側だけが保持する。

const GCAL_FUNCTION_NAME = 'gcal-oauth'

function getFunctionUrl() {
  return `${SUPABASE_URL}/functions/v1/${GCAL_FUNCTION_NAME}`
}

function getWorkspaceId() {
  try {
    const raw = window.localStorage.getItem('tf_workspace_id')
    return (raw ? JSON.parse(raw) : '') || 'default'
  } catch { return 'default' }
}

async function callFunction(action, payload) {
  const res = await fetch(getFunctionUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Edge Function ゲートウェイ用（publishable key を渡す）
      'apikey': SUPABASE_PUBLISHABLE_KEY,
      'Authorization': `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ action, workspace_id: getWorkspaceId(), ...payload }),
  })
  let data = null
  try { data = await res.json() } catch {}
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`
    const err = new Error(msg)
    err.status = res.status
    err.code = data?.code
    throw err
  }
  return data
}

/** 認可コードフローで Google の同意画面へリダイレクト（offline access でリフレッシュトークンを要求）。 */
export function startServerOAuthRedirect(user, returnTo) {
  if (!user) throw new Error('ユーザーが指定されていません')
  const clientId = GCAL_CLIENT_ID
  if (!clientId) throw new Error('クライアント ID が未設定です')
  const nonce = makeNonce()
  writePending({ user, returnTo: returnTo || '', nonce, at: Date.now(), flow: 'code' })

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPE,
    include_granted_scopes: 'true',
    access_type: 'offline',          // リフレッシュトークンを得るため
    prompt: 'consent select_account', // 毎回 refresh_token を確実に得る
    state: nonce,
  })
  window.location.assign(`${AUTH_ENDPOINT}?${params.toString()}`)
}

/**
 * /auth/callback 着地時（認可コードフロー）に呼ぶ。クエリの code/state を保留情報と突き合わせる。
 * 成功で { user, returnTo, code } を返し、該当が無ければ null。
 */
export function consumeServerCallback() {
  if (typeof window === 'undefined') return null
  const search = window.location.search || ''
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const code = params.get('code')
  const state = params.get('state')
  const error = params.get('error')
  const pending = readPending()

  if (error) {
    clearPending()
    return { error: params.get('error_description') || error, user: pending?.user || '', returnTo: pending?.returnTo || '' }
  }
  if (!code || !state) return null
  if (!pending || pending.nonce !== state) {
    clearPending()
    return { error: '認証状態が一致しません（state 不一致）。もう一度お試しください。', user: '', returnTo: '' }
  }
  clearPending()
  return { user: pending.user, returnTo: pending.returnTo || '', code }
}

/** 認可コードを Edge Function に渡してトークン交換。サーバー側に refresh_token を保存し、access_token を受け取る。 */
export async function exchangeServerCode(code, user) {
  const data = await callFunction('exchange', {
    code,
    user,
    redirect_uri: getRedirectUri(),
  })
  if (!data || !data.access_token) return null
  return {
    access_token: data.access_token,
    expires_at: data.expires_at || (Date.now() + (Number(data.expires_in) || 3600) * 1000),
    email: data.email || undefined,
    server: true,
  }
}

/** サーバー側に保存された refresh_token を使って access_token を再発行（サイレント更新の代替）。 */
export async function requestServerToken(user) {
  try {
    const data = await callFunction('token', { user })
    if (!data || !data.access_token) return null
    return {
      access_token: data.access_token,
      expires_at: data.expires_at || (Date.now() + (Number(data.expires_in) || 3600) * 1000),
      email: data.email || undefined,
      server: true,
    }
  } catch {
    // reauth_required（リフレッシュトークン失効）やネットワーク失敗はサイレントに null
    return null
  }
}

/** サーバー側の refresh_token を破棄（連携解除）。失敗してもローカル解除は続行できるよう例外は飲み込む。 */
export async function disconnectServer(user) {
  try { await callFunction('disconnect', { user }) } catch {}
}

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
  // 「一度だけ静かに通知」：すでに切れ通知済みのユーザーには再発火しない（催促しない）。
  if (!markDisconnected(user)) return
  try {
    window.dispatchEvent(new CustomEvent(TOKEN_REFRESH_NOTICE_EVENT, { detail: { user } }))
  } catch {}
}
function notifyRefreshed(user) {
  // 連携が回復したので「切れた」状態を解除（次に切れたら再び一度だけ通知できる）。
  clearDisconnected(user)
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
export async function ensureValidToken(clientId, user, tokens, options = {}) {
  // allowSilentRefresh:
  //   false（既定）… 自動でポップアップを出さない。期限切れトークンの「ブラウザ方式」
  //                   サイレント更新（GIS のアカウント選択ポップアップを誘発しうる）は行わない。
  //   true          … ユーザーの明示操作時のみ。ブラウザ方式のサイレント更新を許可する。
  // ※ サーバーサイド方式（Edge Function 経由）の再発行はポップアップを伴わないため、
  //    allowSilentRefresh の値に関わらず常に自動更新を許可する。
  const { allowSilentRefresh = false } = options
  const safeTokens = (tokens && typeof tokens === 'object') ? tokens : {}
  if (!user) return { token: null, tokens: safeTokens, refreshed: false }
  const existing = safeTokens[user] || null
  if (tokenIsValid(existing, TOKEN_REFRESH_MARGIN_MS)) {
    return { token: existing, tokens: safeTokens, refreshed: false }
  }

  // 期限切れ（または期限間近）。ここで「自動でポップアップを出さない」ことが要件。
  // サーバー方式 or 明示操作のときだけトークン再取得を試みる。それ以外は再取得しない。
  const canAutoRefresh = GCAL_USE_BACKEND || allowSilentRefresh
  if (!canAutoRefresh) {
    // まだ数分は使えるトークンならそのまま使う（催促しない）。
    if (tokenIsValid(existing)) {
      return { token: existing, tokens: safeTokens, refreshed: false }
    }
    // 完全に失効：一度でも連携した形跡があるユーザーにだけ「切れた」通知を一度だけ出す。
    // （再連携は設定ページの「再連携」ボタンから明示的に行う）
    const hadConnection = !!(existing && (existing.access_token || existing.email))
    if (hadConnection) notifyReconnectNeeded(user)
    return { token: null, tokens: safeTokens, refreshed: false }
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
  // 更新方法はフラグで切替：
  //  ・サーバーサイド … Edge Function が保存済み refresh_token で再発行（ブラウザを閉じても維持）
  //  ・ブラウザ専用   … GIS の隠し iframe でサイレント更新（Google セッションが生きている間のみ）
  const p = GCAL_USE_BACKEND
    ? requestServerToken(user)
    : (async () => {
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
    // 一度でも連携した形跡があるユーザーだけ「切れた」と扱う（未連携への誤通知を防ぐ）。
    const hadConnection = !!(existing && (existing.access_token || existing.email))
    if (hadConnection) {
      // 失敗を記録（lastSilentFailAt を付けてクールダウンを効かせ、一度だけ通知）
      const failed = { ...existing, lastSilentFailAt: Date.now() }
      notifyReconnectNeeded(user)
      return {
        token: tokenIsValid(existing) ? existing : null,
        tokens: { ...safeTokens, [user]: failed },
        refreshed: false,
      }
    }
    // 未連携（サーバーにも refresh_token が無い等）：催促せず静かに返す。
    return { token: null, tokens: safeTokens, refreshed: false }
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
