import { useState } from 'react'
import { useLocalStorage, useUserScopedStorage, uid } from '../hooks/useLocalStorage'

const PICK_HOURS = Array.from({ length: 19 }, (_, i) => i + 6)

function dateKeyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtHandoffDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function HandoffSection({ currentUser, onRestore }) {
  const [balls, setBalls] = useUserScopedStorage('tf_handoff_balls_by_user', currentUser, [])
  const [, setSchedule] = useLocalStorage('tf_schedule', {})

  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editText, setEditText] = useState('')

  const [schedFor, setSchedFor] = useState(null)
  const [schedDay, setSchedDay] = useState('today')
  const [schedHour, setSchedHour] = useState(9)
  const [schedMsg, setSchedMsg] = useState('')

  const remove = (id) => setBalls((balls || []).filter(b => b.id !== id))

  const startEdit = (b) => {
    setSchedFor(null)
    setEditingId(b.id)
    setEditName(b.recipient || '')
    setEditText(b.text || '')
  }
  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditText('')
  }
  const saveEdit = (id) => {
    const name = editName.trim()
    const text = editText.trim()
    if (!name || !text) return
    setBalls((balls || []).map(b => b.id === id ? { ...b, recipient: name, text } : b))
    cancelEdit()
  }

  const restore = (b) => {
    onRestore?.(b)
    remove(b.id)
  }

  const openSched = (id) => {
    setEditingId(null)
    setSchedFor(id)
    setSchedDay('today')
    setSchedHour(9)
    setSchedMsg('')
  }
  const closeSched = () => {
    setSchedFor(null)
    setSchedMsg('')
  }
  const submitSched = (b) => {
    const base = new Date()
    base.setHours(0, 0, 0, 0)
    if (schedDay === 'tomorrow') base.setDate(base.getDate() + 1)
    const dateK = dateKeyOf(base)
    setSchedule(prev => {
      const next = { ...prev }
      next[dateK] = { ...(next[dateK] || {}) }
      next[dateK][currentUser] = { ...(next[dateK][currentUser] || {}) }
      const list = next[dateK][currentUser][schedHour] || []
      next[dateK][currentUser][schedHour] = [...list, {
        id: uid(),
        text: `🏐 [${b.recipient}] ${b.text}`,
        category: '相手ボール',
      }]
      return next
    })
    setSchedMsg(`${schedDay === 'today' ? '今日' : '明日'} ${String(schedHour).padStart(2, '0')}:00 に追加しました`)
    setTimeout(() => closeSched(), 900)
  }

  const list = balls || []
  const sorted = [...list].sort((a, b) => (b.handedAt || b.createdAt || 0) - (a.handedAt || a.createdAt || 0))

  return (
    <div className="card handoff-section">
      <div className="card-title">
        🏐 相手ボール一覧
        <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
          {list.length} 件
        </span>
      </div>
      {sorted.length === 0 ? (
        <div className="empty" style={{ padding: 18 }}>
          相手ボールはまだありません
        </div>
      ) : (
        <div className="handoff-list">
          {sorted.map(b => {
            const isEditing = editingId === b.id
            const isSched = schedFor === b.id
            return (
              <div key={b.id} className={`handoff-item ${isEditing ? 'is-editing' : ''}`}>
                {isEditing ? (
                  <div className="handoff-edit">
                    <input
                      className="text-input"
                      placeholder="渡した相手の名前"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      autoFocus
                    />
                    <textarea
                      className="textarea"
                      placeholder="内容"
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      rows={2}
                    />
                    <div className="handoff-edit-actions">
                      <button className="btn btn-small btn-secondary" onClick={cancelEdit}>キャンセル</button>
                      <button className="btn btn-small" onClick={() => saveEdit(b.id)}>保存</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="handoff-body">
                      <div className="handoff-head">
                        <span className="handoff-to">→ {b.recipient}</span>
                        {b.category && <span className={`tag tag-${b.category}`}>{b.category}</span>}
                        <span className="handoff-date">{fmtHandoffDate(b.handedAt || b.createdAt)}</span>
                      </div>
                      <div className="handoff-text">{b.text}</div>
                    </div>
                    <div className="handoff-actions">
                      <button
                        className="kanban-card-btn handoff-btn-restore"
                        onClick={() => restore(b)}
                        title="タスクに戻す"
                        aria-label="タスクに戻す"
                      >↩</button>
                      <button
                        className="kanban-card-btn kanban-card-edit"
                        onClick={() => startEdit(b)}
                        title="編集"
                        aria-label="編集"
                      >✏️</button>
                      <button
                        className={`kanban-card-btn kanban-card-sched ${isSched ? 'on' : ''}`}
                        onClick={() => isSched ? closeSched() : openSched(b.id)}
                        title="カレンダーに追加"
                        aria-label="カレンダーに追加"
                      >📅</button>
                      <button
                        className="kanban-card-btn kanban-card-del"
                        onClick={() => remove(b.id)}
                        title="削除"
                        aria-label="削除"
                      >🗑</button>
                    </div>
                    {isSched && (
                      <div className="kanban-sched-pop handoff-sched-pop" onClick={e => e.stopPropagation()}>
                        <div className="kanban-sched-title">📅 スケジュールに追加</div>
                        <div className="kanban-sched-day-row">
                          <button
                            className={`kanban-sched-day ${schedDay === 'today' ? 'on' : ''}`}
                            onClick={() => setSchedDay('today')}
                          >今日</button>
                          <button
                            className={`kanban-sched-day ${schedDay === 'tomorrow' ? 'on' : ''}`}
                            onClick={() => setSchedDay('tomorrow')}
                          >明日</button>
                        </div>
                        <div className="kanban-sched-hour-row">
                          <label className="kanban-sched-label">時刻</label>
                          <select
                            className="select"
                            value={schedHour}
                            onChange={e => setSchedHour(Number(e.target.value))}
                          >
                            {PICK_HOURS.map(h => (
                              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                            ))}
                          </select>
                        </div>
                        <div className="kanban-sched-actions">
                          <button className="btn btn-small btn-secondary" onClick={closeSched}>キャンセル</button>
                          <button className="btn btn-small" onClick={() => submitSched(b)}>＋ 追加</button>
                        </div>
                        {schedMsg && <div className="kanban-sched-msg">{schedMsg}</div>}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
