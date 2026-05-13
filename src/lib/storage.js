/*
  TaskFlow データストレージ層
  ──────────────────────────────────────────────
  すべての永続データは window.localStorage の "tf_*" キーに JSON 形式で保存。
  将来 Supabase / Firebase 等のクラウド DB に移行する場合は、
  本ファイルの getItem / setItem / DATA_KEYS をリモート呼び出しに差し替え、
  あとは（useLocalStorage を含めて）API を維持すれば既存コンポーネントは無修正で動作。

  - SCHEMA_VERSION：データ形式のバージョン。互換性のないスキーマ変更時に +1。
  - runMigrations()：起動時に一度だけ呼ばれ、古いスキーマを新形式へ書き換える。
  - exportAll()/downloadExport()：全データを 1 つの JSON にまとめてバックアップ。
  - importAll()：エクスポートした JSON を読み込んで復元（上書き / マージ可）。
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
  'tf_gcal_clientId',
  // 認証トークンはエクスポート対象外（セキュリティ）
  'tf_gcal_events',
]

const SCHEMA_VERSION = 2
const VERSION_KEY = 'tf_schemaVersion'

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
  if (!merge) {
    DATA_KEYS.forEach(k => window.localStorage.removeItem(k))
  }
  Object.entries(data).forEach(([k, v]) => {
    if (!DATA_KEYS.includes(k)) return // 未知キーは無視（安全側）
    window.localStorage.setItem(k, typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v))
  })
}

/**
 * 起動時 1 回だけ呼ぶ。古いスキーマを最新スキーマへ書き換える。
 */
export function runMigrations() {
  const current = Number(window.localStorage.getItem(VERSION_KEY) || 0)
  if (current >= SCHEMA_VERSION) return
  if (current < 2) migrateV1toV2()
  window.localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION))
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
