import { useRef, useState, useEffect } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { MEMBERS } from '../members'
import {
  downloadExport,
  importAll,
  restoreSampleData,
  DATA_KEYS,
  listAutoBackups,
  restoreAutoBackup,
  deleteAutoBackup,
  autoBackup,
} from '../lib/storage'
import {
  getSyncStatus,
  setWorkspaceId,
  reconnectWithNewWorkspace,
  uploadAllLocal,
  pullAll,
  STATUS_EVENT,
} from '../lib/cloudSync'
import { SUPABASE_URL } from '../lib/supabase'
import { GCAL_CLIENT_ID } from '../config'

export default function Settings({ currentUser, onChangeUser, onLogout }) {
  const [members, setMembers] = useLocalStorage('tf_members', MEMBERS)
  const fileRef = useRef(null)
  const [importInfo, setImportInfo] = useState('')
  const [importError, setImportError] = useState('')
  const [sampleInfo, setSampleInfo] = useState('')
  const [sampleError, setSampleError] = useState('')
  const [backupInfo, setBackupInfo] = useState('')
  const [backupError, setBackupError] = useState('')
  const [backupTick, setBackupTick] = useState(0)
  const backups = listAutoBackups()

  // クラウド同期
  const [cloudStatus, setCloudStatus] = useState(getSyncStatus())
  const [wsDraft, setWsDraft] = useState(cloudStatus.workspaceId)
  const [wsMsg, setWsMsg] = useState('')
  const [wsErr, setWsErr] = useState('')
  const [wsBusy, setWsBusy] = useState(false)

  useEffect(() => {
    const handler = (e) => setCloudStatus(e.detail || getSyncStatus())
    window.addEventListener(STATUS_EVENT, handler)
    return () => window.removeEventListener(STATUS_EVENT, handler)
  }, [])

  const handleSaveWorkspace = async () => {
    setWsErr(''); setWsMsg('')
    const next = (wsDraft || '').trim()
    if (!next) { setWsErr('ワークスペースIDを入力してください'); return }
    if (!confirm(`ワークスペースを "${next}" に切り替えます。\nクラウド側に同じIDのデータがあれば取得、無ければ空から始まります。\n続行しますか？`)) return
    setWsBusy(true)
    try {
      setWorkspaceId(next)
      await reconnectWithNewWorkspace()
      setCloudStatus(getSyncStatus())
      setWsMsg(`ワークスペースを ${next} に切り替えました`)
    } catch (e) {
      setWsErr(`切り替え失敗: ${e.message || e}`)
    } finally {
      setWsBusy(false)
    }
  }

  const handleUpload = async () => {
    setWsErr(''); setWsMsg('')
    if (!confirm('現在の localStorage 全データをクラウドへアップロードします。続行しますか？')) return
    setWsBusy(true)
    try {
      const r = await uploadAllLocal()
      setWsMsg(`${r.uploaded} 件アップロードしました`)
    } catch (e) {
      setWsErr(`アップロード失敗: ${e.message || e}`)
    } finally {
      setWsBusy(false)
    }
  }

  const handlePull = async () => {
    setWsErr(''); setWsMsg('')
    setWsBusy(true)
    try {
      const r = await pullAll()
      if (r.ok) setWsMsg(`同期しました（${r.updated} 件更新／${r.count} 件取得）`)
      else setWsErr(`取得失敗: ${r.error}`)
    } finally {
      setWsBusy(false)
    }
  }

  const handleManualBackup = () => {
    setBackupError(''); setBackupInfo('')
    try {
      const ok = autoBackup({ force: true })
      if (ok) {
        setBackupInfo('スナップショットを保存しました')
        setBackupTick(t => t + 1)
      } else {
        setBackupError('保存すべきデータがありません')
      }
    } catch (e) {
      setBackupError(`保存失敗: ${e.message || e}`)
    }
  }

  const handleRestoreBackup = (timestamp, label) => {
    if (!confirm(`${label} のバックアップから復元します。現在のデータにマージされます（既存データは温存）。続行しますか？`)) return
    try {
      autoBackup({ force: true })
      restoreAutoBackup(timestamp, { merge: true })
      setBackupInfo('復元しました。再読み込みします...')
      setTimeout(() => location.reload(), 800)
    } catch (e) {
      setBackupError(`復元失敗: ${e.message || e}`)
    }
  }

  const handleRestoreBackupOverwrite = (timestamp, label) => {
    if (!confirm(`⚠ ${label} のバックアップで現在のデータを完全に上書きします。\n本当によろしいですか？（事前にエクスポートを推奨）`)) return
    try {
      autoBackup({ force: true })
      restoreAutoBackup(timestamp, { merge: false })
      setBackupInfo('上書き復元しました。再読み込みします...')
      setTimeout(() => location.reload(), 800)
    } catch (e) {
      setBackupError(`復元失敗: ${e.message || e}`)
    }
  }

  const handleDeleteBackup = (timestamp, label) => {
    if (!confirm(`${label} のバックアップを削除します。よろしいですか？`)) return
    deleteAutoBackup(timestamp)
    setBackupInfo(`${label} を削除しました`)
    setBackupTick(t => t + 1)
  }

  const updateMember = (id, patch) => {
    setMembers(members.map(m => m.id === id ? { ...m, ...patch } : m))
  }

  const clearData = key => {
    if (!confirm(`localStorage の "${key}" を削除します。よろしいですか？`)) return
    window.localStorage.removeItem(key)
    location.reload()
  }

  const handleRestoreSample = async (mode) => {
    setSampleError(''); setSampleInfo('')
    const msg = mode === 'reset'
      ? '⚠ 既存のタスク・アイデア・MTメモなどを上書きしてサンプルデータに戻します。\n本当によろしいですか？（バックアップ済みであることを確認してください）'
      : '空になっているデータだけサンプルで埋めます。既存データは保持されます。続行しますか？'
    if (!confirm(msg)) return
    try {
      await restoreSampleData(mode)
      setSampleInfo(`サンプルデータを${mode === 'reset' ? '初期化投入' : 'マージ投入'}しました。再読み込みします...`)
      setTimeout(() => location.reload(), 800)
    } catch (e) {
      setSampleError(`サンプル投入失敗: ${e.message || e}`)
    }
  }

  const handleImport = async (merge) => {
    setImportError(''); setImportInfo('')
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setImportError('ファイルを選択してください')
      return
    }
    if (!merge && !confirm('現在のデータを上書きします。事前にエクスポートでバックアップを取りましたか？ よろしいですか？')) {
      return
    }
    try {
      const text = await file.text()
      const payload = JSON.parse(text)
      importAll(payload, { merge })
      setImportInfo('インポート完了。ページを再読み込みします...')
      setTimeout(() => location.reload(), 800)
    } catch (e) {
      setImportError(`インポート失敗: ${e.message}`)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">設定</div>
          <div className="page-subtitle">SETTINGS</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">⚙️ 現在のユーザー</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
          <div className="member-avatar" style={{ width: 48, height: 48, fontSize: 18, marginBottom: 0 }}>
            {(MEMBERS.find(m => m.name === currentUser) || {}).initial || '?'}
          </div>
          <div>
            <div style={{ fontWeight: 600 }}>{currentUser}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {(MEMBERS.find(m => m.name === currentUser) || {}).role || ''}
            </div>
          </div>
        </div>
        <div className="form-row">
          <select className="select" value={currentUser} onChange={e => onChangeUser(e.target.value)}>
            {MEMBERS.map(m => <option key={m.id} value={m.name}>{m.name}（{m.role}）</option>)}
          </select>
          <button className="btn btn-secondary" onClick={onLogout}>ログアウト</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">👥 メンバー情報</div>
        {members.map(m => (
          <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 8, marginBottom: 10, alignItems: 'center' }}>
            <div style={{ fontWeight: 600 }}>{m.name}</div>
            <input
              className="text-input"
              value={m.role}
              onChange={e => updateMember(m.id, { role: e.target.value })}
            />
            <input
              type="color"
              value={m.color}
              onChange={e => updateMember(m.id, { color: e.target.value })}
              style={{ width: 60, height: 32, padding: 0, border: '1px solid var(--border)', borderRadius: 6 }}
            />
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">📅 Google カレンダー連携</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.7 }}>
          クライアント ID は本アプリに <strong>組み込み済み</strong> です。<br />
          実際の接続はスケジュール画面の「📅 Googleカレンダー連携」ボタンから、<strong>メンバーごとに個別</strong>に行えます。<br />
          各メンバーは自分の Google アカウントでログインし、今日・明日のスケジュールを自動取得します。<br />
          <br />
          <strong>事前準備（管理者のみ）</strong>：Google Cloud Console の OAuth クライアント設定で、
          「承認済みの JavaScript 生成元」に以下を登録してください：
          <ul style={{ marginTop: 6, marginBottom: 6, paddingLeft: 18 }}>
            <li><code>{location.origin}</code>（現在のオリジン）</li>
            <li><code>https://task-flow-khaki-one.vercel.app</code>（本番）</li>
            <li><code>http://localhost:5173</code>（ローカル開発）</li>
          </ul>
          スコープ: <code>calendar.readonly</code> ／ 必要 API: <code>Google Calendar API</code>
        </div>
        <div style={{
          fontSize: 11, padding: '8px 10px', background: 'var(--surface-2)',
          borderRadius: 6, marginBottom: 10, color: 'var(--text-muted)',
          fontFamily: 'monospace', wordBreak: 'break-all',
        }}>
          埋め込み済みクライアント ID: {GCAL_CLIENT_ID}
        </div>
        <GoogleClientIdField />
      </div>

      <div className="card">
        <div className="card-title">💾 バックアップ / 復元</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.7 }}>
          現在の全データ（{DATA_KEYS.length}種類）を 1 つの JSON ファイルとして書き出し／読み込みできます。<br />
          <strong>デプロイ前後・ブラウザ移行・端末交換の際は必ずエクスポートを保存してください。</strong><br />
          <span style={{ color: 'var(--text-muted)' }}>
            ※ Web ブラウザの localStorage はドメインごとに保存されるため、URL が変わるとデータは引き継がれません。
          </span>
        </div>
        <div className="form-row" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn" onClick={downloadExport}>⬇ エクスポート（JSON）</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ fontSize: 12 }}
          />
          <button className="btn btn-secondary" onClick={() => handleImport(true)}>マージ復元</button>
          <button className="btn btn-secondary" onClick={() => handleImport(false)}>上書き復元</button>
        </div>
        {importInfo && <div style={{ color: 'var(--success)', fontSize: 13, marginTop: 8 }}>{importInfo}</div>}
        {importError && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{importError}</div>}
      </div>

      <div className="card cloud-sync-card">
        <div className="card-title">
          ☁ クラウド同期 / Supabase
          <span style={{ float: 'right', fontSize: 11, fontWeight: 400 }}>
            {!cloudStatus.online && <span className="cloud-pill cloud-pill-offline">オフライン</span>}
            {cloudStatus.online && cloudStatus.connected && <span className="cloud-pill cloud-pill-online">● 接続中</span>}
            {cloudStatus.online && !cloudStatus.connected && <span className="cloud-pill cloud-pill-connecting">接続待機中</span>}
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.7 }}>
          スマホ・PC・他メンバー間でリアルタイム同期します。<br />
          接続先: <code>{SUPABASE_URL}</code><br />
          現在のクライアントID（同期判別用）: <code style={{ fontSize: 10 }}>{cloudStatus.clientId?.slice(0, 16)}...</code><br />
          {cloudStatus.lastSyncAt && (
            <>最終同期: {new Date(cloudStatus.lastSyncAt).toLocaleString('ja-JP')}<br /></>
          )}
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-soft)', marginBottom: 6 }}>
            ワークスペースID（同じIDの人と同じデータを共有します）
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <input
              className="text-input"
              value={wsDraft}
              onChange={e => setWsDraft(e.target.value)}
              placeholder="例: kenbiya-default"
            />
            <button className="btn" onClick={handleSaveWorkspace} disabled={wsBusy}>
              切り替え
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            ⚠ 切り替えるとそのワークスペースのデータを読みに行きます。空のワークスペースに切り替えるとデータが空に見えるので、必要なら事前に「☁ アップロード」しておいてください。
          </div>
        </div>

        <div className="form-row" style={{ flexWrap: 'wrap', margin: 0 }}>
          <button className="btn" onClick={handleUpload} disabled={wsBusy}>
            ☁ ローカル全データをアップロード（移行）
          </button>
          <button className="btn btn-secondary" onClick={handlePull} disabled={wsBusy}>
            🔄 クラウドから取得
          </button>
        </div>
        {wsMsg && <div style={{ color: 'var(--success)', fontSize: 13, marginTop: 8 }}>{wsMsg}</div>}
        {wsErr && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{wsErr}</div>}
      </div>

      <div className="card">
        <div className="card-title">
          🕘 自動バックアップ履歴
          <span style={{ float: 'right', fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
            {backups.length}/5 世代
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.7 }}>
          起動するたびに自動でスナップショットが保存されます（同一内容・1時間以内はスキップ）。<br />
          各バックアップから個別に復元できます。世代は最大 5 件保持されます。
        </div>
        <div style={{ marginBottom: 10 }}>
          <button className="btn btn-small" onClick={handleManualBackup}>
            📸 いま手動でスナップショット
          </button>
        </div>
        {backups.length === 0 ? (
          <div className="empty" style={{ padding: 16, fontSize: 13 }}>
            バックアップはまだありません
          </div>
        ) : (
          <div className="backup-list" key={backupTick}>
            {backups.map((b, i) => {
              const ts = new Date(b.timestamp)
              const label = ts.toLocaleString('ja-JP')
              const sizeKb = (b.sizeBytes / 1024).toFixed(1)
              return (
                <div key={b.timestamp} className="backup-row">
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {i === 0 && <span className="backup-badge">最新</span>}
                      {label}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {b.keyCount}キー / {sizeKb} KB / v{b.version}
                    </div>
                  </div>
                  <div className="form-row" style={{ margin: 0 }}>
                    <button
                      className="btn btn-small"
                      onClick={() => handleRestoreBackup(b.timestamp, label)}
                      title="既存データに上書きせず、空のキーだけ埋める"
                    >🩹 マージ復元</button>
                    <button
                      className="btn btn-small btn-secondary"
                      onClick={() => handleRestoreBackupOverwrite(b.timestamp, label)}
                      title="現在のデータを完全に上書き"
                    >♻ 上書き復元</button>
                    <button
                      className="btn-icon"
                      onClick={() => handleDeleteBackup(b.timestamp, label)}
                      title="このバックアップを削除"
                    >🗑</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {backupInfo && <div style={{ color: 'var(--success)', fontSize: 13, marginTop: 8 }}>{backupInfo}</div>}
        {backupError && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{backupError}</div>}
      </div>

      <div className="card">
        <div className="card-title">🎁 サンプルデータ復元</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.7 }}>
          タスク・アイデア・MTメモ・営業先・SNS投稿・年間目標・今後の取り組み・なりたい自分・戦略のサンプルを投入します。<br />
          <strong>マージ投入</strong>：空になっているデータだけサンプルで埋める（既存データを温存。データを失った時の復旧用）<br />
          <strong>リセット投入</strong>：既存データを上書きしてサンプル状態に戻す（要バックアップ）
        </div>
        <div className="form-row" style={{ flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => handleRestoreSample('merge')}>
            🎁 マージ投入（推奨）
          </button>
          <button className="btn btn-secondary" onClick={() => handleRestoreSample('reset')}>
            ⚠ リセット投入
          </button>
        </div>
        {sampleInfo && <div style={{ color: 'var(--success)', fontSize: 13, marginTop: 8 }}>{sampleInfo}</div>}
        {sampleError && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{sampleError}</div>}
      </div>

      <div className="card">
        <div className="card-title">🗑 個別データ削除（ローカル）</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          ※ 削除前に上の「エクスポート」でバックアップを取ることをお勧めします。
        </div>
        <div className="form-row" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-small" onClick={() => clearData('tf_tasks')}>タスク削除</button>
          <button className="btn btn-secondary btn-small" onClick={() => clearData('tf_schedule')}>スケジュール削除</button>
          <button className="btn btn-secondary btn-small" onClick={() => clearData('tf_ideas')}>アイデア削除</button>
          <button className="btn btn-secondary btn-small" onClick={() => clearData('tf_sns')}>SNS削除</button>
          <button className="btn btn-secondary btn-small" onClick={() => clearData('tf_mtmemos')}>MTメモ削除</button>
          <button className="btn btn-secondary btn-small" onClick={() => clearData('tf_partners')}>営業先削除</button>
          <button className="btn btn-secondary btn-small" onClick={() => clearData('tf_strategies')}>戦略・戦術削除</button>
          <button className="btn btn-secondary btn-small" onClick={() => clearData('tf_gcal_user_events')}>GCalキャッシュ削除</button>
          <button className="btn btn-secondary btn-small" onClick={() => clearData('tf_gcal_user_tokens')}>GCalトークン削除</button>
        </div>
      </div>
    </div>
  )
}

function GoogleClientIdField() {
  const [clientId, setClientId] = useLocalStorage('tf_gcal_clientId', '')
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
        オプション：別の OAuth クライアントを使う場合のみ上書き値を入力（通常は空のままで OK）
      </div>
      <div className="form-row" style={{ margin: 0 }}>
        <input
          className="text-input"
          placeholder="上書きクライアント ID（空欄で組み込み値を使用）"
          value={clientId}
          onChange={e => setClientId(e.target.value)}
        />
        {clientId && (
          <button className="btn btn-secondary btn-small" onClick={() => setClientId('')}>クリア</button>
        )}
      </div>
    </div>
  )
}
