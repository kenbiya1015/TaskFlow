// クラウド同期エンジン（Supabase × localStorage の双方向同期）
// ──────────────────────────────────────────────
// データモデル：1キー = 1行（taskflow_kv テーブル）
//   workspace_id : 共有グループ識別子（同じIDなら同じデータを見る）
//   key          : tf_xxx
//   value        : jsonb
//   client_id    : 書き込んだブラウザ識別子（自分の書き込みは無視するため）
//   updated_at   : 最終更新時刻
//
// データ消失を防ぐための安全策（v2）：
//   1. Pull 時の「スマートマージ」：オブジェクト型データは local と cloud を融合し、
//      local-only のキー（他ユーザーのスロット等）を保護する。
//   2. Push 時の「再読み込み」：debounce 中に他端末からの realtime で local が
//      更新された場合に備え、push 直前に localStorage を再読し最新値を送る。
//   3. unload 時の keepalive 送信：タブ閉じ/リロード時に未送信 push を
//      navigator.sendBeacon 同等の keepalive fetch で送り切る。
//   4. workspace_id の固定化：DEFAULT_WORKSPACE を常に使用、空値・不正値は無視。

import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase'

const TABLE = 'taskflow_kv'
const DEFAULT_WORKSPACE = 'kenbiya-default'
const WORKSPACE_KEY_LS = 'tf_workspace_id'
const CLIENT_KEY_LS = 'tf_client_id'

// クラウド同期から除外するキー（ローカル専用）
const SYNC_EXCLUDE = new Set([
  'tf_gcal_user_tokens',  // OAuth トークンは端末ごと
  'tf_backup_history',    // ローカル世代管理
  'tf_schemaVersion',     // ローカル管理
  'tf_workspace_id',      // ワークスペース設定自体
  'tf_client_id',         // ブラウザ固有
  'tf_cloud_enabled',     // ローカル設定
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

export function getSyncStatus() {
  return {
    connected: _connected,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    lastSyncAt: _lastSyncAt,
    workspaceId: getWorkspaceId(),
    clientId: getClientId(),
    pendingPushes: _pendingPushes.length + _pushing,
    lastError: _lastError,
  }
}

function emitStatus() {
  try {
    window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: getSyncStatus() }))
  } catch {}
}

// ──────────────────────────────────────────────
// Push（書き込み）— debounce + キュー + 再読み込み
// ──────────────────────────────────────────────
const _pendingPushes = []
let _flushTimer = null

export function queuePush(key, value) {
  if (SYNC_EXCLUDE.has(key)) return
  const idx = _pendingPushes.findIndex(p => p.key === key)
  const entry = { key, value }
  if (idx >= 0) _pendingPushes[idx] = entry
  else _pendingPushes.push(entry)
  emitStatus()
  scheduleFlush()
}

function scheduleFlush() {
  if (_flushTimer) return
  _flushTimer = setTimeout(flushPending, 200)
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
      _pendingPushes.unshift(...batch)
      failed = true
      console.warn('[cloudSync] push failed', error.message)
    } else {
      _lastError = null
      _lastSyncAt = Date.now()
      _retryDelay = 1000
    }
  } catch (e) {
    _lastError = e.message || String(e)
    _pendingPushes.unshift(...batch)
    failed = true
    console.warn('[cloudSync] push exception', e)
  } finally {
    _pushing -= batch.length
    emitStatus()
    if (_pendingPushes.length > 0) {
      if (failed) {
        _retryDelay = Math.min(_retryDelay * 2, 30000)
        setTimeout(scheduleFlush, _retryDelay)
      } else {
        scheduleFlush()
      }
    }
  }
}

// ──────────────────────────────────────────────
// unload 時の同期送信：未送信を keepalive fetch で送り切る
// ──────────────────────────────────────────────
function flushOnUnload() {
  if (_pendingPushes.length === 0) return
  const batch = _pendingPushes.splice(0)
  const ws = getWorkspaceId()
  const myId = getClientId()
  const rows = buildRowsFromBatch(batch, ws, myId)
  try {
    // fetch + keepalive：ページ離脱後もブラウザがバックグラウンド送信
    fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=workspace_id,key`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
      keepalive: true,
    })
  } catch { /* best effort */ }
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
// Realtime 購読
// ──────────────────────────────────────────────
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
      _connected = status === 'SUBSCRIBED'
      emitStatus()
    })
  return _channel
}

export function unsubscribeRealtime() {
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

  await pullAndMerge()
  subscribeRealtime()

  // ネット復帰時：再取得 + 滞留分の再送
  window.addEventListener('online', () => {
    emitStatus()
    pullAndMerge()
    if (_pendingPushes.length > 0) scheduleFlush()
  })
  window.addEventListener('offline', () => emitStatus())

  // タブ閉じ/リロード/モバイルバックグラウンド時に未送信を確実に flush
  window.addEventListener('pagehide', flushOnUnload)
  window.addEventListener('beforeunload', flushOnUnload)
  // モバイルではタブ切替も pagehide にならない場合があるので visibilitychange でも保険
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && _pendingPushes.length > 0) {
      flushOnUnload()
    }
  })
}

export async function reconnectWithNewWorkspace() {
  unsubscribeRealtime()
  await pullAndMerge()
  subscribeRealtime()
}
