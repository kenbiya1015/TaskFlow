import { useLocalStorage } from '../hooks/useLocalStorage'
import { MEMBERS as BASE_MEMBERS } from '../members'

const DEFAULT_MEMBERS = [
  { ...BASE_MEMBERS[0], note: '健美屋・整体信玄を統括。SNS発信・全体戦略担当。' },
  { ...BASE_MEMBERS[1], note: '日々の運営、顧客対応、店舗オペレーション担当。' },
  { ...BASE_MEMBERS[2], note: '整体施術、お客様サポート、現場対応担当。' },
]

export default function Members({ currentUser }) {
  const [members, setMembers] = useLocalStorage('tf_members', DEFAULT_MEMBERS)
  const [tasks] = useLocalStorage('tf_tasks', [])

  const updateNote = (id, note) => {
    setMembers(members.map(m => m.id === id ? { ...m, note } : m))
  }

  const updateRole = (id, role) => {
    setMembers(members.map(m => m.id === id ? { ...m, role } : m))
  }

  const statsFor = name => {
    const my = tasks.filter(t => t.member === name)
    return {
      total: my.length,
      open: my.filter(t => !t.done).length,
      done: my.filter(t => t.done).length,
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">メンバー管理</div>
          <div className="page-subtitle">MEMBERS</div>
        </div>
      </div>

      <div className="member-grid">
        {[...members].sort((a, b) => {
          if (a.name === currentUser) return -1
          if (b.name === currentUser) return 1
          return 0
        }).map(m => {
          const s = statsFor(m.name)
          return (
            <div key={m.id} className={`member-card ${m.name === currentUser ? 'is-self' : ''}`}>
              <div className="member-avatar" style={{ background: `linear-gradient(135deg, ${m.color}, ${m.color}aa)` }}>
                {m.initial}
              </div>
              <div className="member-name">{m.name}</div>
              <input
                className="text-input"
                style={{ width: '100%', marginBottom: 10, fontSize: 12 }}
                value={m.role}
                onChange={e => updateRole(m.id, e.target.value)}
              />
              <textarea
                className="textarea"
                style={{ fontSize: 13, minHeight: 60, marginBottom: 8 }}
                value={m.note}
                onChange={e => updateNote(m.id, e.target.value)}
                placeholder="メモ"
              />
              <div className="member-stats">
                <div><div className="member-stat-num">{s.total}</div>総タスク</div>
                <div><div className="member-stat-num">{s.open}</div>未完了</div>
                <div><div className="member-stat-num">{s.done}</div>完了</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
