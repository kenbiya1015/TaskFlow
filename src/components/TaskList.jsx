import { useState, useMemo, useEffect } from 'react'
import { useUserScopedStorage, uid } from '../hooks/useLocalStorage'

const CATEGORIES = ['全て', '健美屋', '整体', '個人', '成長', '相手ボール', 'その他']
const PRIORITY_OPTIONS = ['A', 'B', 'C', 'D']

// 旧形式 高/中/低 → A/B/C への互換変換
function normalizePriority(p) {
  if (p === '高') return 'A'
  if (p === '中') return 'B'
  if (p === '低') return 'C'
  if (PRIORITY_OPTIONS.includes(p)) return p
  return 'C'
}

const PRIORITY_LABELS = {
  A: '最優先',
  B: '効率化',
  C: '将来性',
  D: '後回し',
}

function dueStatus(due) {
  if (!due) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(due); d.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((d - today) / 86400000)
  if (diffDays < 0)  return { key: 'overdue', label: `${-diffDays}日経過` }
  if (diffDays === 0) return { key: 'today', label: '今日' }
  if (diffDays <= 3) return { key: 'soon',   label: `あと${diffDays}日` }
  return { key: 'later', label: `〜${due.slice(5)}` }
}

export default function TaskList({ currentUser }) {
  const [tasks, setTasks] = useUserScopedStorage('tf_tasks_by_user', currentUser, [])
  const [filter, setFilter] = useState('全て')
  const [view, setView] = useState('list') // 'list' or 'kanban'
  const [draggedId, setDraggedId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const [dragOverCol, setDragOverCol] = useState(null)

  const [newText, setNewText] = useState('')
  const [newCat, setNewCat] = useState('健美屋')
  const [newPriority, setNewPriority] = useState('B')
  const [newDue, setNewDue] = useState('')

  // 互換性確保：order と priority(A/B/C/D) のフィールドを補完
  useEffect(() => {
    const needsFix = tasks.some(t =>
      t.order == null || !PRIORITY_OPTIONS.includes(t.priority),
    )
    if (!needsFix) return
    // 既存の順番（createdAt desc）を尊重しつつ order を割り当てる
    const sorted = [...tasks].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    const orderMap = new Map(sorted.map((t, i) => [t.id, i + 1]))
    setTasks(tasks.map(t => ({
      ...t,
      priority: normalizePriority(t.priority),
      order: t.order ?? orderMap.get(t.id) ?? 999,
    })))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nextOrder = () =>
    tasks.length === 0 ? 1 : Math.max(...tasks.map(t => t.order ?? 0)) + 1

  const add = () => {
    if (!newText.trim()) return
    setTasks([
      {
        id: uid(),
        text: newText.trim(),
        category: newCat,
        member: currentUser,
        priority: newPriority,
        due: newDue,
        done: false,
        createdAt: Date.now(),
        order: nextOrder(),
      },
      ...tasks,
    ])
    setNewText('')
    setNewDue('')
  }

  const toggle = id => setTasks(tasks.map(t => t.id === id ? { ...t, done: !t.done } : t))
  const remove = id => setTasks(tasks.filter(t => t.id !== id))
  const updatePriority = (id, p) =>
    setTasks(tasks.map(t => t.id === id ? { ...t, priority: p } : t))

  // D&D 並び替え：fromId を toId の位置の直前へ移動
  const reorderTasks = (fromId, toId) => {
    if (!fromId || fromId === toId) return
    const list = [...tasks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const fromIdx = list.findIndex(t => t.id === fromId)
    const toIdx = list.findIndex(t => t.id === toId)
    if (fromIdx < 0 || toIdx < 0) return
    const [moved] = list.splice(fromIdx, 1)
    list.splice(toIdx, 0, moved)
    const reordered = list.map((t, i) => ({ ...t, order: i + 1 }))
    setTasks(reordered)
  }

  const filtered = useMemo(() => {
    return tasks
      .filter(t => filter === '全て' || t.category === filter)
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1
        const ao = a.order ?? Number.MAX_SAFE_INTEGER
        const bo = b.order ?? Number.MAX_SAFE_INTEGER
        return ao - bo
      })
  }, [tasks, filter])

  // カンバン用：カテゴリフィルタを適用しつつ A/B/C/D にグループ分け（未完了のみ）
  const tasksByPriority = useMemo(() => {
    const groups = { A: [], B: [], C: [], D: [] }
    tasks
      .filter(t => !t.done)
      .filter(t => filter === '全て' || t.category === filter)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .forEach(t => {
        const pri = normalizePriority(t.priority)
        groups[pri].push(t)
      })
    return groups
  }, [tasks, filter])

  const doneTasks = useMemo(
    () => tasks.filter(t => t.done && (filter === '全て' || t.category === filter)),
    [tasks, filter]
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">タスク一覧</div>
          <div className="page-subtitle">{currentUser} さんのタスク　·　ドラッグで並び替え／重要度移動</div>
        </div>
        <div className="view-switch">
          <button
            className={`view-switch-btn ${view === 'list' ? 'active' : ''}`}
            onClick={() => setView('list')}
          >☰ リスト</button>
          <button
            className={`view-switch-btn ${view === 'kanban' ? 'active' : ''}`}
            onClick={() => setView('kanban')}
          >🗂 カンバン</button>
        </div>
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
          <select className="select" value={newPriority} onChange={e => setNewPriority(e.target.value)}>
            {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}（{PRIORITY_LABELS[p]}）</option>)}
          </select>
          <input type="date" className="text-input" value={newDue} onChange={e => setNewDue(e.target.value)} style={{ minWidth: 0 }} />
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

      {view === 'kanban' ? (
        <div className="kanban-board kanban-board-2x2 kanban-board-full">
          {['A', 'C', 'B', 'D'].map(col => {
            const items = tasksByPriority[col] || []
            const isOver = dragOverCol === col
            return (
              <div
                key={col}
                className={`kanban-column kanban-col-${col} ${isOver ? 'is-over' : ''}`}
                onDragOver={e => {
                  if (!draggedId) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (dragOverCol !== col) setDragOverCol(col)
                }}
                onDragLeave={() => {
                  if (dragOverCol === col) setDragOverCol(null)
                }}
                onDrop={e => {
                  e.preventDefault()
                  const id = e.dataTransfer.getData('text/plain') || draggedId
                  if (id) updatePriority(id, col)
                  setDraggedId(null)
                  setDragOverCol(null)
                  setDragOverId(null)
                }}
              >
                <div className="kanban-col-header kanban-col-header-lg">
                  <span className={`priority-badge priority-${col} priority-badge-lg`}>{col}</span>
                  <span className="kanban-col-label kanban-col-label-lg">{PRIORITY_LABELS[col]}</span>
                  <span className="kanban-col-count">{items.length}</span>
                </div>
                <div className="kanban-col-body">
                  {items.length === 0 ? (
                    <div className="kanban-empty">ここにドロップで {col} に変更</div>
                  ) : (
                    items.map(t => {
                      const ds = dueStatus(t.due)
                      return (
                        <div
                          key={t.id}
                          className="kanban-card kanban-card-lg"
                          draggable
                          onDragStart={e => {
                            e.dataTransfer.effectAllowed = 'move'
                            e.dataTransfer.setData('text/plain', t.id)
                            setDraggedId(t.id)
                          }}
                          onDragEnd={() => {
                            setDraggedId(null)
                            setDragOverCol(null)
                          }}
                        >
                          <div className="kanban-card-top">
                            <input
                              type="checkbox"
                              className="task-check"
                              checked={t.done}
                              onChange={() => toggle(t.id)}
                            />
                            <span className="kanban-card-text">{t.text}</span>
                            <button className="btn-icon" onClick={() => remove(t.id)} title="削除">×</button>
                          </div>
                          <div className="kanban-card-meta">
                            <span className={`tag tag-${t.category}`}>{t.category}</span>
                            {ds && <span className={`due-badge due-${ds.key}`}>{ds.label}</span>}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
          {doneTasks.length > 0 && (
            <div className="kanban-done-strip">
              <div className="kanban-done-title">✓ 完了済み（{doneTasks.length}）</div>
              {doneTasks.slice(0, 12).map(t => (
                <div key={t.id} className="kanban-done-row">
                  <input
                    type="checkbox"
                    className="task-check"
                    checked
                    onChange={() => toggle(t.id)}
                  />
                  <span className="kanban-done-text">{t.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">∅</div>
          タスクがありません。新しく追加してください。
        </div>
      ) : (
        <ul className="task-list">
          {filtered.map(t => {
            const pri = normalizePriority(t.priority)
            const ds = dueStatus(t.due)
            const isDragOver = dragOverId === t.id
            return (
              <li
                key={t.id}
                className={`task-item ${t.done ? 'done' : ''} ${isDragOver ? 'drag-over' : ''}`}
                draggable={!t.done}
                onDragStart={e => {
                  if (t.done) return
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', t.id)
                  setDraggedId(t.id)
                }}
                onDragOver={e => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (dragOverId !== t.id) setDragOverId(t.id)
                }}
                onDragLeave={() => {
                  if (dragOverId === t.id) setDragOverId(null)
                }}
                onDrop={e => {
                  e.preventDefault()
                  const fromId = e.dataTransfer.getData('text/plain') || draggedId
                  reorderTasks(fromId, t.id)
                  setDraggedId(null)
                  setDragOverId(null)
                }}
                onDragEnd={() => {
                  setDraggedId(null)
                  setDragOverId(null)
                }}
              >
                <span className="task-drag-handle" title="ドラッグで並び替え">⋮⋮</span>
                <input type="checkbox" className="task-check" checked={t.done} onChange={() => toggle(t.id)} />
                <div className="task-text">{t.text}</div>
                <span className={`tag tag-${t.category}`}>{t.category}</span>
                <select
                  className={`priority-badge priority-${pri}`}
                  value={pri}
                  onChange={e => updatePriority(t.id, e.target.value)}
                  onClick={e => e.stopPropagation()}
                  title={`重要度：${PRIORITY_LABELS[pri]}`}
                >
                  {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                {ds ? (
                  <span className={`due-badge due-${ds.key}`} title={t.due}>{ds.label}</span>
                ) : (
                  <span className="task-meta">期日なし</span>
                )}
                <button className="btn-icon" onClick={() => remove(t.id)} title="削除">×</button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
