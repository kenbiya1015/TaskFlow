function dueStatus(due) {
  if (!due) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(due); d.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((d - today) / 86400000)
  if (diffDays < 0) return { key: 'overdue', label: `${-diffDays}日経過` }
  if (diffDays === 0) return { key: 'today', label: '今日' }
  if (diffDays <= 3) return { key: 'soon', label: `あと${diffDays}日` }
  return { key: 'later', label: `〜${due.slice(5)}` }
}

export default function DueEdit({ due, onChange }) {
  const ds = dueStatus(due)
  const badgeClass = ds ? `due-badge due-${ds.key}` : 'due-badge due-none'
  const labelText = ds ? ds.label : '期日なし'
  return (
    <label
      className="due-edit"
      title={due ? `期日: ${due}（タップで変更）` : 'タップで期日を設定'}
      onClick={e => e.stopPropagation()}
    >
      <span className={badgeClass}>{labelText}</span>
      <input
        type="date"
        className="due-edit-input"
        value={due || ''}
        onChange={e => onChange(e.target.value)}
        onClick={e => e.stopPropagation()}
      />
    </label>
  )
}
