import { useState, useMemo } from 'react'
import { useLocalStorage, uid } from '../hooks/useLocalStorage'
import { MEMBER_NAMES } from '../members'

const CATEGORIES = ['全て', '健美屋', '整体', '個人', '成長', '相手ボール', 'その他']
const MEMBERS = MEMBER_NAMES
const PRIORITIES = ['高', '中', '低']

export default function TaskList({ currentUser }) {
  const [tasks, setTasks] = useLocalStorage('tf_tasks', [])
  const [filter, setFilter] = useState('全て')
  const [memberFilter, setMemberFilter] = useState(currentUser || '全員')

  const [newText, setNewText] = useState('')
  const [newCat, setNewCat] = useState('健美屋')
  const [newMember, setNewMember] = useState(currentUser || MEMBERS[0])
  const [newPriority, setNewPriority] = useState('中')
  const [newDue, setNewDue] = useState('')

  const add = () => {
    if (!newText.trim()) return
    setTasks([
      { id: uid(), text: newText.trim(), category: newCat, member: newMember, priority: newPriority, due: newDue, done: false, createdAt: Date.now() },
      ...tasks,
    ])
    setNewText('')
    setNewDue('')
  }

  const toggle = id => setTasks(tasks.map(t => t.id === id ? { ...t, done: !t.done } : t))
  const remove = id => setTasks(tasks.filter(t => t.id !== id))

  const filtered = useMemo(() => {
    return tasks
      .filter(t => filter === '全て' || t.category === filter)
      .filter(t => memberFilter === '全員' || t.member === memberFilter)
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1
        const p = { 高: 0, 中: 1, 低: 2 }
        if (p[a.priority] !== p[b.priority]) return p[a.priority] - p[b.priority]
        return b.createdAt - a.createdAt
      })
  }, [tasks, filter, memberFilter])

  const stats = useMemo(() => {
    const open = tasks.filter(t => !t.done)
    return {
      total: tasks.length,
      open: open.length,
      done: tasks.length - open.length,
      高: open.filter(t => t.priority === '高').length,
    }
  }, [tasks])

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">タスク一覧</div>
          <div className="page-subtitle">TASK　LIST</div>
        </div>
        <select className="select" value={memberFilter} onChange={e => setMemberFilter(e.target.value)}>
          <option>全員</option>
          {MEMBERS.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>

      <div className="stats-bar">
        <div className="stat-tile"><div className="stat-num">{stats.total}</div><div className="stat-label">総タスク</div></div>
        <div className="stat-tile"><div className="stat-num">{stats.open}</div><div className="stat-label">未完了</div></div>
        <div className="stat-tile"><div className="stat-num">{stats.done}</div><div className="stat-label">完了</div></div>
        <div className="stat-tile"><div className="stat-num" style={{ color: 'var(--vermillion)' }}>{stats.高}</div><div className="stat-label">優先 高</div></div>
      </div>

      <div className="card">
        <div className="card-title">新しいタスク</div>
        <div className="task-add-form">
          <input
            className="text-input"
            placeholder="やることを入力..."
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
          />
          <select className="select" value={newCat} onChange={e => setNewCat(e.target.value)}>
            {CATEGORIES.filter(c => c !== '全て').map(c => <option key={c}>{c}</option>)}
          </select>
          <select className="select" value={newMember} onChange={e => setNewMember(e.target.value)}>
            {MEMBERS.map(m => <option key={m}>{m}</option>)}
          </select>
          <select className="select" value={newPriority} onChange={e => setNewPriority(e.target.value)}>
            {PRIORITIES.map(p => <option key={p}>{`優先度 ${p}`}</option>)}
          </select>
          <input type="date" className="text-input" value={newDue} onChange={e => setNewDue(e.target.value)} style={{ minWidth: 0 }}/>
          <button className="btn" onClick={add}>追加</button>
        </div>
      </div>

      <div className="category-tabs">
        {CATEGORIES.map(c => (
          <button key={c} className={`category-tab ${filter === c ? 'active' : ''}`} onClick={() => setFilter(c)}>
            {c}
            {c !== '全て' && (
              <span style={{ marginLeft: 6, opacity: 0.7 }}>
                {tasks.filter(t => t.category === c && !t.done).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">∅</div>
          タスクがありません。新しく追加してください。
        </div>
      ) : (
        <ul className="task-list">
          {filtered.map(t => (
            <li key={t.id} className={`task-item ${t.done ? 'done' : ''}`}>
              <input type="checkbox" className="task-check" checked={t.done} onChange={() => toggle(t.id)} />
              <div className="task-text">{t.text}</div>
              <span className={`tag tag-${t.category}`}>{t.category}</span>
              <span className="task-meta">{t.member}</span>
              <span className={`task-priority priority-${t.priority}`}>● {t.priority}</span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {t.due && <span className="task-meta">〜{t.due.slice(5)}</span>}
                <button className="btn-icon" onClick={() => remove(t.id)} title="削除">×</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
