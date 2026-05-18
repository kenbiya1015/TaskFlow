import { useState } from 'react'
import { useUserScopedStorage, uid } from '../hooks/useLocalStorage'

const CATEGORIES = ['会社', '健美屋', '整体', '個人']
const DEFAULT_CATEGORY = '個人'
const PRIORITIES = ['A', 'B', 'C', 'D']

// 2x2 配置（タスク一覧の4軸ボードに合わせる）
// 左上=会社(A) / 右上=健美屋(C) / 左下=整体(B) / 右下=個人(D)
const COLUMNS = [
  { key: '会社',   col: 'A', sub: 'COMPANY' },
  { key: '健美屋', col: 'C', sub: 'KENBIYA' },
  { key: '整体',   col: 'B', sub: 'SEITAI' },
  { key: '個人',   col: 'D', sub: 'PERSONAL' },
]

export default function Ideas({ currentUser }) {
  const [ideas, setIdeas] = useUserScopedStorage('tf_ideas_by_user', currentUser, [])
  const [tasks, setTasks] = useUserScopedStorage('tf_tasks_by_user', currentUser, [])
  const [text, setText] = useState('')
  const [newCategory, setNewCategory] = useState(DEFAULT_CATEGORY)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [editCategory, setEditCategory] = useState(DEFAULT_CATEGORY)
  const [pickPriorityFor, setPickPriorityFor] = useState(null)

  const add = () => {
    if (!text.trim()) return
    setIdeas([{ id: uid(), text: text.trim(), category: newCategory, author: currentUser, pinned: false, createdAt: Date.now() }, ...ideas])
    setText('')
  }

  const remove = id => setIdeas(ideas.filter(i => i.id !== id))
  const togglePin = id => setIdeas(ideas.map(i => i.id === id ? { ...i, pinned: !i.pinned } : i))

  const startEdit = (idea) => {
    setEditingId(idea.id)
    setEditText(idea.text)
    setEditCategory(idea.category || DEFAULT_CATEGORY)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditText('')
  }

  const saveEdit = (id) => {
    if (!editText.trim()) return
    setIdeas(ideas.map(i => i.id === id ? { ...i, text: editText.trim(), category: editCategory } : i))
    setEditingId(null)
    setEditText('')
  }

  const sendToTasks = (idea, priority) => {
    const nextOrder = tasks.length === 0 ? 1 : Math.max(...tasks.map(t => t.order ?? 0)) + 1
    const newTask = {
      id: uid(),
      text: idea.text,
      category: 'その他',
      member: currentUser,
      priority,
      due: '',
      done: false,
      createdAt: Date.now(),
      order: nextOrder,
      fromIdeaId: idea.id,
    }
    setTasks([newTask, ...tasks])
    setIdeas(ideas.map(x => x.id === idea.id ? { ...x, addedToTask: priority } : x))
    setPickPriorityFor(null)
  }

  const ideasByCategory = CATEGORIES.reduce((acc, c) => {
    const list = ideas
      .filter(i => (i.category || DEFAULT_CATEGORY) === c)
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt)
    acc[c] = list
    return acc
  }, {})

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">アイデアメモ</div>
          <div className="page-subtitle">IDEAS　·　ひらめきを書き留める</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">新しいアイデア</div>
        <textarea
          className="textarea"
          placeholder="思いついたことを自由に..."
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <div className="form-row" style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="select" value={newCategory} onChange={e => setNewCategory(e.target.value)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn" onClick={add}>書き留める</button>
        </div>
      </div>

      <div className="kanban-board kanban-board-2x2 kanban-board-full">
        {COLUMNS.map(({ key, col, sub }) => {
          const items = ideasByCategory[key] || []
          return (
            <div key={key} className={`kanban-column kanban-col-${col}`}>
              <div className="kanban-col-header kanban-col-header-xl">
                <span className={`priority-badge priority-${col} priority-badge-xl`}>{key.charAt(0)}</span>
                <div className="kanban-col-titles">
                  <span className="kanban-col-label-xl">{key}</span>
                  <span className="kanban-col-sublabel">{sub}</span>
                </div>
                <span className="kanban-col-count-xl">{items.length}<span className="kanban-col-count-unit">件</span></span>
              </div>
              <div className="kanban-col-body">
                {items.length === 0 ? (
                  <div className="kanban-empty">アイデアがまだありません</div>
                ) : (
                  items.map(i => {
                    const isEditing = editingId === i.id
                    const isPicking = pickPriorityFor === i.id
                    return (
                      <div key={i.id} className={`kanban-card kanban-card-v2 ${i.pinned ? 'is-pinned' : ''}`}>
                        {isEditing ? (
                          <>
                            <textarea
                              className="textarea"
                              value={editText}
                              onChange={e => setEditText(e.target.value)}
                              style={{ marginBottom: 6 }}
                            />
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                              <select className="select" value={editCategory} onChange={e => setEditCategory(e.target.value)}>
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                              <button className="btn btn-small" onClick={() => saveEdit(i.id)}>保存</button>
                              <button className="btn btn-small btn-secondary" onClick={cancelEdit}>キャンセル</button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="kanban-card-head">
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span>{i.author}　{new Date(i.createdAt).toLocaleDateString('ja-JP')}</span>
                                {i.addedToTask && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px', background: 'var(--surface-2)', borderRadius: 999, border: '1px solid var(--border)' }}>
                                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-soft)' }}>タスク追加済み</span>
                                    <span className={`priority-badge priority-${i.addedToTask}`} style={{ minWidth: 20, height: 18, fontSize: 10, padding: '0 5px' }}>{i.addedToTask}</span>
                                  </span>
                                )}
                              </span>
                              <div className="kanban-card-actions">
                                {isPicking ? (
                                  <>
                                    {PRIORITIES.map(p => (
                                      <button
                                        key={p}
                                        className={`priority-badge priority-${p}`}
                                        style={{ minWidth: 26, height: 26, borderRadius: 6, fontSize: 12 }}
                                        onClick={() => sendToTasks(i, p)}
                                        title={`優先度 ${p} でタスクに追加`}
                                      >{p}</button>
                                    ))}
                                    <button
                                      className="kanban-card-btn"
                                      onClick={() => setPickPriorityFor(null)}
                                      title="キャンセル"
                                    >×</button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      className="kanban-card-btn"
                                      onClick={() => setPickPriorityFor(i.id)}
                                      title="このアイデアをタスクに追加"
                                    >＋</button>
                                    <button
                                      className="kanban-card-btn"
                                      onClick={() => togglePin(i.id)}
                                      title={i.pinned ? '固定解除' : '固定'}
                                    >{i.pinned ? '★' : '☆'}</button>
                                    <button
                                      className="kanban-card-btn kanban-card-edit"
                                      onClick={() => startEdit(i)}
                                      title="編集"
                                    >✏️</button>
                                    <button
                                      className="kanban-card-btn kanban-card-del"
                                      onClick={() => remove(i.id)}
                                      title="削除"
                                    >🗑</button>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="kanban-card-text" style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.55 }}>
                              {i.text}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
