import { useEffect, useRef, useState } from 'react'
import { useLocalStorage, useUserScopedStorage, uid } from '../hooks/useLocalStorage'
import { useAutoSave } from '../hooks/useAutoSave'

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

  // D&D 並び替え
  const [draggedId, setDraggedId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const touchDragRef = useRef({})

  // 互換性：order が未設定の項目に handedAt 降順で order を付与
  useEffect(() => {
    const list = balls || []
    if (list.length === 0) return
    if (!list.some(b => b.order == null)) return
    const sorted = [...list].sort((a, b) =>
      (b.handedAt || b.createdAt || 0) - (a.handedAt || a.createdAt || 0)
    )
    const orderMap = new Map(sorted.map((b, i) => [b.id, i + 1]))
    setBalls(list.map(b => ({ ...b, order: b.order ?? orderMap.get(b.id) ?? 999 })))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const remove = (id) => setBalls((balls || []).filter(b => b.id !== id))

  const startEdit = (b) => {
    setSchedFor(null)
    setEditingId(b.id)
    setEditName(b.recipient || '')
    setEditText(b.text || '')
  }
  const closeEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditText('')
  }

  useAutoSave({ id: editingId, name: editName, text: editText }, (val) => {
    if (!val.id) return
    const name = (val.name || '').trim()
    const text = (val.text || '').trim()
    if (!name || !text) return
    setBalls(prev => (prev || []).map(b => b.id === val.id ? { ...b, recipient: name, text } : b))
  })

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

  const reorderBalls = (fromId, toId) => {
    if (!fromId || fromId === toId) return
    const list = [...(balls || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const fromIdx = list.findIndex(b => b.id === fromId)
    const toIdx = list.findIndex(b => b.id === toId)
    if (fromIdx < 0 || toIdx < 0) return
    const [moved] = list.splice(fromIdx, 1)
    list.splice(toIdx, 0, moved)
    setBalls(list.map((b, i) => ({ ...b, order: i + 1 })))
  }

  // タッチ長押しD&D
  const handleItemPointerDown = (b, e) => {
    if (e.pointerType !== 'touch') return
    if (editingId === b.id) return
    const startX = e.clientX
    const startY = e.clientY
    const ref = touchDragRef.current
    ref.active = false
    ref.ballId = b.id

    const cleanup = () => {
      clearTimeout(ref.longPressTimer)
      ref.longPressTimer = null
      ref.active = false
      document.body.classList.remove('kanban-touch-dragging-active')
      setDraggedId(null)
      setDragOverId(null)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onCancel)
    }

    const onMove = (ev) => {
      if (!ref.active) {
        const dx = Math.abs(ev.clientX - startX)
        const dy = Math.abs(ev.clientY - startY)
        if (dx > 8 || dy > 8) cleanup()
        return
      }
      ev.preventDefault()
      const tgt = document.elementFromPoint(ev.clientX, ev.clientY)
      const itemEl = tgt && tgt.closest ? tgt.closest('[data-handoff-id]') : null
      if (itemEl) {
        const tid = itemEl.getAttribute('data-handoff-id')
        if (tid && tid !== b.id) {
          setDragOverId(tid)
          return
        }
      }
      setDragOverId(null)
    }

    const onUp = (ev) => {
      if (ref.active) {
        const tgt = document.elementFromPoint(ev.clientX, ev.clientY)
        const itemEl = tgt && tgt.closest ? tgt.closest('[data-handoff-id]') : null
        if (itemEl) {
          const tid = itemEl.getAttribute('data-handoff-id')
          if (tid && tid !== b.id) reorderBalls(b.id, tid)
        }
      }
      cleanup()
    }
    const onCancel = () => cleanup()

    ref.longPressTimer = setTimeout(() => {
      ref.active = true
      setDraggedId(b.id)
      document.body.classList.add('kanban-touch-dragging-active')
      if (navigator.vibrate) { try { navigator.vibrate(10) } catch { /* ignore */ } }
    }, 350)

    document.addEventListener('pointermove', onMove, { passive: false })
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onCancel)
  }

  const list = balls || []
  const sorted = [...list].sort((a, b) => {
    const ao = a.order ?? Number.MAX_SAFE_INTEGER
    const bo = b.order ?? Number.MAX_SAFE_INTEGER
    if (ao !== bo) return ao - bo
    return (b.handedAt || b.createdAt || 0) - (a.handedAt || a.createdAt || 0)
  })

  return (
    <div className="card handoff-section">
      <div className="card-title">
        🏐 相手ボール一覧
        <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
          {list.length} 件　·　ドラッグで並び替え
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
            const isDragOver = dragOverId === b.id
            const isDragging = draggedId === b.id
            return (
              <div
                key={b.id}
                data-handoff-id={b.id}
                className={`handoff-item ${isEditing ? 'is-editing' : ''} ${isDragOver ? 'drag-over' : ''} ${isDragging ? 'is-dragging' : ''}`}
                draggable={!isEditing}
                onDragStart={e => {
                  if (isEditing) { e.preventDefault(); return }
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', b.id)
                  setDraggedId(b.id)
                }}
                onDragOver={e => {
                  if (!draggedId || draggedId === b.id) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (dragOverId !== b.id) setDragOverId(b.id)
                }}
                onDragLeave={() => {
                  if (dragOverId === b.id) setDragOverId(null)
                }}
                onDrop={e => {
                  e.preventDefault()
                  const fromId = e.dataTransfer.getData('text/plain') || draggedId
                  if (fromId && fromId !== b.id) reorderBalls(fromId, b.id)
                  setDraggedId(null)
                  setDragOverId(null)
                }}
                onDragEnd={() => {
                  setDraggedId(null)
                  setDragOverId(null)
                }}
                onPointerDown={e => handleItemPointerDown(b, e)}
              >
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
                      <button className="btn btn-small btn-secondary" onClick={closeEdit}>閉じる</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="handoff-drag-handle" title="ドラッグで並び替え" aria-hidden>⋮⋮</span>
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
