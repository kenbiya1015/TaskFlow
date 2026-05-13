import { useState } from 'react'
import { useLocalStorage, uid } from '../hooks/useLocalStorage'

export const STRATEGY_CATEGORIES = [
  { id: 'kenbiya_office',   name: '健美屋オフィス', emoji: '🏢', color: '#2f6fed' },
  { id: 'kenbiya_business', name: '健美屋ビジネス', emoji: '💼', color: '#1f9e6a' },
  { id: 'sns',              name: 'SNS',            emoji: '📱', color: '#d97706' },
  { id: 'seitai',           name: '整体',           emoji: '🩺', color: '#a52663' },
  { id: 'other',            name: 'その他',         emoji: '📁', color: '#4a5160' },
]

function emptyEntry() {
  return { strategy: '', tactics: [] }
}

export default function Strategy() {
  const [data, setData] = useLocalStorage('tf_strategies', {})
  const [drafts, setDrafts] = useState({})

  const get = id => data[id] || emptyEntry()

  const updateStrategy = (id, text) => {
    setData({ ...data, [id]: { ...get(id), strategy: text } })
  }

  const setDraft = (id, v) => setDrafts({ ...drafts, [id]: v })

  const addTactic = id => {
    const t = (drafts[id] || '').trim()
    if (!t) return
    const e = get(id)
    setData({
      ...data,
      [id]: { ...e, tactics: [...(e.tactics || []), { id: uid(), text: t, done: false }] },
    })
    setDrafts({ ...drafts, [id]: '' })
  }

  const toggleTactic = (id, tid) => {
    const e = get(id)
    setData({
      ...data,
      [id]: { ...e, tactics: (e.tactics || []).map(t => t.id === tid ? { ...t, done: !t.done } : t) },
    })
  }

  const removeTactic = (id, tid) => {
    const e = get(id)
    setData({
      ...data,
      [id]: { ...e, tactics: (e.tactics || []).filter(t => t.id !== tid) },
    })
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">戦略・戦術</div>
          <div className="page-subtitle">STRATEGY　·　TACTICS　·　カテゴリ別</div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.7 }}>
        🧭 <strong>戦略</strong>は「大きな方向性・なぜそれをやるのか」、
        ⚙️ <strong>戦術</strong>は「具体的にいつ・なにをやるか」を分けて書き留めます。
      </div>

      {STRATEGY_CATEGORIES.map(cat => {
        const e = get(cat.id)
        const open = (e.tactics || []).filter(t => !t.done).length
        const total = (e.tactics || []).length
        return (
          <div key={cat.id} className="strategy-card">
            <div className="strategy-card-header" style={{ borderLeftColor: cat.color }}>
              <div className="strategy-cat-name">
                <span style={{ fontSize: 22, marginRight: 8 }}>{cat.emoji}</span>
                {cat.name}
              </div>
              <div className="strategy-cat-count">戦術 {open}/{total}</div>
            </div>

            <div className="strategy-body">
              <div className="strategy-block">
                <div className="strategy-block-label">🧭 戦略（方向性）</div>
                <textarea
                  className="textarea"
                  style={{ minHeight: 90, fontSize: 14 }}
                  placeholder={`${cat.name} の方向性・狙い・大事にしたい価値観...`}
                  value={e.strategy}
                  onChange={ev => updateStrategy(cat.id, ev.target.value)}
                />
              </div>

              <div className="strategy-block">
                <div className="strategy-block-label">⚙️ 戦術（具体的な行動）</div>
                <div className="form-row" style={{ marginBottom: 8 }}>
                  <input
                    className="text-input"
                    placeholder="具体的な行動を追加..."
                    value={drafts[cat.id] || ''}
                    onChange={ev => setDraft(cat.id, ev.target.value)}
                    onKeyDown={ev => ev.key === 'Enter' && addTactic(cat.id)}
                  />
                  <button className="btn btn-small" onClick={() => addTactic(cat.id)}>＋ 追加</button>
                </div>
                {(e.tactics || []).length === 0 ? (
                  <div className="empty" style={{ padding: 14, fontSize: 12 }}>戦術はまだありません</div>
                ) : (
                  <div className="strategy-tactics">
                    {(e.tactics || []).map(t => (
                      <div key={t.id} className={`year-goal-pill ${t.done ? 'done' : ''}`}>
                        <input
                          type="checkbox"
                          className="task-check"
                          style={{ width: 14, height: 14, marginTop: 2 }}
                          checked={t.done}
                          onChange={() => toggleTactic(cat.id, t.id)}
                        />
                        <div className="goal-text">{t.text}</div>
                        <button
                          className="btn-icon"
                          style={{ padding: '0 4px', fontSize: 12 }}
                          onClick={() => removeTactic(cat.id, t.id)}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
