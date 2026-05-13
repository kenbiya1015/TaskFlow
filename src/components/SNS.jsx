import { useState, useMemo } from 'react'
import { useUserScopedStorage, uid } from '../hooks/useLocalStorage'

const ACCOUNTS = [
  { id: 'shimura', name: '志村アカウント', desc: '志村直紀 個人発信 ／ 想い・哲学・日常' },
  { id: 'kenbiya', name: '健美屋公式',     desc: '健美屋ブランド ／ 商品・体験・お客様の声' },
  { id: 'seitai',  name: '整体信玄',       desc: '整体信玄 ／ 健康情報・施術紹介・症例' },
]
const ACCOUNT_MAP = Object.fromEntries(ACCOUNTS.map(a => [a.id, a]))

const STATUSES = ['アイデア', '確定', '投稿済み']
const STATUS_LABELS = {
  'アイデア':  'アイデア（未確定）',
  '確定':       '確定（投稿予定）',
  '投稿済み':   '投稿済み',
}

const ALL = '__all__'

export default function SNS({ currentUser }) {
  const [posts, setPosts] = useUserScopedStorage('tf_sns_by_user', currentUser, [])
  const [activeAccount, setActiveAccount] = useState('shimura')
  const [text, setText] = useState('')
  const [status, setStatus] = useState('アイデア')
  const [scheduledFor, setScheduledFor] = useState('')
  const [allFilterStatus, setAllFilterStatus] = useState('全て')
  const [allFilterAccount, setAllFilterAccount] = useState('全て')

  const add = () => {
    if (!text.trim()) return
    const account = activeAccount === ALL ? 'shimura' : activeAccount
    setPosts([
      { id: uid(), account, text: text.trim(), status, scheduledFor, createdAt: Date.now() },
      ...posts,
    ])
    setText('')
    setScheduledFor('')
  }

  const remove = id => setPosts(posts.filter(p => p.id !== id))
  const updateStatus = (id, st) => setPosts(posts.map(p => p.id === id ? { ...p, status: st } : p))

  const current = ACCOUNT_MAP[activeAccount] || null
  const accountPosts = activeAccount === ALL
    ? []
    : posts.filter(p => p.account === activeAccount)

  const allFiltered = useMemo(() => {
    return posts
      .filter(p => allFilterAccount === '全て' || p.account === allFilterAccount)
      .filter(p => allFilterStatus === '全て' || p.status === allFilterStatus)
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [posts, allFilterAccount, allFilterStatus])

  const summary = (id) => ({
    投稿済み: posts.filter(p => p.account === id && p.status === '投稿済み').length,
    確定:     posts.filter(p => p.account === id && p.status === '確定').length,
    アイデア: posts.filter(p => p.account === id && p.status === 'アイデア').length,
  })

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
        <button
          className={`sns-tab ${activeAccount === ALL ? 'active' : ''}`}
          onClick={() => setActiveAccount(ALL)}
          title="全アカウントのネタを一覧表示"
        >
          📋 全ネタ一覧
          <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.7 }}>{posts.length}</span>
        </button>
      </div>

      {activeAccount !== ALL && current && (
        <>
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
                <PostCard
                  key={p.id}
                  p={p}
                  onChangeStatus={updateStatus}
                  onRemove={remove}
                  showAccount={false}
                />
              ))
          )}
        </>
      )}

      {activeAccount === ALL && (
        <>
          <div className="card">
            <div className="card-title">📋 全ネタ一覧</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.7 }}>
              すべてのアカウントの投稿・ネタを横断で表示します。<br />
              アカウント別の概要：
              {ACCOUNTS.map(a => {
                const s = summary(a.id)
                return (
                  <span key={a.id} style={{ marginLeft: 10 }}>
                    <strong>{a.name}</strong> 投稿済 {s.投稿済み} ／ 確定 {s.確定} ／ アイデア {s.アイデア}
                  </span>
                )
              })}
            </div>
            <div className="form-row" style={{ margin: 0 }}>
              <select className="select" value={allFilterAccount} onChange={e => setAllFilterAccount(e.target.value)}>
                <option>全て</option>
                {ACCOUNTS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select className="select" value={allFilterStatus} onChange={e => setAllFilterStatus(e.target.value)}>
                <option>全て</option>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
                {allFiltered.length} 件
              </span>
            </div>
          </div>

          {allFiltered.length === 0 ? (
            <div className="empty"><div className="empty-icon">◇</div>条件に合うネタはありません</div>
          ) : (
            allFiltered.map(p => (
              <PostCard
                key={p.id}
                p={p}
                onChangeStatus={updateStatus}
                onRemove={remove}
                showAccount
              />
            ))
          )}
        </>
      )}
    </div>
  )
}

function PostCard({ p, onChangeStatus, onRemove, showAccount }) {
  const accName = ACCOUNT_MAP[p.account]?.name || p.account
  return (
    <div className={`sns-post status-${p.status}`}>
      <div className="sns-post-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {showAccount && (
            <span className={`sns-account-pill sns-account-pill-${p.account}`}>{accName}</span>
          )}
          <select
            className="select"
            style={{ fontSize: 11, padding: '2px 6px' }}
            value={p.status}
            onChange={e => onChangeStatus(p.id, e.target.value)}
          >
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          {p.scheduledFor && <span style={{ marginLeft: 4 }}>予定: {p.scheduledFor}</span>}
          <span style={{ marginLeft: 4 }}>{new Date(p.createdAt).toLocaleDateString('ja-JP')}</span>
        </div>
        <button className="btn-icon" onClick={() => onRemove(p.id)}>×</button>
      </div>
      <div className="sns-post-text">{p.text}</div>
    </div>
  )
}
