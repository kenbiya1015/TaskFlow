// クラウド同期エンジン（Supabase × localStorage の双方向同期）
// ──────────────────────────────────────────────
// データモデル：1キー = 1行（taskflow_kv テーブル）
//   workspace_id : 共有グループ識別子（同じIDなら同じデータを見る）
//   key          : tf_xxx
//   value        : jsonb
//   client_id    : 書き込んだブラウザ識別子（自分の書き込みは無視するため）
//   updated_at   : 最終更新時刻
//
// フロー：
//   - useLocalStorage が変更されると queuePush() が呼ばれ、debounce 後に Supabase へ
//   - Realtime で他クライアントの変更を受信 → localStorage 更新 → 'tf-cloud-sync' イベント
//   - useLocalStorage がイベントを受け取って再描画
//
// オフライン対応：
//   - オフライン時は pushKey が失敗 → _pendingFailed に積み、online イベントで再送
//   - 起動時に pullAll() してクラウドの最新状態を取得

import { supabase } from './supabase'

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

export function getWorkspaceId() {
  try {
    const raw = window.localStorage.getItem(WORKSPACE_KEY_LS)
    if (raw) return JSON.parse(raw)
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
    if (raw) return JSON.parse(raw)
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
// Push（書き込み）— debounce + キュー
// ──────────────────────────────────────────────
const _pendingPushes = []
let _flushTimer = null

export function queuePush(key, value) {
  if (SYNC_EXCLUDE.has(key)) return
  // 同じキーの古いものを置き換え
  const idx = _pendingPushes.findIndex(p => p.key === key)
  const entry = { key, value }
  if (idx >= 0) _pendingPushes[idx] = entry
  else _pendingPushes.push(entry)
  emitStatus()
  scheduleFlush()
}

function scheduleFlush() {
  if (_flushTimer) return
  _flushTimer = setTimeout(flushPending, 350)
}

async function flushPending() {
  _flushTimer = null
  if (_pendingPushes.length === 0) return
  const batch = _pendingPushes.splice(0)
  _pushing += batch.length
  emitStatus()
  try {
    const ws = getWorkspaceId()
    const myId = getClientId()
    const rows = batch.map(p => ({
      workspace_id: ws,
      key: p.key,
      value: p.value,
      client_id: myId,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase
      .from(TABLE)
      .upsert(rows, { onConflict: 'workspace_id,key' })
    if (error) {
      _lastError = error.message
      // 失敗したら戻して再送
      _pendingPushes.unshift(...batch)
      console.warn('[cloudSync] push failed', error.message)
    } else {
      _lastError = null
      _lastSyncAt = Date.now()
    }
  } catch (e) {
    _lastError = e.message || String(e)
    _pendingPushes.unshift(...batch)
    console.warn('[cloudSync] push exception', e)
  } finally {
    _pushing -= batch.length
    emitStatus()
    if (_pendingPushes.length > 0) {
      // まだ残ってる場合は再スケジュール
      setTimeout(scheduleFlush, 2000)
    }
  }
}

// ──────────────────────────────────────────────
// Pull（読み込み）
// ──────────────────────────────────────────────
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
    let updated = 0
    for (const row of data || []) {
      if (SYNC_EXCLUDE.has(row.key)) continue
      const serialized = JSON.stringify(row.value)
      const current = window.localStorage.getItem(row.key)
      if (current === serialized) continue
      window.localStorage.setItem(row.key, serialized)
      window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { key: row.key } }))
      updated++
    }
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

// ──────────────────────────────────────────────
// 一括アップロード（移行用）
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
    } catch { /* skip invalid */ }
  }
  if (rows.length === 0) return { ok: true, uploaded: 0 }
  // 大量行は分割
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
        if (row.client_id === myId) return        // 自分の書き込みは無視
        if (SYNC_EXCLUDE.has(row.key)) return
        if (payload.eventType === 'DELETE') {
          window.localStorage.removeItem(row.key)
        } else {
          const serialized = JSON.stringify(row.value)
          const current = window.localStorage.getItem(row.key)
          if (current === serialized) return
          window.localStorage.setItem(row.key, serialized)
        }
        window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { key: row.key } }))
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

  // 起動時に最新を取得
  await pullAll()
  // Realtime 購読開始
  subscribeRealtime()

  // ネット復帰時：再取得 + 滞留分の再送
  window.addEventListener('online', () => {
    emitStatus()
    pullAll()
    if (_pendingPushes.length > 0) scheduleFlush()
  })
  window.addEventListener('offline', () => emitStatus())
}

export async function reconnectWithNewWorkspace() {
  unsubscribeRealtime()
  await pullAll()
  subscribeRealtime()
}
