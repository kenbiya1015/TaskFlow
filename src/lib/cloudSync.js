// クラウド同期エンジン（Supabase × localStorage の双方向同期）
// ──────────────────────────────────────────────
// データモデル：1キー = 1行（taskflow_kv テーブル）
//   workspace_id : 共有グループ識別子（同じIDなら同じデータを見る）
//   key          : tf_xxx
//   value        : jsonb
//   client_id    : 書き込んだブラウザ識別子（自分の書き込みは無視するため）
//   updated_at   : 最終更新時刻
//
// データ消失を防ぐための安全策（v3）：
//   1. Pull 時の「スマートマージ」：オブジェクト型データは local と cloud を融合し、
//      local-only のキー（他ユーザーのスロット等）を保護する。
//   2. Push 時の「再読み込み」：debounce 中に他端末からの realtime で local が
//      更新された場合に備え、push 直前に localStorage を再読し最新値を送る。
//   3. 永続キュー：未送信 push を localStorage（tf_pending_pushes）に保存し、
//      クラッシュ・強制終了・再起動を跨いでも失われないようにする。
//   4. 最大 3 回までリトライ。それでも失敗すれば 'failed' 状態を発火し、
//      キューに残してユーザーに手動再送（forceFlush）を促す。
//   5. unload 時の同期送信：navigator.sendBeacon を優先、未対応環境では
//      fetch + keepalive にフォールバック（iOS Safari 対策）。
//   6. Realtime 接続が切れたら自動再購読（指数バックオフ）。
//   7. workspace_id の固定化：DEFAULT_WORKSPACE を常に使用、空値・不正値は無視。

import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase'

const TABLE = 'taskflow_kv'
const DEFAULT_WORKSPACE = 'kenbiya-default'
const WORKSPACE_KEY_LS = 'tf_workspace_id'
const CLIENT_KEY_LS = 'tf_client_id'
const PENDING_QUEUE_LS = 'tf_pending_pushes'

const MAX_RETRIES = 3
const FLUSH_DEBOUNCE_MS = 200
const REALTIME_MIN_BACKOFF = 1000
const REALTIME_MAX_BACKOFF = 30000

// クラウド同期から除外するキー（ローカル専用）
const SYNC_EXCLUDE = new Set([
  // tf_gcal_user_tokens は意図的に同期する（端末を跨いで Google 連携を維持するため）。
  // 注意：anon RLS 設定では同一 workspace 内のメンバー全員が読める。
  'tf_backup_history',    // ローカル世代管理
  'tf_schemaVersion',     // ローカル管理
  'tf_workspace_id',      // ワークスペース設定自体
  'tf_client_id',         // ブラウザ固有
  'tf_cloud_enabled',     // ローカル設定
  'tf_currentUser',       // 端末・ブラウザごとに独立（他デバイスのログインで切り替わらないように）
  'tf_pending_pushes',    // キュー自身は同期しない（無限ループ防止）
  'tf_gcal_disconnected', // 「切れた通知を出したか」は端末・セッション固有（同期しない）
])

export const SYNC_EVENT = 'tf-cloud-sync'
export const STATUS_EVENT = 'tf-cloud-status'

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/**
 * スマートマージ：local-only のキーを保護した上で cloud を反映
 * - 両方 plain object なら：{...local, ...cloud}（cloud 優先、local-only は保持）
 * - それ以外（array, primitive, null）：cloud をそのまま採用
 */
function safeMerge(localValue, cloudValue) {
  if (!isPlainObject(localValue) || !isPlainObject(cloudValue)) return cloudValue
  return { ...localValue, ...cloudValue }
}

// ──────────────────────────────────────────────
// workspace_id / client_id：絶対に変わらないよう defensive に
// ──────────────────────────────────────────────
export function getWorkspaceId() {
  try {
    const raw = window.localStorage.getItem(WORKSPACE_KEY_LS)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (typeof parsed === 'string' && parsed.trim()) return parsed.trim()
    }
  } catch {}
  return DEFAULT_WORKSPACE
}

export function setWorkspaceId(id) {
  const safe = (id || '').trim() || DEFAULT_WORKSPACE
  window.localStorage.setItem(WORKSPACE_KEY_LS, JSON.stringify(safe))
}

export function getClientId() {
  try {
    const raw = window.localStorage.getItem(CLIENT_KEY_LS)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (typeof parsed === 'string' && parsed) return parsed
    }
  } catch {}
  const id = genId() + genId()
  window.localStorage.setItem(CLIENT_KEY_LS, JSON.stringify(id))
  return id
}

// ──────────────────────────────────────────────
// 状態管理
// ──────────────────────────────────────────────
let _channel = null
let _connected = false
let _lastSyncAt = null
let _lastError = null
let _pushing = 0
let _hasFailed = false  // 3 回失敗してユーザー操作待ち
let _realtimeBackoff = REALTIME_MIN_BACKOFF
let _realtimeRetryTimer = null

export function getSyncStatus() {
  return {
    connected: _connected,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    lastSyncAt: _lastSyncAt,
    workspaceId: getWorkspaceId(),
    clientId: getClientId(),
    pendingPushes: _pendingPushes.length + _pushing,
    lastError: _lastError,
    hasFailed: _hasFailed,
  }
}

function emitStatus() {
  try {
    window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: getSyncStatus() }))
  } catch {}
}

// ──────────────────────────────────────────────
// 永続キュー：tf_pending_pushes に保存し、再起動・クラッシュを跨いで生存
// ──────────────────────────────────────────────
// エントリの形：{ key, value, retries }
const _pendingPushes = []
let _flushTimer = null

function loadPersistedQueue() {
  try {
    const raw = window.localStorage.getItem(PENDING_QUEUE_LS)
    if (!raw) return
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return
    for (const entry of arr) {
      if (entry && typeof entry === 'object' && typeof entry.key === 'string') {
        _pendingPushes.push({
          key: entry.key,
          value: entry.value,
          retries: typeof entry.retries === 'number' ? entry.retries : 0,
        })
      }
    }
  } catch {}
}

function persistQueue() {
  try {
    if (_pendingPushes.length === 0) {
      window.localStorage.removeItem(PENDING_QUEUE_LS)
    } else {
      window.localStorage.setItem(PENDING_QUEUE_LS, JSON.stringify(_pendingPushes))
    }
  } catch {
    // localStorage 容量超過 — best effort で諦める（揮発キューは生きている）
  }
}

// ──────────────────────────────────────────────
// Push（書き込み）— debounce + キュー + 再読み込み
// ──────────────────────────────────────────────
export function queuePush(key, value) {
  if (SYNC_EXCLUDE.has(key)) return
  const idx = _pendingPushes.findIndex(p => p.key === key)
  const entry = { key, value, retries: 0 }  // 新しい変更はリトライをリセット
  if (idx >= 0) _pendingPushes[idx] = entry
  else _pendingPushes.push(entry)
  // 新しい変更が来たので失敗フラグはクリア（再試行のチャンス）
  if (_hasFailed) _hasFailed = false
  persistQueue()
  emitStatus()
  scheduleFlush()
}

function scheduleFlush() {
  if (_flushTimer) return
  _flushTimer = setTimeout(flushPending, FLUSH_DEBOUNCE_MS)
}

// 重要：push 直前に localStorage を再読し、debounce 中に realtime/手動で
// 更新された値があれば、最新を送る（古い queue 値で上書きしない）
function buildRowsFromBatch(batch, ws, myId) {
  return batch.map(p => {
    let latestValue = p.value
    try {
      const raw = window.localStorage.getItem(p.key)
      if (raw !== null) latestValue = JSON.parse(raw)
    } catch { /* fallback to queued value */ }
    return {
      workspace_id: ws,
      key: p.key,
      value: latestValue,
      client_id: myId,
      updated_at: new Date().toISOString(),
    }
  })
}

let _retryDelay = 1000
async function flushPending() {
  _flushTimer = null
  if (_pendingPushes.length === 0) return
  // ネットワーク不通なら飛ばさない（オンライン復帰で再開）
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    emitStatus()
    return
  }
  const batch = _pendingPushes.splice(0)
  _pushing += batch.length
  emitStatus()
  let failed = false
  try {
    const ws = getWorkspaceId()
    const myId = getClientId()
    const rows = buildRowsFromBatch(batch, ws, myId)
    const { error } = await supabase
      .from(TABLE)
      .upsert(rows, { onConflict: 'workspace_id,key' })
    if (error) {
      _lastError = error.message
      failed = true
      console.warn('[cloudSync] push failed', error.message)
    } else {
      _lastError = null
      _lastSyncAt = Date.now()
      _retryDelay = 1000
      _hasFailed = false
    }
  } catch (e) {
    _lastError = e.message || String(e)
    failed = true
    console.warn('[cloudSync] push exception', e)
  } finally {
    _pushing -= batch.length
    if (failed) {
      // リトライ回数を増やしてキューへ戻す。MAX_RETRIES 超は維持しつつ 'failed' 通知
      const stillRetryable = []
      let anyExhausted = false
      for (const item of batch) {
        const nextRetries = (item.retries || 0) + 1
        const next = { ...item, retries: nextRetries }
        if (nextRetries >= MAX_RETRIES) anyExhausted = true
        stillRetryable.push(next)
      }
      _pendingPushes.unshift(...stillRetryable)
      if (anyExhausted) _hasFailed = true
    }
    persistQueue()
    emitStatus()
    if (_pendingPushes.length > 0 && !_hasFailed) {
      if (failed) {
        _retryDelay = Math.min(_retryDelay * 2, 30000)
        setTimeout(scheduleFlush, _retryDelay)
      } else {
        scheduleFlush()
      }
    }
  }
}

/**
 * 手動再送（保存失敗バナーの「再送信」ボタンから呼ぶ）。
 * リトライ回数をリセットして即座にフラッシュする。
 */
export async function forceFlush() {
  for (const item of _pendingPushes) item.retries = 0
  _hasFailed = false
  _retryDelay = 1000
  persistQueue()
  if (_flushTimer) {
    clearTimeout(_flushTimer)
    _flushTimer = null
  }
  await flushPending()
  return getSyncStatus()
}

// ──────────────────────────────────────────────
// unload 時の同期送信：sendBeacon → fetch keepalive の順で試行
// ──────────────────────────────────────────────
function buildUnloadBody(rows) {
  return JSON.stringify(rows)
}

function flushOnUnload() {
  if (_pendingPushes.length === 0) return
  const batch = _pendingPushes.splice(0)
  const ws = getWorkspaceId()
  const myId = getClientId()
  const rows = buildRowsFromBatch(batch, ws, myId)
  const body = buildUnloadBody(rows)
  const url = `${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=workspace_id,key`

  // 1. navigator.sendBeacon を優先（iOS Safari でも確実）
  //    ただし sendBeacon はカスタムヘッダを送れないため Blob の type で Content-Type を渡し、
  //    認証ヘッダが必要な Supabase REST には到達しない。よって fetch + keepalive を本命にし、
  //    sendBeacon は最後の保険として残す（fetch 不可な環境向け）。
  let sent = false
  try {
    sent = fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body,
      keepalive: true,
    }) ? true : false
  } catch {
    sent = false
  }

  if (!sent && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([body], { type: 'application/json' })
      // 認証なしの POST。Supabase は anon キーをクエリでも受け付けないので、
      // ここは "Beacon が打てたかどうか" の保険のみ。届かないことも多い前提で、
      // 失敗してもキューは localStorage に残しておく（持ち越し）。
      navigator.sendBeacon(`${url}&apikey=${encodeURIComponent(SUPABASE_PUBLISHABLE_KEY)}`, blob)
    } catch { /* best effort */ }
  }

  // どちらにせよ、キューは localStorage に残しておく：
  // - keepalive fetch が成功するかはアンロード後にしか分からない
  // - 次回起動時に loadPersistedQueue + flushPending で確実に送り直す
  _pendingPushes.unshift(...batch)
  persistQueue()
}

// ──────────────────────────────────────────────
// Pull（読み込み）— スマートマージで local-only キーを保護
// ──────────────────────────────────────────────
async function applyCloudRows(rows) {
  let updated = 0
  const repushKeys = [] // local の方が完全だった場合は merge を cloud に戻す
  for (const row of rows || []) {
    if (SYNC_EXCLUDE.has(row.key)) continue

    let localValue = null
    let hasLocal = false
    try {
      const cur = window.localStorage.getItem(row.key)
      if (cur !== null) {
        localValue = JSON.parse(cur)
        hasLocal = true
      }
    } catch {}

    // スマートマージ：オブジェクトは local-only キーを保持
    const merged = hasLocal ? safeMerge(localValue, row.value) : row.value
    const mergedStr = JSON.stringify(merged)
    const currentStr = JSON.stringify(localValue)

    if (currentStr !== mergedStr) {
      window.localStorage.setItem(row.key, mergedStr)
      window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { key: row.key } }))
      updated++
    }

    // local-only のキーを保持した結果、cloud と異なれば再 push（cloud を補完）
    if (JSON.stringify(merged) !== JSON.stringify(row.value)) {
      repushKeys.push({ key: row.key, value: merged })
    }
  }
  // local-only キー保護のため再 push
  for (const r of repushKeys) queuePush(r.key, r.value)
  return updated
}

export async function pullAll() {
  try {
    const ws = getWorkspaceId()
    const { data, error } = await supabase
      .from(TABLE)
      .select('key, value, updated_at')
      .eq('workspace_id', ws)
    if (error) {
      _lastError = error.message
      emitStatus()
      console.warn('[cloudSync] pull failed', error.message)
      return { ok: false, updated: 0, error: error.message }
    }
    const updated = await applyCloudRows(data)
    _lastSyncAt = Date.now()
    _lastError = null
    emitStatus()
    return { ok: true, updated, count: data?.length || 0 }
  } catch (e) {
    _lastError = e.message || String(e)
    emitStatus()
    return { ok: false, updated: 0, error: _lastError }
  }
}

// 双方向マージ：クラウドから取得 + ローカルにしか無いキーを自動アップロード
export async function pullAndMerge() {
  try {
    const ws = getWorkspaceId()
    const myId = getClientId()
    const { data, error } = await supabase
      .from(TABLE)
      .select('key, value, updated_at')
      .eq('workspace_id', ws)
    if (error) {
      _lastError = error.message
      emitStatus()
      console.warn('[cloudSync] pullAndMerge failed', error.message)
      return { ok: false, error: error.message }
    }
    const cloudKeys = new Set((data || []).map(r => r.key))
    const updated = await applyCloudRows(data)

    // ローカルにしか無いキーを自動アップロード
    const toUpload = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (!k || !k.startsWith('tf_')) continue
      if (SYNC_EXCLUDE.has(k)) continue
      if (cloudKeys.has(k)) continue
      try {
        const raw = window.localStorage.getItem(k)
        if (raw === null) continue
        const value = JSON.parse(raw)
        toUpload.push({
          workspace_id: ws,
          key: k,
          value,
          client_id: myId,
          updated_at: new Date().toISOString(),
        })
      } catch {}
    }
    let uploaded = 0
    if (toUpload.length > 0) {
      const CHUNK = 50
      for (let i = 0; i < toUpload.length; i += CHUNK) {
        const chunk = toUpload.slice(i, i + CHUNK)
        const { error: upErr } = await supabase
          .from(TABLE)
          .upsert(chunk, { onConflict: 'workspace_id,key' })
        if (upErr) {
          console.warn('[cloudSync] auto-upload chunk failed', upErr.message)
          _lastError = upErr.message
          break
        }
        uploaded += chunk.length
      }
    }
    _lastSyncAt = Date.now()
    _lastError = null
    emitStatus()
    return { ok: true, pulled: data?.length || 0, updated, uploaded }
  } catch (e) {
    _lastError = e.message || String(e)
    emitStatus()
    return { ok: false, error: _lastError }
  }
}

// ──────────────────────────────────────────────
// 一括アップロード（手動移行用）— こちらも push 時に re-read
// ──────────────────────────────────────────────
export async function uploadAllLocal() {
  const ws = getWorkspaceId()
  const myId = getClientId()
  const rows = []
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i)
    if (!k || !k.startsWith('tf_')) continue
    if (SYNC_EXCLUDE.has(k)) continue
    try {
      const raw = window.localStorage.getItem(k)
      if (raw === null) continue
      const value = JSON.parse(raw)
      rows.push({
        workspace_id: ws,
        key: k,
        value,
        client_id: myId,
        updated_at: new Date().toISOString(),
      })
    } catch {}
  }
  if (rows.length === 0) return { ok: true, uploaded: 0 }
  const CHUNK = 50
  let uploaded = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await supabase
      .from(TABLE)
      .upsert(chunk, { onConflict: 'workspace_id,key' })
    if (error) {
      _lastError = error.message
      emitStatus()
      throw new Error(error.message)
    }
    uploaded += chunk.length
  }
  _lastSyncAt = Date.now()
  _lastError = null
  emitStatus()
  return { ok: true, uploaded }
}

// ──────────────────────────────────────────────
// Realtime 購読 — 切断後は指数バックオフで自動再接続
// ──────────────────────────────────────────────
function scheduleRealtimeReconnect() {
  if (_realtimeRetryTimer) return
  const delay = _realtimeBackoff
  _realtimeBackoff = Math.min(_realtimeBackoff * 2, REALTIME_MAX_BACKOFF)
  _realtimeRetryTimer = setTimeout(() => {
    _realtimeRetryTimer = null
    try {
      if (_channel) {
        try { supabase.removeChannel(_channel) } catch {}
        _channel = null
      }
      subscribeRealtime()
      // 再接続のタイミングで pull もかけて差分を取り込む
      pullAndMerge().catch(() => {})
      // 未送信があれば送る
      if (_pendingPushes.length > 0) scheduleFlush()
    } catch (e) {
      console.warn('[cloudSync] realtime reconnect failed', e)
      scheduleRealtimeReconnect()
    }
  }, delay)
}

export function subscribeRealtime() {
  if (_channel) return _channel
  const ws = getWorkspaceId()
  const myId = getClientId()
  _channel = supabase
    .channel(`taskflow:${ws}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: TABLE,
        filter: `workspace_id=eq.${ws}`,
      },
      payload => {
        const row = payload.new || payload.old
        if (!row || !row.key) return
        if (row.client_id === myId) return
        if (SYNC_EXCLUDE.has(row.key)) return
        if (payload.eventType === 'DELETE') {
          window.localStorage.removeItem(row.key)
          window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { key: row.key } }))
        } else {
          // スマートマージ：local-only キーを保護した上で cloud を反映
          let localValue = null
          let hasLocal = false
          try {
            const cur = window.localStorage.getItem(row.key)
            if (cur !== null) {
              localValue = JSON.parse(cur)
              hasLocal = true
            }
          } catch {}
          const merged = hasLocal ? safeMerge(localValue, row.value) : row.value
          const mergedStr = JSON.stringify(merged)
          const currentStr = JSON.stringify(localValue)
          if (currentStr === mergedStr) return
          window.localStorage.setItem(row.key, mergedStr)
          window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { key: row.key } }))
          // local-only キー保持で cloud と差がついたら補完 push
          if (JSON.stringify(merged) !== JSON.stringify(row.value)) {
            queuePush(row.key, merged)
          }
        }
        _lastSyncAt = Date.now()
        emitStatus()
      },
    )
    .subscribe(status => {
      const wasConnected = _connected
      _connected = status === 'SUBSCRIBED'
      if (_connected) {
        _realtimeBackoff = REALTIME_MIN_BACKOFF
        if (_realtimeRetryTimer) {
          clearTimeout(_realtimeRetryTimer)
          _realtimeRetryTimer = null
        }
        // 接続が回復したら未送信を送る
        if (_pendingPushes.length > 0) scheduleFlush()
      } else if (wasConnected && (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
        // 切断検知 → 再接続スケジュール
        scheduleRealtimeReconnect()
      }
      emitStatus()
    })
  return _channel
}

export function unsubscribeRealtime() {
  if (_realtimeRetryTimer) {
    clearTimeout(_realtimeRetryTimer)
    _realtimeRetryTimer = null
  }
  if (_channel) {
    try { supabase.removeChannel(_channel) } catch {}
    _channel = null
    _connected = false
    emitStatus()
  }
}

// ──────────────────────────────────────────────
// 初期化
// ──────────────────────────────────────────────
let _initialized = false
export async function initCloudSync() {
  if (_initialized) return
  _initialized = true

  // workspace_id を必ず一度書き込んで固定化（不正値・空値の混入防止）
  setWorkspaceId(getWorkspaceId())

  // 前回未送信のキューを復元 → 起動と同時に flush
  loadPersistedQueue()

  await pullAndMerge()
  subscribeRealtime()

  // 永続キューに残っていた未送信を送る
  if (_pendingPushes.length > 0) scheduleFlush()

  // ネット復帰時：再取得 + 滞留分の再送
  window.addEventListener('online', () => {
    _hasFailed = false   // ネット復帰で再試行のチャンス
    _retryDelay = 1000
    for (const item of _pendingPushes) item.retries = 0
    persistQueue()
    emitStatus()
    pullAndMerge()
    if (_pendingPushes.length > 0) scheduleFlush()
    // realtime が切れていれば再接続
    if (!_connected) scheduleRealtimeReconnect()
  })
  window.addEventListener('offline', () => emitStatus())

  // タブ閉じ/リロード/モバイルバックグラウンド時に未送信を確実に flush
  window.addEventListener('pagehide', flushOnUnload)
  window.addEventListener('beforeunload', flushOnUnload)
  // iOS Safari では pagehide も beforeunload も不安定なため visibilitychange で保険
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && _pendingPushes.length > 0) {
      flushOnUnload()
    }
  })
  // モバイル復帰時：未送信を再送
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (_pendingPushes.length > 0) scheduleFlush()
      if (!_connected) scheduleRealtimeReconnect()
    }
  })
}

export async function reconnectWithNewWorkspace() {
  unsubscribeRealtime()
  await pullAndMerge()
  subscribeRealtime()
}
