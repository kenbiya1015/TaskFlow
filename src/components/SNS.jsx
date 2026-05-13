import { useState } from 'react'
import { useLocalStorage, uid } from '../hooks/useLocalStorage'

const ACCOUNTS = [
  { id: 'shimura', name: '志村アカウント', desc: '志村直紀 個人発信 ／ 想い・哲学・日常' },
  { id: 'kenbiya', name: '健美屋公式', desc: '健美屋ブランド ／ 商品・体験・お客様の声' },
  { id: 'seitai', name: '整体信玄', desc: '整体信玄 ／ 健康情報・施術紹介・症例' },
]

const STATUSES = ['アイデア', '確定', '投稿済み']
const STATUS_LABELS = {
  'アイデア': 'アイデア（未確定）',
  '確定': '確定（投稿予定）',
  '投稿済み': '投稿済み',
}

export default function SNS() {
  const [posts, setPosts] = useLocalStorage('tf_sns', [])
  const [activeAccount, setActiveAccount] = useState('shimura')
  const [text, setText] = useState('')
  const [status, setStatus] = useState('アイデア')
  const [scheduledFor, setScheduledFor] = useState('')

  const add = () => {
    if (!text.trim()) return
    setPosts([
      { id: uid(), account: activeAccount, text: text.trim(), status, scheduledFor, createdAt: Date.now() },
      ...posts,
    ])
    setText('')
    setScheduledFor('')
  }

  const remove = id => setPosts(posts.filter(p => p.id !== id))
  const updateStatus = (id, st) => setPosts(posts.map(p => p.id === id ? { ...p, status: st } : p))

  const current = ACCOUNTS.find(a => a.id === activeAccount)
  const accountPosts = posts.filter(p => p.account === activeAccount)

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">SNSネタ帳</div>
          <div className="page-subtitle">SOCIAL　POSTS</div>
        </div>
      </div>

      <div className="sns-tabs">
        {ACCOUNTS.map(a => (
          <button
            key={a.id}
            className={`sns-tab ${activeAccount === a.id ? 'active' : ''}`}
            onClick={() => setActiveAccount(a.id)}
          >
            {a.name}
            <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.7 }}>
              {posts.filter(p => p.account === a.id).length}
            </span>
          </button>
        ))}
      </div>

      <div className="sns-account-header">
        <div>
          <div className="sns-account-name">{current.name}</div>
          <div className="sns-account-desc">{current.desc}</div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          投稿済み {accountPosts.filter(p => p.status === '投稿済み').length} ／
          確定 {accountPosts.filter(p => p.status === '確定').length} ／
          アイデア {accountPosts.filter(p => p.status === 'アイデア').length}
        </div>
      </div>

      <div className="card">
        <div className="card-title">新しい投稿 ／ ネタ</div>
        <textarea
          className="textarea"
          placeholder="投稿内容・ネタ・キャプション..."
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <div className="form-row" style={{ marginTop: 10 }}>
          <select className="select" value={status} onChange={e => setStatus(e.target.value)}>
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          <input
            type="date"
            className="text-input"
            value={scheduledFor}
            onChange={e => setScheduledFor(e.target.value)}
            style={{ minWidth: 0 }}
          />
          <button className="btn" onClick={add}>追加</button>
        </div>
      </div>

      {accountPosts.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">◇</div>
          このアカウントの投稿はまだありません。
        </div>
      ) : (
        accountPosts
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(p => (
            <div key={p.id} className={`sns-post status-${p.status}`}>
              <div className="sns-post-header">
                <div>
                  <select
                    className="select"
                    style={{ fontSize: 11, padding: '2px 6px' }}
                    value={p.status}
                    onChange={e => updateStatus(p.id, e.target.value)}
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                  {p.scheduledFor && <span style={{ marginLeft: 10 }}>予定: {p.scheduledFor}</span>}
                  <span style={{ marginLeft: 10 }}>{new Date(p.createdAt).toLocaleDateString('ja-JP')}</span>
                </div>
                <button className="btn-icon" onClick={() => remove(p.id)}>×</button>
              </div>
              <div className="sns-post-text">{p.text}</div>
            </div>
          ))
      )}
    </div>
  )
}
