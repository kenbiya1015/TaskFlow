import { useState, useRef, useEffect } from 'react'
import { useLocalStorage, uid } from '../hooks/useLocalStorage'
import { useAutoSave } from '../hooks/useAutoSave'

const EMPTY_PERSON = { description: '', items: [] }

export default function BeingGoals({ currentUser }) {
  const [data, setData] = useLocalStorage('tf_being', {})
  const [newItem, setNewItem] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingText, setEditingText] = useState('')

  // ドラッグ&ドロップ
  const [draggedId, setDraggedId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const touchDragRef = useRef({})

  const me = currentUser
  const personData = (data && data[me]) || EMPTY_PERSON
  const items = personData.items || []

  // 「理想像」のローカルドラフト：textarea を data から切り離して
  // クラウド同期による上書きで入力中の文字が消えないようにする
  const [descDraft, setDescDraft] = useState(personData.description || '')
  // 「現在のユーザー」をローカルドラフトと一緒に保持し、
  // 自動保存中にユーザーが切り替わっても別ユーザーへの書き込みを防ぐ
  const [descUser, setDescUser] = useState(me)

  // ログインユーザーが変わったらドラフトをそのユーザーの値へ再同期
  useEffect(() => {
    setDescDraft((data && data[me] && data[me].description) || '')
    setDescUser(me)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me])

  // 理想像：1秒debounceで現在ユーザーのスロットだけを更新（他ユーザーを上書きしない）
  useAutoSave({ user: descUser, desc: descDraft }, (val) => {
    if (!val.user) return
    setData(prev => {
      const safePrev = (prev && typeof prev === 'object') ? prev : {}
      const p = safePrev[val.user] || EMPTY_PERSON
      if ((p.description || '') === (val.desc || '')) return safePrev
      return { ...safePrev, [val.user]: { ...p, description: val.desc || '' } }
    })
  })

  // 現在ユーザーのスロットだけを functional update で書き換える
  // （setData(prev => ...) なのでクラウド同期等で data が変わっていても安全）
  const updatePerson = (user, mutate) => {
    if (!user) return
    setData(prev => {
      const safePrev = (prev && typeof prev === 'object') ? prev : {}
      const p = safePrev[user] || EMPTY_PERSON
      const next = mutate(p)
      if (next === p) return safePrev
      return { ...safePrev, [user]: next }
    })
  }

  const writeItemsForUser = (user, mutator) => {
    updatePerson(user, p => ({ ...p, items: mutator(p.items || []) }))
  }

  const addItem = () => {
    const txt = newItem.trim()
    if (!txt) return
    const user = me
    writeItemsForUser(user, list => [...list, { id: uid(), text: txt, done: false }])
    setNewItem('')
  }

  const toggleItem = id => {
    const user = me
    writeItemsForUser(user, list => list.map(i => i.id === id ? { ...i, done: !i.done } : i))
  }

  const removeItem = id => {
    const user = me
    writeItemsForUser(user, list => list.filter(i => i.id !== id))
  }

  const startEdit = (item) => {
    setEditingId(item.id)
    setEditingText(item.text)
  }
  const closeEdit = () => {
    setEditingId(null)
    setEditingText('')
  }

  // 実践項目の編集：ユーザーIDを値に含めて、編集中にログインユーザーが
  // 切り替わっても元ユーザーの項目だけを更新する
  useAutoSave({ user: me, id: editingId, text: editingText }, (val) => {
    if (!val.id || !val.user) return
    const txt = (val.text || '').trim()
    if (!txt) return
    writeItemsForUser(val.user, list => list.map(i => i.id === val.id ? { ...i, text: txt } : i))
  })

  const reorder = (fromId, toId) => {
    if (!fromId || fromId === toId) return
    const user = me
    writeItemsForUser(user, list => {
      const fromIdx = list.findIndex(i => i.id === fromId)
      const toIdx = list.findIndex(i => i.id === toId)
      if (fromIdx < 0 || toIdx < 0) return list
      const next = [...list]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
  }

  // タッチ用ロングプレスD&D
  const handlePointerDown = (item, e) => {
    if (e.pointerType !== 'touch') return
    if (editingId === item.id) return
    const startX = e.clientX
    const startY = e.clientY
    const ref = touchDragRef.current
    ref.active = false

    const cleanup = () => {
      clearTimeout(ref.longPressTimer)
      ref.longPressTimer = null
      ref.active = false
      document.body.classList.remove('practice-touch-dragging')
      setDraggedId(null)
      setDragOverId(null)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', cleanup)
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
      const row = tgt && tgt.closest ? tgt.closest('[data-practice-id]') : null
      if (row) {
        const tid = row.getAttribute('data-practice-id')
        if (tid && tid !== item.id) setDragOverId(tid)
      } else {
        setDragOverId(null)
      }
    }
    const onUp = (ev) => {
      if (ref.active) {
        const tgt = document.elementFromPoint(ev.clientX, ev.clientY)
        const row = tgt && tgt.closest ? tgt.closest('[data-practice-id]') : null
        if (row) {
          const tid = row.getAttribute('data-practice-id')
          if (tid && tid !== item.id) reorder(item.id, tid)
        }
      }
      cleanup()
    }
    ref.longPressTimer = setTimeout(() => {
      ref.active = true
      setDraggedId(item.id)
      document.body.classList.add('practice-touch-dragging')
      if (navigator.vibrate) { try { navigator.vibrate(10) } catch { /* ignore */ } }
    }, 350)
    document.addEventListener('pointermove', onMove, { passive: false })
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', cleanup)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">なりたい自分</div>
          <div className="page-subtitle">BEING　·　めざす自分像</div>
        </div>
      </div>

      <div className="vision-section">
        <div className="vision-section-title">{me} の理想像</div>
        <div className="vision-section-en">SELF　IMAGE</div>
        <textarea
          className="textarea"
          style={{ marginLeft: 16, width: 'calc(100% - 16px)', minHeight: 140, fontSize: 15, lineHeight: 1.85 }}
          placeholder="どんな自分になりたいか、ありたい姿、心の在り方..."
          value={descDraft}
          onChange={e => setDescDraft(e.target.value)}
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
          {items.length === 0 ? (
            <div className="empty" style={{ padding: 20 }}>実践項目はまだありません</div>
          ) : (
            items.map(i => {
              const isEditing = editingId === i.id
              const isDragOver = dragOverId === i.id
              const isDragging = draggedId === i.id
              return (
                <div
                  key={i.id}
                  data-practice-id={i.id}
                  className={`year-goal-item practice-row ${isDragOver ? 'drag-over' : ''} ${isDragging ? 'is-dragging' : ''}`}
                  draggable={!isEditing}
                  onDragStart={e => {
                    if (isEditing) { e.preventDefault(); return }
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', i.id)
                    setDraggedId(i.id)
                  }}
                  onDragOver={e => {
                    if (!draggedId || draggedId === i.id) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    if (dragOverId !== i.id) setDragOverId(i.id)
                  }}
                  onDragLeave={() => {
                    if (dragOverId === i.id) setDragOverId(null)
                  }}
                  onDrop={e => {
                    e.preventDefault()
                    const fromId = e.dataTransfer.getData('text/plain') || draggedId
                    if (fromId && fromId !== i.id) reorder(fromId, i.id)
                    setDraggedId(null)
                    setDragOverId(null)
                  }}
                  onDragEnd={() => { setDraggedId(null); setDragOverId(null) }}
                  onPointerDown={e => handlePointerDown(i, e)}
                >
                  <span className="practice-drag-handle" title="ドラッグで並び替え" aria-hidden>⋮⋮</span>
                  <input type="checkbox" className="task-check" checked={i.done} onChange={() => toggleItem(i.id)} />
                  {isEditing ? (
                    <>
                      <input
                        className="text-input"
                        style={{ flex: 1 }}
                        value={editingText}
                        onChange={e => setEditingText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); closeEdit() }
                        }}
                        autoFocus
                      />
                      <button className="btn btn-small btn-secondary" onClick={closeEdit}>閉じる</button>
                    </>
                  ) : (
                    <>
                      <div style={{ flex: 1, textDecoration: i.done ? 'line-through' : 'none', opacity: i.done ? 0.55 : 1 }}>
                        {i.text}
                      </div>
                      <button className="btn-icon" onClick={() => startEdit(i)} title="編集">✏️</button>
                      <button className="btn-icon" onClick={() => removeItem(i.id)} title="削除">×</button>
                    </>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
