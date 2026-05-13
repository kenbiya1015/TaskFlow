import { useRef, useState } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { MEMBERS } from '../members'
import { downloadExport, importAll, DATA_KEYS } from '../lib/storage'

export default function Settings({ currentUser, onChangeUser, onLogout }) {
  const [members, setMembers] = useLocalStorage('tf_members', MEMBERS)
  const fileRef = useRef(null)
  const [importInfo, setImportInfo] = useState('')
  const [importError, setImportError] = useState('')

  const updateMember = (id, patch) => {
    setMembers(members.map(m => m.id === id ? { ...m, ...patch } : m))
  }

  const clearData = key => {
    if (!confirm(`localStorage の "${key}" を削除します。よろしいですか？`)) return
    window.localStorage.removeItem(key)
    location.reload()
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
          Google Cloud Console で <strong>Calendar API</strong> を有効化し、OAuth 2.0 クライアント ID（ウェブ）を作成。<br />
          「承認済みの JavaScript 生成元」に <code>{location.origin}</code> を登録した後、下に貼り付けてください。<br />
          実際の接続・同期はスケジュール画面の「Googleカレンダー連携」ボタンから行います。
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
          <button className="btn btn-secondary btn-small" onClick={() => clearData('tf_gcal_events')}>GCalキャッシュ削除</button>
        </div>
      </div>
    </div>
  )
}

function GoogleClientIdField() {
  const [clientId, setClientId] = useLocalStorage('tf_gcal_clientId', '')
  return (
    <div className="form-row" style={{ margin: 0 }}>
      <input
        className="text-input"
        placeholder="OAuth クライアント ID（xxx.apps.googleusercontent.com）"
        value={clientId}
        onChange={e => setClientId(e.target.value)}
      />
    </div>
  )
}
