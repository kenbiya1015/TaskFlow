import { useState } from 'react'
import { useUserScopedStorage, uid } from '../hooks/useLocalStorage'

const CATEGORIES = ['会社', '健美屋', '整体', '個人']
const FILTERS = ['全て', ...CATEGORIES]
const DEFAULT_CATEGORY = '個人'

export default function Ideas({ currentUser }) {
  const [ideas, setIdeas] = useUserScopedStorage('tf_ideas_by_user', currentUser, [])
  const [tasks, setTasks] = useUserScopedStorage('tf_tasks_by_user', currentUser, [])
  const [text, setText] = useState('')
  const [newCategory, setNewCategory] = useState(DEFAULT_CATEGORY)
  const [filter, setFilter] = useState('全て')
  const [addedFlash, setAddedFlash] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [editCategory, setEditCategory] = useState(DEFAULT_CATEGORY)

  const add = () => {
    if (!text.trim()) return
    setIdeas([{ id: uid(), text: text.trim(), category: newCategory, author: currentUser, pinned: false, createdAt: Date.now() }, ...ideas])
    setText('')
  }

  const remove = id => setIdeas(ideas.filter(i => i.id !== id))
  const togglePin = id => setIdeas(ideas.map(i => i.id === id ? { ...i, pinned: !i.pinned } : i))
  const setCategory = (id, category) => setIdeas(ideas.map(i => i.id === id ? { ...i, category } : i))

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

  const sendToTasks = (idea) => {
    const nextOrder = tasks.length === 0 ? 1 : Math.max(...tasks.map(t => t.order ?? 0)) + 1
    const newTask = {
      id: uid(),
      text: idea.text,
      category: 'その他',
      member: currentUser,
      priority: 'B',
      due: '',
      done: false,
      createdAt: Date.now(),
      order: nextOrder,
      fromIdeaId: idea.id,
    }
    setTasks([newTask, ...tasks])
    setAddedFlash(idea.id)
    setTimeout(() => setAddedFlash(null), 1500)
  }

  const filtered = filter === '全て' ? ideas : ideas.filter(i => (i.category || DEFAULT_CATEGORY) === filter)
  const sorted = [...filtered].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt)

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

      <div className="category-tabs">
        {FILTERS.map(c => (
          <button key={c} className={`category-tab ${filter === c ? 'active' : ''}`} onClick={() => setFilter(c)}>
            {c}
            {c !== '全て' && (
              <span style={{ marginLeft: 6, opacity: 0.7 }}>
                {ideas.filter(i => (i.category || DEFAULT_CATEGORY) === c).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">✦</div>
          アイデアはまだありません。
        </div>
      ) : (
        <div className="idea-grid">
          {sorted.map(i => (
            <div key={i.id} className={`idea-card ${i.pinned ? 'pinned' : ''}`}>
              {editingId === i.id ? (
                <>
                  <textarea
                    className="textarea"
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    style={{ marginBottom: 8 }}
                  />
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                    <select className="select" value={editCategory} onChange={e => setEditCategory(e.target.value)}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button className="btn btn-small" onClick={() => saveEdit(i.id)}>保存</button>
                    <button className="btn btn-small btn-secondary" onClick={cancelEdit}>キャンセル</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="idea-text">{i.text}</div>
                  <div className="idea-meta">
                    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select
                        className="select"
                        value={i.category || DEFAULT_CATEGORY}
                        onChange={e => setCategory(i.id, e.target.value)}
                        style={{ padding: '2px 6px', fontSize: 11 }}
                      >
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <span>{i.author}　{new Date(i.createdAt).toLocaleDateString('ja-JP')}</span>
                    </span>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <button
                        className="btn btn-small"
                        onClick={() => sendToTasks(i)}
                        title="このアイデアをタスクに追加"
                      >
                        {addedFlash === i.id ? '✓ 追加済' : '＋ タスクに追加'}
                      </button>
                      <button className="btn-icon" onClick={() => startEdit(i)} title="編集">✏</button>
                      <button className="btn-icon" onClick={() => togglePin(i.id)} title={i.pinned ? '固定解除' : '固定'}>
                        {i.pinned ? '★' : '☆'}
                      </button>
                      <button className="btn-icon" onClick={() => remove(i.id)} title="削除">×</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
