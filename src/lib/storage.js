/*
  TaskFlow データストレージ層
  ──────────────────────────────────────────────
  すべての永続データは window.localStorage の "tf_*" キーに JSON 形式で保存。
  将来 Supabase / Firebase 等のクラウド DB に移行する場合は、
  本ファイルの getItem / setItem / DATA_KEYS をリモート呼び出しに差し替え、
  あとは（useLocalStorage を含めて）API を維持すれば既存コンポーネントは無修正で動作。

  - SCHEMA_VERSION   : データ形式のバージョン。互換性のないスキーマ変更時に +1。
  - runMigrations()  : 起動時に一度だけ呼ばれ、古いスキーマを最新形式へ書き換える。
  - KEY_RENAMES      : 単純なキー名変更を宣言的に列挙。起動毎に自動で適用される。
  - autoBackup()     : 起動時にデータのスナップショットを localStorage に保存（履歴最大5世代）。
  - exportAll()      : 全データを 1 つの JSON にまとめてエクスポート。
  - importAll()      : エクスポート JSON を読み込んで復元（上書き / マージ可）。

  キーを変更したい時の手順（将来のリネームを安全に行うため）：
    1. DATA_KEYS に「新キー」を追加（旧キーは残しておくとさらに安全）
    2. KEY_RENAMES に ['tf_old', 'tf_new'] を追記
    3. コードで「新キー」を読み書きする
    4. SCHEMA_VERSION を +1
       → 次回起動時に applyKeyRenames() が自動で旧→新へコピーし、旧キーを削除
*/

export const DATA_KEYS = [
  'tf_currentUser',
  'tf_tasks',
  'tf_schedule',
  'tf_ideas',
  'tf_sns',
  'tf_mtmemos',
  'tf_partners',
  'tf_members',
  'tf_yearGoals',
  'tf_goalYears',
  'tf_vision',
  'tf_being',
  'tf_future',
  'tf_strategies',
  'tf_strategy_overall',
  'tf_daily_routine',
  'tf_gcal_clientId',
  // 認証トークン（tf_gcal_user_tokens）はエクスポート対象外（セキュリティ）
  'tf_gcal_user_events',
]

const SCHEMA_VERSION = 3
const VERSION_KEY = 'tf_schemaVersion'

// 自動バックアップ関連
const BACKUP_HISTORY_KEY = 'tf_backup_history' // DATA_KEYS には含めない（無限ループ防止）
const BACKUP_MAX = 5
const BACKUP_MIN_INTERVAL_MS = 60 * 60 * 1000 // 1時間以内は重複保存しない

// 旧キー名 → 新キー名（単純リネーム用。形を変える場合は migrateXtoY を使う）
// 例: ['tf_oldName', 'tf_newName']
const KEY_RENAMES = [
  // 現状は migrateV2toV3 で gcal 系を扱っているのでここは空。
  // 将来キーを安全にリネームしたい時はここに追記するだけで自動移行される。
]

export function exportAll() {
  const out = {
    __app: 'TaskFlow',
    __version: SCHEMA_VERSION,
    __exportedAt: new Date().toISOString(),
    data: {},
  }
  DATA_KEYS.forEach(k => {
    const v = window.localStorage.getItem(k)
    if (v === null) return
    try { out.data[k] = JSON.parse(v) } catch { out.data[k] = v }
  })
  return out
}

export function downloadExport() {
  const out = exportAll()
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  a.download = `taskflow-backup-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function importAll(payload, { merge = false } = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('無効なバックアップファイルです')
  }
  const data = payload.data || (payload.__app ? null : payload)
  if (!data || typeof data !== 'object') {
    throw new Error('"data" フィールドが見つかりません')
  }
  // バックアップに含まれる旧キーを自動的に新キーへ寄せる
  const transformed = transformBackupData(data)
  if (!merge) {
    DATA_KEYS.forEach(k => window.localStorage.removeItem(k))
  }
  Object.entries(transformed).forEach(([k, v]) => {
    if (!DATA_KEYS.includes(k)) return // 未知キーは無視（安全側）
    window.localStorage.setItem(k, JSON.stringify(v))
  })
  // 復元後は最新スキーマに整合させる（古いバックアップでも自動マイグレーション）
  try {
    window.localStorage.setItem(VERSION_KEY, '0')
    runMigrations()
  } catch { /* ignore */ }
}

function transformBackupData(rawData) {
  const out = { ...rawData }
  KEY_RENAMES.forEach(([oldKey, newKey]) => {
    if (oldKey in out && !(newKey in out)) {
      out[newKey] = out[oldKey]
    }
    delete out[oldKey]
  })
  return out
}

/**
 * 起動時 1 回だけ呼ぶ。古いスキーマを最新スキーマへ書き換える。
 * - KEY_RENAMES に基づく単純なリネームは毎回適用（冪等）
 * - SCHEMA_VERSION 未満なら段階的に migrateVNtoVN+1() を実行
 */
export function runMigrations() {
  applyKeyRenames()
  const current = Number(window.localStorage.getItem(VERSION_KEY) || 0)
  if (current >= SCHEMA_VERSION) return
  if (current < 2) migrateV1toV2()
  if (current < 3) migrateV2toV3()
  window.localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION))
}

function applyKeyRenames() {
  KEY_RENAMES.forEach(([oldKey, newKey]) => {
    try {
      const oldVal = window.localStorage.getItem(oldKey)
      if (oldVal === null) return
      const newVal = window.localStorage.getItem(newKey)
      if (newVal === null) {
        window.localStorage.setItem(newKey, oldVal)
      }
      window.localStorage.removeItem(oldKey)
    } catch { /* ignore */ }
  })
}

function migrateV1toV2() {
  // SNS ステータスのリネーム: 下書き → 確定 / 投稿済 → 投稿済み
  try {
    const raw = window.localStorage.getItem('tf_sns')
    if (raw) {
      const list = JSON.parse(raw)
      if (Array.isArray(list)) {
        const updated = list.map(p => ({
          ...p,
          status:
            p.status === '下書き' ? '確定' :
            p.status === '投稿済' ? '投稿済み' :
            p.status,
        }))
        window.localStorage.setItem('tf_sns', JSON.stringify(updated))
      }
    }
  } catch { /* ignore */ }
}

/**
 * V2 → V3: Google Calendar 連携のキーをユーザー別構造に移行
 *   tf_gcal_token   (単一)              → tf_gcal_user_tokens { [user]: token }
 *   tf_gcal_events  ({date: events[]})  → tf_gcal_user_events { [user]: {date: events[]} }
 * 現在のユーザー（tf_currentUser）の枠に既存データを退避する。
 */
function migrateV2toV3() {
  try {
    let currentUser = null
    try { currentUser = JSON.parse(window.localStorage.getItem('tf_currentUser') || 'null') } catch {}
    if (!currentUser || typeof currentUser !== 'string') currentUser = '志村直紀' // フォールバック

    // tf_gcal_token → tf_gcal_user_tokens
    const oldTokenRaw = window.localStorage.getItem('tf_gcal_token')
    if (oldTokenRaw && !window.localStorage.getItem('tf_gcal_user_tokens')) {
      try {
        const t = JSON.parse(oldTokenRaw)
        if (t && t.access_token) {
          window.localStorage.setItem(
            'tf_gcal_user_tokens',
            JSON.stringify({ [currentUser]: t }),
          )
        }
      } catch {}
      window.localStorage.removeItem('tf_gcal_token')
    }

    // tf_gcal_events → tf_gcal_user_events
    const oldEventsRaw = window.localStorage.getItem('tf_gcal_events')
    if (oldEventsRaw && !window.localStorage.getItem('tf_gcal_user_events')) {
      try {
        const e = JSON.parse(oldEventsRaw)
        if (e && typeof e === 'object') {
          window.localStorage.setItem(
            'tf_gcal_user_events',
            JSON.stringify({ [currentUser]: e }),
          )
        }
      } catch {}
      window.localStorage.removeItem('tf_gcal_events')
    }
  } catch { /* ignore */ }
}

// ──────────────────────────────────────────────
// 自動バックアップ（localStorage 内に世代管理で保存）
// ──────────────────────────────────────────────

/**
 * 起動時に呼ばれて、現在のデータのスナップショットを履歴に保存する。
 * - 直近のバックアップから BACKUP_MIN_INTERVAL_MS 以内なら保存しない
 * - 直近のバックアップと完全に同じ内容なら保存しない
 * - 履歴は新しいもの順に最大 BACKUP_MAX 件保持
 * - DATA_KEYS が空（初回起動）なら保存しない
 */
export function autoBackup({ force = false } = {}) {
  try {
    const snapshot = exportAll()
    const dataStr = JSON.stringify(snapshot.data || {})
    if (dataStr === '{}') return false // 保存すべきデータがない

    const history = loadBackupHistory()
    const last = history[0]
    const now = Date.now()

    if (!force && last && now - last.timestamp < BACKUP_MIN_INTERVAL_MS) return false
    if (!force && last && JSON.stringify(last.data) === dataStr) return false

    const entry = {
      timestamp: now,
      version: snapshot.__version,
      data: snapshot.data,
    }
    const next = [entry, ...history].slice(0, BACKUP_MAX)
    saveBackupHistory(next)
    return true
  } catch (e) {
    console.warn('[autoBackup] 失敗:', e)
    return false
  }
}

function loadBackupHistory() {
  try {
    const raw = window.localStorage.getItem(BACKUP_HISTORY_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function saveBackupHistory(history) {
  try {
    window.localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(history))
  } catch (e) {
    // 容量超過の可能性 → 履歴を半分に減らして再挑戦
    try {
      const trimmed = history.slice(0, Math.max(1, Math.floor(history.length / 2)))
      window.localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(trimmed))
    } catch { /* give up */ }
  }
}

export function listAutoBackups() {
  return loadBackupHistory().map(b => ({
    timestamp: b.timestamp,
    version: b.version,
    keyCount: Object.keys(b.data || {}).length,
    sizeBytes: JSON.stringify(b.data || {}).length,
  }))
}

export function restoreAutoBackup(timestamp, { merge = false } = {}) {
  const history = loadBackupHistory()
  const entry = history.find(b => b.timestamp === timestamp)
  if (!entry) throw new Error('指定したバックアップが見つかりません')
  importAll({ __app: 'TaskFlow', __version: entry.version, data: entry.data }, { merge })
}

export function deleteAutoBackup(timestamp) {
  const history = loadBackupHistory()
  const next = history.filter(b => b.timestamp !== timestamp)
  saveBackupHistory(next)
}

export function clearAutoBackups() {
  try { window.localStorage.removeItem(BACKUP_HISTORY_KEY) } catch {}
}

/**
 * サンプルデータを localStorage に投入する。
 * mode = 'merge' : 既存データを残し、空のキーだけ埋める
 * mode = 'reset' : 既存データを上書きして初期状態に戻す
 */
export function restoreSampleData(mode = 'merge') {
  // 循環インポートを避けるため動的 import
  return import('../data/sampleData.js').then(({ SAMPLE_DATA }) => {
    Object.entries(SAMPLE_DATA).forEach(([key, value]) => {
      if (mode === 'reset') {
        window.localStorage.setItem(key, JSON.stringify(value))
      } else {
        // マージ：既存データが空 or 無いキーだけセット
        const existing = window.localStorage.getItem(key)
        const isEmpty =
          existing === null ||
          existing === '' ||
          existing === '[]' ||
          existing === '{}' ||
          existing === 'null'
        if (isEmpty) {
          window.localStorage.setItem(key, JSON.stringify(value))
        } else if (Array.isArray(value)) {
          // 配列は中身を結合（id 重複を避ける）
          try {
            const cur = JSON.parse(existing)
            if (Array.isArray(cur)) {
              const ids = new Set(cur.map(x => x && x.id).filter(Boolean))
              const merged = [...cur, ...value.filter(x => !ids.has(x.id))]
              window.localStorage.setItem(key, JSON.stringify(merged))
            }
          } catch {}
        }
        // オブジェクト型キーで既存ありの場合はそのまま温存
      }
    })
  })
}
