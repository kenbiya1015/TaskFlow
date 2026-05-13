import { useMemo } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { findMember } from '../members'
import { STRATEGY_CATEGORIES } from './Strategy'
import { DAILY_ROUTINE, ROADMAP, CURRENT_PHASE_KEY } from '../data/strategyDefaults'

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'こんばんは'
  if (h < 11) return 'おはようございます'
  if (h < 18) return 'こんにちは'
  return 'おつかれさまです'
}

export default function Home({ userName, onNavigate }) {
  const [tasks] = useLocalStorage('tf_tasks', [])
  const [schedule] = useLocalStorage('tf_schedule', {})
  const [ideas] = useLocalStorage('tf_ideas', [])
  const [memos] = useLocalStorage('tf_mtmemos', [])
  const [strategies] = useLocalStorage('tf_strategies', {})
  const [routineLog, setRoutineLog] = useLocalStorage('tf_daily_routine', {})

  const member = findMember(userName)
  const today = todayKey()

  const myTasks = useMemo(
    () => tasks
      .filter(t => t.member === userName && !t.done)
      .sort((a, b) => {
        const p = { 高: 0, 中: 1, 低: 2 }
        return (p[a.priority] ?? 9) - (p[b.priority] ?? 9)
      })
      .slice(0, 8),
    [tasks, userName]
  )

  const myDoneCount = tasks.filter(t => t.member === userName && t.done).length
  const myOpenCount = tasks.filter(t => t.member === userName && !t.done).length

  const todayEntries = useMemo(() => {
    const day = schedule[today]?.[userName] || {}
    const list = []
    Object.keys(day).forEach(h => {
      (day[h] || []).forEach(e => list.push({ hour: Number(h), text: e.text, id: e.id }))
    })
    return list.sort((a, b) => a.hour - b.hour)
  }, [schedule, today, userName])

  const myIdeas = useMemo(
    () => ideas.filter(i => i.author === userName).slice(0, 5),
    [ideas, userName]
  )

  const myMemoCount = memos.length
  const dt = new Date()
  const days = ['日', '月', '火', '水', '木', '金', '土']
  const dateLabel = `${dt.getMonth() + 1}月${dt.getDate()}日（${days[dt.getDay()]}）`

  const todayRoutine = routineLog[today] || {}
  const toggleRoutine = key => {
    setRoutineLog({
      ...routineLog,
      [today]: { ...todayRoutine, [key]: !todayRoutine[key] },
    })
  }
  const routineDone = DAILY_ROUTINE.filter(r => todayRoutine[r.key]).length

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="home-greeting">
            {greeting()}、{userName} さん
          </div>
          <div className="page-subtitle">{dateLabel}　·　MY　HOME</div>
        </div>
        <div
          className="member-avatar"
          style={{
            width: 52, height: 52, fontSize: 20, marginBottom: 0,
            background: `linear-gradient(135deg, ${member?.color || '#2f6fed'}, ${member?.color || '#2f6fed'}cc)`,
          }}
        >
          {member?.initial || userName.slice(0, 1)}
        </div>
      </div>

      <div className="stats-bar">
        <div className="stat-tile">
          <div className="stat-num">{myOpenCount}</div>
          <div className="stat-label">未完了タスク</div>
        </div>
        <div className="stat-tile">
          <div className="stat-num">{myDoneCount}</div>
          <div className="stat-label">完了タスク</div>
        </div>
        <div className="stat-tile">
          <div className="stat-num">{todayEntries.length}</div>
          <div className="stat-label">今日の予定</div>
        </div>
        <div className="stat-tile">
          <div className="stat-num">{myMemoCount}</div>
          <div className="stat-label">MTメモ</div>
        </div>
      </div>

      <div className="home-grid">
        <div>
          <div className="card">
            <div className="card-title">
              ✅ 自分のタスク（未完了 上位）
              <button
                className="btn btn-small btn-secondary"
                style={{ float: 'right' }}
                onClick={() => onNavigate?.('tasks')}
              >
                すべて見る →
              </button>
            </div>
            {myTasks.length === 0 ? (
              <div className="empty" style={{ padding: 20 }}>未完了のタスクはありません</div>
            ) : (
              <ul className="task-list">
                {myTasks.map(t => (
                  <li key={t.id} className="task-item" style={{ gridTemplateColumns: '1fr auto auto auto' }}>
                    <div className="task-text">{t.text}</div>
                    <span className={`tag tag-${t.category}`}>{t.category}</span>
                    <span className={`task-priority priority-${t.priority}`}>● {t.priority}</span>
                    <span className="task-meta">{t.due ? `〜${t.due.slice(5)}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <div className="card-title">
              📅 今日のスケジュール
              <button
                className="btn btn-small btn-secondary"
                style={{ float: 'right' }}
                onClick={() => onNavigate?.('schedule')}
              >
                編集 →
              </button>
            </div>
            {todayEntries.length === 0 ? (
              <div className="empty" style={{ padding: 20 }}>本日の予定はまだありません</div>
            ) : (
              todayEntries.map(e => (
                <div key={e.id} className="timeline-entry" style={{ marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-muted)', marginRight: 10, fontSize: 12 }}>
                    {String(e.hour).padStart(2, '0')}:00
                  </span>
                  {e.text}
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-title">
              🎯 今日やること3つ
              <span style={{ float: 'right', fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
                {routineDone}/{DAILY_ROUTINE.length} 完了
              </span>
            </div>
            <div className="daily-routine">
              {DAILY_ROUTINE.map(r => {
                const done = !!todayRoutine[r.key]
                return (
                  <label key={r.key} className={`routine-row ${done ? 'done' : ''}`}>
                    <input
                      type="checkbox"
                      className="task-check"
                      checked={done}
                      onChange={() => toggleRoutine(r.key)}
                    />
                    <span className="routine-time">{r.icon} {r.time}</span>
                    <span className="routine-text">{r.text}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              🗺️ ロードマップ進捗
              <button
                className="btn btn-small btn-secondary"
                style={{ float: 'right' }}
                onClick={() => onNavigate?.('strategy')}
              >→ 戦略</button>
            </div>
            <div className="roadmap-list">
              {ROADMAP.map((r, i) => {
                const isCurrent = r.key === CURRENT_PHASE_KEY
                const reached = ROADMAP.findIndex(x => x.key === CURRENT_PHASE_KEY) >= i
                return (
                  <div
                    key={r.key}
                    className={`roadmap-row ${isCurrent ? 'current' : ''} ${reached ? 'reached' : ''}`}
                  >
                    <div className="roadmap-dot">{i + 1}</div>
                    <div className="roadmap-body">
                      <div className="roadmap-phase">
                        {r.phase}
                        {isCurrent && <span className="roadmap-badge">現在地</span>}
                      </div>
                      <div className="roadmap-goal">{r.goal}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              💡 自分のアイデア
              <button
                className="btn btn-small btn-secondary"
                style={{ float: 'right' }}
                onClick={() => onNavigate?.('ideas')}
              >
                → 一覧
              </button>
            </div>
            {myIdeas.length === 0 ? (
              <div className="empty" style={{ padding: 16, fontSize: 12 }}>まだありません</div>
            ) : (
              myIdeas.map(i => (
                <div key={i.id} className="idea-card" style={{ minHeight: 0, marginBottom: 8, padding: 12 }}>
                  <div className="idea-text" style={{ fontSize: 13, marginBottom: 4 }}>{i.text}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {new Date(i.createdAt).toLocaleDateString('ja-JP')}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <div className="card-title">
              📋 戦略・戦術サマリー
              <button
                className="btn btn-small btn-secondary"
                style={{ float: 'right' }}
                onClick={() => onNavigate?.('strategy')}
              >→ 詳細</button>
            </div>
            <div className="strategy-summary">
              {STRATEGY_CATEGORIES.map(cat => {
                const e = strategies[cat.id] || {}
                const open = (e.tactics || []).filter(t => !t.done).length
                const total = (e.tactics || []).length
                const head = (e.strategy || '').split('\n')[0] || '未記入'
                return (
                  <div key={cat.id} className="strategy-summary-row" title={e.strategy || ''}>
                    <span style={{ fontSize: 14 }}>{cat.emoji}</span>
                    <div>
                      <div className="name">{cat.name}</div>
                      <div className="preview">{head}</div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>戦術 {open}/{total}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="card">
            <div className="card-title">クイックジャンプ</div>
            <div style={{ display: 'grid', gap: 6 }}>
              <button className="btn btn-secondary" onClick={() => onNavigate?.('mt')}>📝 MTメモを書く</button>
              <button className="btn btn-secondary" onClick={() => onNavigate?.('goals')}>🎯 目標を見る</button>
              <button className="btn btn-secondary" onClick={() => onNavigate?.('being')}>🌟 なりたい自分</button>
              <button className="btn btn-secondary" onClick={() => onNavigate?.('future')}>🚀 今後の取り組み</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
