import { useState } from 'react'
import { useLocalStorage, uid } from '../hooks/useLocalStorage'
import { MEMBER_NAMES } from '../members'

const MEMBERS = MEMBER_NAMES

export default function BeingGoals({ currentUser }) {
  const [data, setData] = useLocalStorage('tf_being', {})
  const [active, setActive] = useState(currentUser || MEMBER_NAMES[0])
  const [newItem, setNewItem] = useState('')

  const personData = data[active] || { description: '', items: [] }

  const updateDescription = v => {
    setData({ ...data, [active]: { ...personData, description: v } })
  }

  const addItem = () => {
    if (!newItem.trim()) return
    const next = { ...data }
    next[active] = {
      ...personData,
      items: [...(personData.items || []), { id: uid(), text: newItem.trim(), done: false }],
    }
    setData(next)
    setNewItem('')
  }

  const toggleItem = id => {
    const next = { ...data }
    next[active] = {
      ...personData,
      items: (personData.items || []).map(i => i.id === id ? { ...i, done: !i.done } : i),
    }
    setData(next)
  }

  const removeItem = id => {
    const next = { ...data }
    next[active] = {
      ...personData,
      items: (personData.items || []).filter(i => i.id !== id),
    }
    setData(next)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">なりたい自分</div>
          <div className="page-subtitle">BEING　·　めざす自分像</div>
        </div>
      </div>

      <div className="year-tabs" style={{ paddingLeft: 0, marginBottom: 18 }}>
        {MEMBERS.map(m => (
          <button key={m} className={`year-tab ${active === m ? 'active' : ''}`} onClick={() => setActive(m)}>
            {m}
          </button>
        ))}
      </div>

      <div className="vision-section">
        <div className="vision-section-title">{active} の理想像</div>
        <div className="vision-section-en">SELF　IMAGE</div>
        <textarea
          className="textarea"
          style={{ marginLeft: 16, width: 'calc(100% - 16px)', minHeight: 140, fontSize: 15, lineHeight: 1.85 }}
          placeholder="どんな自分になりたいか、ありたい姿、心の在り方..."
          value={personData.description}
          onChange={e => updateDescription(e.target.value)}
        />
      </div>

      <div className="vision-section">
        <div className="vision-section-title">そのための実践</div>
        <div className="vision-section-en">DAILY　PRACTICES</div>
        <div className="year-goal-list">
          <div className="form-row" style={{ marginBottom: 14 }}>
            <input
              className="text-input"
              placeholder="日々の実践・習慣..."
              value={newItem}
              onChange={e => setNewItem(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
            />
            <button className="btn" onClick={addItem}>追加</button>
          </div>
          {(personData.items || []).length === 0 ? (
            <div className="empty" style={{ padding: 20 }}>実践項目はまだありません</div>
          ) : (
            (personData.items || []).map(i => (
              <div key={i.id} className="year-goal-item">
                <input type="checkbox" className="task-check" checked={i.done} onChange={() => toggleItem(i.id)} />
                <div style={{ flex: 1, textDecoration: i.done ? 'line-through' : 'none', opacity: i.done ? 0.55 : 1 }}>
                  {i.text}
                </div>
                <button className="btn-icon" onClick={() => removeItem(i.id)}>×</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
