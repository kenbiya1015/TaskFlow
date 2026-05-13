import { useState } from 'react'
import { useUserScopedStorage, uid } from '../hooks/useLocalStorage'

const TIMEFRAMES = ['短期（〜3ヶ月）', '中期（〜1年）', '長期（〜3年）']
const CATEGORIES = ['事業', '組織', '個人', '商品・サービス', 'ブランド']

export default function FuturePlans({ currentUser }) {
  const [items, setItems] = useUserScopedStorage('tf_future_by_user', currentUser, [])
  const [filter, setFilter] = useState('全て')

  const [text, setText] = useState('')
  const [timeframe, setTimeframe] = useState(TIMEFRAMES[0])
  const [category, setCategory] = useState(CATEGORIES[0])
  const [detail, setDetail] = useState('')

  const add = () => {
    if (!text.trim()) return
    setItems([
      { id: uid(), text: text.trim(), detail: detail.trim(), timeframe, category, status: '構想中', createdAt: Date.now() },
      ...items,
    ])
    setText('')
    setDetail('')
  }

  const remove = id => setItems(items.filter(i => i.id !== id))
  const updateStatus = (id, st) => setItems(items.map(i => i.id === id ? { ...i, status: st } : i))

  const filtered = filter === '全て' ? items : items.filter(i => i.timeframe === filter)

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">今後の取り組み</div>
          <div className="page-subtitle">FUTURE　INITIATIVES</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">新しい取り組み</div>
        <input
          className="text-input"
          style={{ width: '100%', marginBottom: 10 }}
          placeholder="取り組みのタイトル..."
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <textarea
          className="textarea"
          placeholder="詳細・背景・狙い..."
          value={detail}
          onChange={e => setDetail(e.target.value)}
        />
        <div className="form-row" style={{ marginTop: 10 }}>
          <select className="select" value={timeframe} onChange={e => setTimeframe(e.target.value)}>
            {TIMEFRAMES.map(t => <option key={t}>{t}</option>)}
          </select>
          <select className="select" value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <button className="btn" onClick={add}>追加</button>
        </div>
      </div>

      <div className="category-tabs">
        <button className={`category-tab ${filter === '全て' ? 'active' : ''}`} onClick={() => setFilter('全て')}>
          全て <span style={{ marginLeft: 6, opacity: 0.7 }}>{items.length}</span>
        </button>
        {TIMEFRAMES.map(t => (
          <button key={t} className={`category-tab ${filter === t ? 'active' : ''}`} onClick={() => setFilter(t)}>
            {t}
            <span style={{ marginLeft: 6, opacity: 0.7 }}>{items.filter(i => i.timeframe === t).length}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty"><div className="empty-icon">◇</div>取り組みはまだありません</div>
      ) : (
        filtered.map(i => (
          <div key={i.id} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--cha-deep)', marginBottom: 6 }}>
                  {i.text}
                </div>
                <div>
                  <span className="tag">{i.timeframe}</span>
                  <span className="tag">{i.category}</span>
                  <select
                    className="select"
                    style={{ fontSize: 11, padding: '2px 6px', marginLeft: 4 }}
                    value={i.status}
                    onChange={e => updateStatus(i.id, e.target.value)}
                  >
                    <option>構想中</option>
                    <option>準備中</option>
                    <option>進行中</option>
                    <option>完了</option>
                    <option>保留</option>
                  </select>
                </div>
              </div>
              <button className="btn-icon" onClick={() => remove(i.id)}>×</button>
            </div>
            {i.detail && (
              <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', paddingTop: 10, borderTop: '1px dotted var(--cha-pale)', color: 'var(--sumi-soft)' }}>
                {i.detail}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
