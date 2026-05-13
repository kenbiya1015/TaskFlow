import { useState } from 'react'
import { useLocalStorage, uid } from '../hooks/useLocalStorage'
import { MEMBER_NAMES } from '../members'

export default function Ideas({ currentUser }) {
  const [ideas, setIdeas] = useLocalStorage('tf_ideas', [])
  const [tasks, setTasks] = useLocalStorage('tf_tasks', [])
  const [text, setText] = useState('')
  const [author, setAuthor] = useState(currentUser || MEMBER_NAMES[0])
  const [addedFlash, setAddedFlash] = useState(null)

  const add = () => {
    if (!text.trim()) return
    setIdeas([{ id: uid(), text: text.trim(), author, pinned: false, createdAt: Date.now() }, ...ideas])
    setText('')
  }

  const remove = id => setIdeas(ideas.filter(i => i.id !== id))
  const togglePin = id => setIdeas(ideas.map(i => i.id === id ? { ...i, pinned: !i.pinned } : i))

  const sendToTasks = (idea) => {
    const nextOrder = tasks.length === 0 ? 1 : Math.max(...tasks.map(t => t.order ?? 0)) + 1
    const newTask = {
      id: uid(),
      text: idea.text,
      category: 'その他',
      member: idea.author,
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

  const sorted = [...ideas].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt)

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
        <div className="form-row" style={{ marginTop: 10 }}>
          <select className="select" value={author} onChange={e => setAuthor(e.target.value)}>
            {MEMBER_NAMES.map(m => <option key={m}>{m}</option>)}
          </select>
          <button className="btn" onClick={add}>書き留める</button>
        </div>
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
              <div className="idea-text">{i.text}</div>
              <div className="idea-meta">
                <span>{i.author}　{new Date(i.createdAt).toLocaleDateString('ja-JP')}</span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <button
                    className="btn btn-small"
                    onClick={() => sendToTasks(i)}
                    title="このアイデアをタスクに追加"
                  >
                    {addedFlash === i.id ? '✓ 追加済' : '＋ タスクに追加'}
                  </button>
                  <button className="btn-icon" onClick={() => togglePin(i.id)} title={i.pinned ? '固定解除' : '固定'}>
                    {i.pinned ? '★' : '☆'}
                  </button>
                  <button className="btn-icon" onClick={() => remove(i.id)} title="削除">×</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
