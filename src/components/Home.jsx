import { useMemo, useEffect, useState } from 'react'
import { useLocalStorage, useUserScopedStorage, uid } from '../hooks/useLocalStorage'
import { findMember } from '../members'
import { DAILY_ROUTINE, ROADMAP, CURRENT_PHASE_KEY } from '../data/strategyDefaults'
import { fetchEvents } from '../lib/googleCalendar'

const WEEK_DAYS_JP = ['日', '月', '火', '水', '木', '金', '土']

function dateKeyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayKey() {
  return dateKeyOf(new Date())
}

function fmtEventTime(ev) {
  if (ev.allDay) return '終日'
  const s = new Date(ev.start)
  const e = ev.end ? new Date(ev.end) : null
  const pad = n => String(n).padStart(2, '0')
  const f = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return e ? `${f(s)}–${f(e)}` : f(s)
}

function normalizePriority(p) {
  if (p === '高') return 'A'
  if (p === '中') return 'B'
  if (p === '低') return 'C'
  if (['A', 'B', 'C', 'D'].includes(p)) return p
  return 'C'
}

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

export default function Home({ userName, onNavigate }) {
  // 個人別データ
  const [tasks] = useUserScopedStorage('tf_tasks_by_user', userName, [])
  const [ideas] = useUserScopedStorage('tf_ideas_by_user', userName, [])
  const [memos] = useUserScopedStorage('tf_mtmemos_by_user', userName, [])
  const [overall] = useUserScopedStorage('tf_strategy_overall_by_user', userName, { strategy: '', tactics: '' })
  const [futures] = useUserScopedStorage('tf_future_by_user', userName, [])
  const [routineItems, setRoutineItems] = useUserScopedStorage('tf_routine_items_by_user', userName, DAILY_ROUTINE)
  const [roadmapItems, setRoadmapItems] = useUserScopedStorage('tf_roadmap_by_user', userName, ROADMAP)
  const [currentPhase, setCurrentPhase] = useUserScopedStorage('tf_current_phase_by_user', userName, CURRENT_PHASE_KEY)
  const [routineLog, setRoutineLog] = useUserScopedStorage('tf_daily_routine_by_user', userName, {})

  // 共有データ
  const [schedule] = useLocalStorage('tf_schedule', {})
  const [being] = useLocalStorage('tf_being', {})
  const [allTokens, setAllTokens] = useLocalStorage('tf_gcal_user_tokens', {})
  const [allEvents, setAllEvents] = useLocalStorage('tf_gcal_user_events', {})

  const member = findMember(userName)
  const today = todayKey()

  const myToken = allTokens[userName] || null
  const tokenValid = myToken && myToken.access_token && myToken.expires_at > Date.now()
  const myEvents = allEvents[userName] || {}
  const [gcalBusy, setGcalBusy] = useState(false)

  // 有効なトークンがあれば、今日と明日のGCalを自動同期
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
        setAllEvents(prev => {
          const userEvents = { ...(prev[userName] || {}) }
          const tomorrow = new Date(from); tomorrow.setDate(tomorrow.getDate() + 1)
          const tkey = dateKeyOf(tomorrow)
          userEvents[today] = grouped[today] || []
          userEvents[tkey] = grouped[tkey] || []
          userEvents.__syncedAt = Date.now()
          return { ...prev, [userName]: userEvents }
        })
      })
      .catch(() => {
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
      .filter(t => !t.done)
      .sort((a, b) => {
        const ao = a.order ?? Number.MAX_SAFE_INTEGER
        const bo = b.order ?? Number.MAX_SAFE_INTEGER
        return ao - bo
      })
      .slice(0, 8),
    [tasks]
  )

  const myDoneCount = tasks.filter(t => t.done).length
  const myOpenCount = tasks.filter(t => !t.done).length
  const myMemoCount = memos.length

  // 今日のスケジュール（GCal + 手動入力をマージ）
  const todayScheduleItems = useMemo(() => {
    const list = []
    // 手動入力
    const day = schedule[today]?.[userName] || {}
    Object.keys(day).forEach(h => {
      (day[h] || []).forEach(e => list.push({
        id: e.id,
        hour: Number(h),
        text: e.text,
        source: 'manual',
        category: e.category,
      }))
    })
    // GCalイベント
    const events = (myEvents[today] || []).filter(Boolean)
    events.forEach(ev => {
      let hour = 0
      if (!ev.allDay && ev.start) {
        const d = new Date(ev.start)
        hour = d.getHours()
      }
      list.push({
        id: `gcal-${ev.id}`,
        hour,
        text: ev.title,
        source: 'gcal',
        allDay: ev.allDay,
        timeRange: fmtEventTime(ev),
      })
    })
    return list.sort((a, b) => {
      // 終日は先頭
      if (a.allDay && !b.allDay) return -1
      if (!a.allDay && b.allDay) return 1
      return a.hour - b.hour
    })
  }, [schedule, myEvents, today, userName])

  const myIdeas = useMemo(
    () => ideas.slice(0, 5),
    [ideas]
  )

  // なりたい自分の実践（現在ユーザー）
  const myBeing = being[userName] || { description: '', items: [] }
  const myBeingItems = (myBeing.items || []).slice(0, 8)

  // 今後の取り組み（最大6件）
  const futurePlans = useMemo(() =>
    [...futures]
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 6),
    [futures]
  )

  const dt = new Date()
  const dateLabel = `${dt.getMonth() + 1}月${dt.getDate()}日（${WEEK_DAYS_JP[dt.getDay()]}）`

  const todayRoutine = routineLog[today] || {}
  const toggleRoutine = key => {
    setRoutineLog({
      ...routineLog,
      [today]: { ...todayRoutine, [key]: !todayRoutine[key] },
    })
  }
  const routineDone = (routineItems || []).filter(r => todayRoutine[r.key]).length

  // ルーチン編集
  const [editingRoutine, setEditingRoutine] = useState(false)
  const [newRoutineText, setNewRoutineText] = useState('')
  const [newRoutineIcon, setNewRoutineIcon] = useState('📌')

  const addRoutineItem = () => {
    if (!newRoutineText.trim()) return
    const item = { key: 'item-' + uid(), icon: newRoutineIcon, text: newRoutineText.trim() }
    setRoutineItems([...(routineItems || []), item])
    setNewRoutineText('')
  }
  const removeRoutineItem = (key) => {
    setRoutineItems((routineItems || []).filter(r => r.key !== key))
  }
  const updateRoutineItem = (key, patch) => {
    setRoutineItems((routineItems || []).map(r => r.key === key ? { ...r, ...patch } : r))
  }

  // ロードマップ編集
  const [editingRoadmap, setEditingRoadmap] = useState(false)
  const [newPhaseLabel, setNewPhaseLabel] = useState('')
  const [newPhaseGoal, setNewPhaseGoal] = useState('')

  const addRoadmapItem = () => {
    if (!newPhaseLabel.trim() || !newPhaseGoal.trim()) return
    const item = { key: 'phase-' + uid(), phase: newPhaseLabel.trim(), goal: newPhaseGoal.trim() }
    setRoadmapItems([...(roadmapItems || []), item])
    setNewPhaseLabel('')
    setNewPhaseGoal('')
  }
  const removeRoadmapItem = (key) => {
    setRoadmapItems((roadmapItems || []).filter(r => r.key !== key))
  }
  const updateRoadmapItem = (key, patch) => {
    setRoadmapItems((roadmapItems || []).map(r => r.key === key ? { ...r, ...patch } : r))
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="home-greeting">{userName} さん</div>
          <div className="page-subtitle">{dateLabel}　·　MY　HOME</div>
        </div>
        <div
          className="member-avatar"
          style={{
            width: 52, height: 52, fontSize: 20, marginBottom: 0,
            background: `linear-gradient(135deg, ${member?.color || '#0d9488'}, ${member?.color || '#0d9488'}cc)`,
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
          <div className="stat-num">{todayScheduleItems.length}</div>
          <div className="stat-label">今日の予定</div>
        </div>
        <div className="stat-tile">
          <div className="stat-num">{myMemoCount}</div>
          <div className="stat-label">MTメモ</div>
        </div>
      </div>

      {/* 全体の戦略・戦術 */}
      <div className="card overall-strategy-card">
        <div className="card-title">
          🌐 {userName} さんの全体戦略・戦術
          <button
            className="btn btn-small btn-secondary"
            style={{ float: 'right' }}
            onClick={() => onNavigate?.('strategy')}
          >→ 編集</button>
        </div>
        <div className="overall-grid">
          <div className="overall-block">
            <div className="overall-label">🧭 戦略</div>
            <div className="overall-text">
              {overall.strategy || <span className="overall-empty">戦略ページから入力してください</span>}
            </div>
          </div>
          <div className="overall-block">
            <div className="overall-label">⚙️ 戦術</div>
            <div className="overall-text">
              {overall.tactics || <span className="overall-empty">戦略ページから入力してください</span>}
            </div>
          </div>
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
              >すべて見る →</button>
            </div>
            {myTasks.length === 0 ? (
              <div className="empty" style={{ padding: 20 }}>未完了のタスクはありません</div>
            ) : (
              <ul className="task-list home-task-list">
                {myTasks.map(t => {
                  const pri = normalizePriority(t.priority)
                  const ds = dueStatus(t.due)
                  return (
                    <li key={t.id} className="task-item home-task-item">
                      <div className="task-text">{t.text}</div>
                      <span className={`tag tag-${t.category}`}>{t.category}</span>
                      <span className={`priority-badge priority-${pri}`}>{pri}</span>
                      {ds && <span className={`due-badge due-${ds.key}`}>{ds.label}</span>}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="card">
            <div className="card-title">
              📅 今日のスケジュール（Google カレンダー統合）
              <span style={{ float: 'right', fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                {tokenValid
                  ? (gcalBusy ? '同期中...' : `GCal 連携中`)
                  : 'GCal 未連携'}
              </span>
            </div>
            {todayScheduleItems.length === 0 ? (
              <div className="empty" style={{ padding: 20 }}>
                本日の予定はありません
                {!tokenValid && (
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    <button className="btn btn-small btn-secondary" onClick={() => onNavigate?.('schedule')}>
                      📅 Googleカレンダーを連携する
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="merged-schedule">
                {todayScheduleItems.map(e => (
                  <div
                    key={e.id}
                    className={`merged-schedule-row src-${e.source}`}
                    title={e.source === 'gcal' ? 'Google カレンダー' : '手動入力'}
                  >
                    <span className="merged-schedule-time">
                      {e.source === 'gcal'
                        ? (e.allDay ? '終日' : e.timeRange)
                        : `${String(e.hour).padStart(2, '0')}:00`}
                    </span>
                    <span className="merged-schedule-text">
                      {e.source === 'gcal' && <span className="merged-schedule-mark">🗓</span>}
                      {e.text}
                    </span>
                    {e.category && (
                      <span className={`tag tag-${e.category}`} style={{ fontSize: 10 }}>{e.category}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 10, textAlign: 'right' }}>
              <button className="btn btn-small btn-secondary" onClick={() => onNavigate?.('schedule')}>
                編集 →
              </button>
            </div>
          </div>
        </div>

        <div>
          {/* 今日やること（編集可） */}
          <div className="card">
            <div className="card-title">
              🎯 今日やること
              <span style={{ float: 'right', fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
                {routineDone}/{(routineItems || []).length} 完了
                <button
                  className="btn btn-small btn-secondary"
                  style={{ marginLeft: 8 }}
                  onClick={() => setEditingRoutine(s => !s)}
                >{editingRoutine ? '完了' : '編集'}</button>
              </span>
            </div>
            <div className="daily-routine">
              {(routineItems || []).map(r => {
                const done = !!todayRoutine[r.key]
                if (editingRoutine) {
                  return (
                    <div key={r.key} className="routine-edit-row">
                      <input
                        className="text-input"
                        style={{ width: 50, textAlign: 'center', flex: 'none' }}
                        value={r.icon}
                        onChange={e => updateRoutineItem(r.key, { icon: e.target.value })}
                      />
                      <input
                        className="text-input"
                        value={r.text}
                        onChange={e => updateRoutineItem(r.key, { text: e.target.value })}
                      />
                      <button className="btn-icon" onClick={() => removeRoutineItem(r.key)}>×</button>
                    </div>
                  )
                }
                return (
                  <label key={r.key} className={`routine-row ${done ? 'done' : ''}`}>
                    <input
                      type="checkbox"
                      className="task-check"
                      checked={done}
                      onChange={() => toggleRoutine(r.key)}
                    />
                    <span className="routine-icon">{r.icon}</span>
                    <span className="routine-text">{r.text}</span>
                  </label>
                )
              })}
              {editingRoutine && (
                <div className="routine-edit-row" style={{ marginTop: 8, borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
                  <input
                    className="text-input"
                    style={{ width: 50, textAlign: 'center', flex: 'none' }}
                    placeholder="📌"
                    value={newRoutineIcon}
                    onChange={e => setNewRoutineIcon(e.target.value)}
                  />
                  <input
                    className="text-input"
                    placeholder="新しい今日やること..."
                    value={newRoutineText}
                    onChange={e => setNewRoutineText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addRoutineItem()}
                  />
                  <button className="btn btn-small" onClick={addRoutineItem}>＋ 追加</button>
                </div>
              )}
            </div>
          </div>

          {/* なりたい自分の実践 */}
          <div className="card">
            <div className="card-title">
              🌟 なりたい自分の実践
              <button
                className="btn btn-small btn-secondary"
                style={{ float: 'right' }}
                onClick={() => onNavigate?.('being')}
              >→ 編集</button>
            </div>
            {myBeingItems.length === 0 ? (
              <div className="empty" style={{ padding: 16, fontSize: 12 }}>
                実践項目はまだありません
              </div>
            ) : (
              <ul className="being-practice-list">
                {myBeingItems.map(i => (
                  <li key={i.id} className={`being-practice-row ${i.done ? 'done' : ''}`}>
                    <span className="being-practice-dot">{i.done ? '✓' : '○'}</span>
                    <span className="being-practice-text">{i.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 今後の取り組み */}
          <div className="card">
            <div className="card-title">
              🚀 今後の取り組み
              <button
                className="btn btn-small btn-secondary"
                style={{ float: 'right' }}
                onClick={() => onNavigate?.('future')}
              >→ 一覧</button>
            </div>
            {futurePlans.length === 0 ? (
              <div className="empty" style={{ padding: 16, fontSize: 12 }}>
                取り組みはまだありません
              </div>
            ) : (
              <ul className="future-list">
                {futurePlans.map(f => (
                  <li key={f.id} className="future-row">
                    <div>
                      <div className="future-title">{f.text}</div>
                      <div className="future-meta">
                        <span className="tag">{f.timeframe}</span>
                        <span className="tag">{f.category}</span>
                        <span className="future-status">{f.status}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ロードマップ（編集可・現在地クリックで設定） */}
          <div className="card">
            <div className="card-title">
              🗺️ ロードマップ進捗
              <span style={{ float: 'right' }}>
                <button
                  className="btn btn-small btn-secondary"
                  onClick={() => setEditingRoadmap(s => !s)}
                >{editingRoadmap ? '完了' : '編集'}</button>
              </span>
            </div>
            <div className="roadmap-list">
              {(roadmapItems || []).map((r, i) => {
                const isCurrent = r.key === currentPhase
                const reached = (roadmapItems || []).findIndex(x => x.key === currentPhase) >= i
                if (editingRoadmap) {
                  return (
                    <div key={r.key} className="roadmap-edit-row">
                      <input
                        className="text-input"
                        placeholder="期間"
                        value={r.phase}
                        onChange={e => updateRoadmapItem(r.key, { phase: e.target.value })}
                        style={{ flex: 1, minWidth: 80 }}
                      />
                      <input
                        className="text-input"
                        placeholder="目標"
                        value={r.goal}
                        onChange={e => updateRoadmapItem(r.key, { goal: e.target.value })}
                        style={{ flex: 2 }}
                      />
                      <button
                        className={`btn btn-small ${isCurrent ? '' : 'btn-secondary'}`}
                        onClick={() => setCurrentPhase(r.key)}
                        title="現在地に設定"
                      >{isCurrent ? '★ 現在' : '現在に'}</button>
                      <button className="btn-icon" onClick={() => removeRoadmapItem(r.key)}>×</button>
                    </div>
                  )
                }
                return (
                  <div
                    key={r.key}
                    className={`roadmap-row ${isCurrent ? 'current' : ''} ${reached ? 'reached' : ''}`}
                    onClick={() => setCurrentPhase(r.key)}
                    style={{ cursor: 'pointer' }}
                    title="クリックで現在地に設定"
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
              {editingRoadmap && (
                <div className="roadmap-edit-row" style={{ marginTop: 8, borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
                  <input
                    className="text-input"
                    placeholder="期間（例：3〜5年）"
                    value={newPhaseLabel}
                    onChange={e => setNewPhaseLabel(e.target.value)}
                    style={{ flex: 1, minWidth: 80 }}
                  />
                  <input
                    className="text-input"
                    placeholder="目標（例：年商10億円）"
                    value={newPhaseGoal}
                    onChange={e => setNewPhaseGoal(e.target.value)}
                    style={{ flex: 2 }}
                  />
                  <button className="btn btn-small" onClick={addRoadmapItem}>＋ 追加</button>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              💡 自分のアイデア
              <button
                className="btn btn-small btn-secondary"
                style={{ float: 'right' }}
                onClick={() => onNavigate?.('ideas')}
              >→ 一覧</button>
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
        </div>
      </div>
    </div>
  )
}
