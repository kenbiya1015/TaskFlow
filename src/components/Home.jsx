import { useMemo, useEffect, useState } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { findMember } from '../members'
import { STRATEGY_CATEGORIES } from './Strategy'
import { DAILY_ROUTINE, ROADMAP, CURRENT_PHASE_KEY } from '../data/strategyDefaults'
import { fetchEvents } from '../lib/googleCalendar'

function dateKeyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayKey() {
  return dateKeyOf(new Date())
}

function tomorrowKey() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return dateKeyOf(d)
}

function fmtEventTime(ev) {
  if (ev.allDay) return '終日'
  const s = new Date(ev.start)
  const e = ev.end ? new Date(ev.end) : null
  const pad = n => String(n).padStart(2, '0')
  const f = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return e ? `${f(s)}–${f(e)}` : f(s)
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
  const [allTokens, setAllTokens] = useLocalStorage('tf_gcal_user_tokens', {})
  const [allEvents, setAllEvents] = useLocalStorage('tf_gcal_user_events', {})

  const member = findMember(userName)
  const today = todayKey()
  const tomorrow = tomorrowKey()

  const myToken = allTokens[userName] || null
  const tokenValid = myToken && myToken.access_token && myToken.expires_at > Date.now()
  const myEvents = allEvents[userName] || {}
  const todayEvents = myEvents[today] || []
  const tomorrowEvents = myEvents[tomorrow] || []
  const [gcalBusy, setGcalBusy] = useState(false)

  // 有効なトークンがあれば、マイページ表示時にも自動同期（バックグラウンド）
  useEffect(() => {
    let cancelled = false
    if (!tokenValid) return
    setGcalBusy(true)
    const from = new Date(); from.setHours(0, 0, 0, 0)
    const to = new Date(from); to.setDate(to.getDate() + 2)
    fetchEvents(myToken.access_token, from, to)
      .then(items => {
        if (cancelled) return
        const grouped = {}
        items.forEach(ev => {
          const start = ev.start
          if (!start) return
          const key = ev.allDay ? start.slice(0, 10) : dateKeyOf(new Date(start))
          if (!grouped[key]) grouped[key] = []
          grouped[key].push(ev)
        })
        setAllEvents(prev => ({
          ...prev,
          [userName]: {
            ...(prev[userName] || {}),
            [today]: grouped[today] || [],
            [tomorrow]: grouped[tomorrow] || [],
            __syncedAt: Date.now(),
          },
        }))
      })
      .catch(() => {
        // トークン失効の可能性 → 解除
        if (cancelled) return
        setAllTokens(prev => {
          const next = { ...prev }
          delete next[userName]
          return next
        })
      })
      .finally(() => { if (!cancelled) setGcalBusy(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userName])

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

          <div className="card">
            <div className="card-title">
              🗓️ Google カレンダー
              <span style={{ float: 'right', fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                {tokenValid
                  ? (gcalBusy ? '同期中...' : `${userName} さんと連携中`)
                  : '未連携'}
              </span>
            </div>
            {!tokenValid ? (
              <div className="empty" style={{ padding: 16, fontSize: 13 }}>
                スケジュール画面の「📅 Googleカレンダー連携」から自分のアカウントを接続すると、
                ここに今日と明日の予定が自動表示されます。
                <div style={{ marginTop: 10 }}>
                  <button className="btn btn-small" onClick={() => onNavigate?.('schedule')}>
                    📅 スケジュール画面へ
                  </button>
                </div>
              </div>
            ) : (
              <div className="gcal-mini">
                <div className="gcal-day">
                  <div className="gcal-day-label">📅 今日（{today.slice(5)}）　{todayEvents.length}件</div>
                  {todayEvents.length === 0 ? (
                    <div className="gcal-empty">予定なし</div>
                  ) : (
                    todayEvents.map(ev => (
                      <div key={ev.id} className="gcal-event">
                        <span className="gcal-event-time">{fmtEventTime(ev)}</span>
                        <span className="gcal-event-title">{ev.title}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="gcal-day">
                  <div className="gcal-day-label">🌅 明日（{tomorrow.slice(5)}）　{tomorrowEvents.length}件</div>
                  {tomorrowEvents.length === 0 ? (
                    <div className="gcal-empty">予定なし</div>
                  ) : (
                    tomorrowEvents.map(ev => (
                      <div key={ev.id} className="gcal-event">
                        <span className="gcal-event-time">{fmtEventTime(ev)}</span>
                        <span className="gcal-event-title">{ev.title}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
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
