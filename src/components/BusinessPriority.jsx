import { useState, useRef } from 'react'
import { useUserScopedStorage, uid } from '../hooks/useLocalStorage'

// 「今取り組むべき事業TOP10」データ
// ──────────────────────────────────────────────
// ユーザー別に { [user]: [{ id, title, note, order }] } で保存。
// 専用ページ（BusinessPriority）とマイページ（Home の共通リスト）で同じデータを共有する。
export const BIZ_PRIORITY_KEY = 'tf_biz_priority_by_user'

// order 昇順に並べた配列を返す
export function sortByOrder(items) {
  return [...(items || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

// 末尾に空の項目を追加（setItems を渡して呼び出す）
export function addBizItem(setItems) {
  setItems(prev => {
    const arr = sortByOrder(prev)
    const nextOrder = (arr.length ? Math.max(...arr.map(i => i.order ?? 0)) : 0) + 1
    return [...arr, { id: uid(), title: '', note: '', order: nextOrder }]
  })
}

// 並び替え・編集・削除が可能なランキングリスト（専用ページ／マイページ共通）
export function BusinessPriorityList({ items, setItems, compact = false }) {
  const list = sortByOrder(items)
  const [draggedId, setDraggedId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const touchRef = useRef({})

  const update = (id, patch) =>
    setItems(prev => (prev || []).map(it => (it.id === id ? { ...it, ...patch } : it)))

  const remove = (id) => {
    if (!window.confirm('この項目を削除しますか？')) return
    setItems(prev =>
      sortByOrder((prev || []).filter(it => it.id !== id)).map((it, i) => ({ ...it, order: i + 1 }))
    )
  }

  // 並び替え：fromId を toId の位置へ移動し、order を振り直す
  const reorder = (fromId, toId) => {
    if (!fromId || fromId === toId) return
    setItems(prev => {
      const arr = sortByOrder(prev)
      const fromIdx = arr.findIndex(i => i.id === fromId)
      const toIdx = arr.findIndex(i => i.id === toId)
      if (fromIdx < 0 || toIdx < 0) return prev
      const [moved] = arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, moved)
      return arr.map((it, i) => ({ ...it, order: i + 1 }))
    })
  }

  // タッチ長押しD&D（モバイル）。既存のタスクカードと同じ作法。
  const handlePointerDown = (item, e) => {
    if (e.pointerType !== 'touch') return
    const startX = e.clientX
    const startY = e.clientY
    const ref = touchRef.current
    ref.active = false

    const cleanup = () => {
      clearTimeout(ref.longPressTimer)
      ref.longPressTimer = null
      ref.active = false
      document.body.classList.remove('kanban-touch-dragging-active')
      setDraggedId(null)
      setDragOverId(null)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', cleanup)
    }

    const onMove = (ev) => {
      if (!ref.active) {
        if (Math.abs(ev.clientX - startX) > 8 || Math.abs(ev.clientY - startY) > 8) cleanup()
        return
      }
      ev.preventDefault()
      const tgt = document.elementFromPoint(ev.clientX, ev.clientY)
      const rowEl = tgt && tgt.closest ? tgt.closest('[data-biz-id]') : null
      const rid = rowEl && rowEl.getAttribute('data-biz-id')
      setDragOverId(rid && rid !== item.id ? rid : null)
    }

    const onUp = (ev) => {
      if (ref.active) {
        const tgt = document.elementFromPoint(ev.clientX, ev.clientY)
        const rowEl = tgt && tgt.closest ? tgt.closest('[data-biz-id]') : null
        const rid = rowEl && rowEl.getAttribute('data-biz-id')
        if (rid && rid !== item.id) reorder(item.id, rid)
      }
      cleanup()
    }

    ref.longPressTimer = setTimeout(() => {
      ref.active = true
      setDraggedId(item.id)
      document.body.classList.add('kanban-touch-dragging-active')
      if (navigator.vibrate) { try { navigator.vibrate(10) } catch { /* ignore */ } }
    }, 350)

    document.addEventListener('pointermove', onMove, { passive: false })
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', cleanup)
  }

  if (list.length === 0) {
    return (
      <div className="empty" style={{ padding: 16, fontSize: 13 }}>
        まだ項目がありません。「＋ 項目を追加」から登録してください。
      </div>
    )
  }

  return (
    <ol className={`biz-rank-list ${compact ? 'biz-compact' : ''}`}>
      {list.map((item, idx) => {
        const rank = idx + 1
        return (
          <li
            key={item.id}
            data-biz-id={item.id}
            className={`biz-rank-row ${draggedId === item.id ? 'is-dragging' : ''} ${dragOverId === item.id ? 'drag-over' : ''}`}
            draggable
            onDragStart={e => {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', item.id)
              setDraggedId(item.id)
            }}
            onDragEnd={() => { setDraggedId(null); setDragOverId(null) }}
            onDragOver={e => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (dragOverId !== item.id) setDragOverId(item.id)
            }}
            onDragLeave={() => setDragOverId(cur => (cur === item.id ? null : cur))}
            onDrop={e => {
              e.preventDefault()
              const fromId = e.dataTransfer.getData('text/plain')
              reorder(fromId, item.id)
              setDraggedId(null)
              setDragOverId(null)
            }}
            onPointerDown={e => handlePointerDown(item, e)}
          >
            <span className={`biz-rank-badge biz-rank-${rank <= 3 ? rank : 'n'}`}>{rank}</span>
            <span className="biz-drag-handle" title="ドラッグで並び替え" aria-hidden>⋮⋮</span>
            <div className="biz-rank-body">
              <input
                className="text-input biz-rank-title"
                placeholder="事業・取り組み名"
                value={item.title || ''}
                onChange={e => update(item.id, { title: e.target.value })}
              />
              <textarea
                className="textarea biz-rank-note"
                placeholder="備考（詳細・理由・メモ）"
                rows={compact ? 1 : 2}
                value={item.note || ''}
                onChange={e => update(item.id, { note: e.target.value })}
              />
            </div>
            <button
              className="btn-icon biz-rank-del"
              onClick={() => remove(item.id)}
              title="削除"
              aria-label="削除"
            >🗑</button>
          </li>
        )
      })}
    </ol>
  )
}

// 専用ページ
export default function BusinessPriority({ currentUser }) {
  const [items, setItems] = useUserScopedStorage(BIZ_PRIORITY_KEY, currentUser, [])

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">🏆 今取り組むべき事業 TOP10</div>
          <div className="page-subtitle">BUSINESS　PRIORITY</div>
        </div>
        <button className="btn" onClick={() => addBizItem(setItems)}>＋ 項目を追加</button>
      </div>

      <div className="card">
        <div className="card-title">
          優先順位ランキング
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
            ドラッグ＆ドロップで並び替え
          </span>
        </div>
        <BusinessPriorityList items={items} setItems={setItems} />
        <div style={{ marginTop: 14 }}>
          <button className="btn btn-secondary" onClick={() => addBizItem(setItems)}>＋ 項目を追加</button>
        </div>
      </div>
    </div>
  )
}
