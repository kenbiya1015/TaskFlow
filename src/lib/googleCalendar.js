/*
  Google Calendar 連携のセットアップ手順
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
        （本番運用するならその URL も）
  5. 発行された「クライアント ID」を、画面の  設定 → Google カレンダー連携  または
     スケジュール画面の  ⚙️設定  パネルに貼り付け、「接続」ボタンで OAuth ポップアップを許可。
  6. アクセストークンは 1 時間で失効します。期限切れになったら「再接続」ボタンで取り直してください。
*/

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

let gisLoadingPromise = null

export function loadGis() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (gisLoadingPromise) return gisLoadingPromise
  gisLoadingPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = GIS_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => {
      gisLoadingPromise = null
      reject(new Error('Google Identity Services スクリプトの読み込みに失敗しました'))
    }
    document.head.appendChild(s)
  })
  return gisLoadingPromise
}

export async function requestAccessToken(clientId) {
  if (!clientId) throw new Error('クライアント ID が未設定です')
  await loadGis()
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services が利用できません'))
      return
    }
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: response => {
        if (response.error) {
          reject(new Error(response.error_description || response.error))
          return
        }
        resolve({
          access_token: response.access_token,
          expires_at: Date.now() + (Number(response.expires_in) || 3600) * 1000,
        })
      },
      error_callback: err => reject(new Error(err?.message || 'OAuth エラー')),
    })
    tokenClient.requestAccessToken({ prompt: '' })
  })
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
  try { window.google?.accounts?.oauth2?.revoke?.(accessToken, () => {}) } catch {}
}
