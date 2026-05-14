import { useMemo, useEffect, useState } from 'react'
import { useLocalStorage, useUserScopedStorage, uid } from '../hooks/useLocalStorage'
import { findMember } from '../members'
import { DAILY_ROUTINE, ROADMAP, CURRENT_PHASE_KEY } from '../data/strategyDefaults'
import { fetchEvents } from '../lib/googleCalendar'

const WEEK_DAYS_JP = ['日', '月', '火', '水', '木', '金', '土']
const CATEGORIES = ['健美屋', '整体', '個人', '成長', '相手ボール', 'その他']
const PRIORITY_OPTIONS = ['A', 'B', 'C', 'D']
const PRIORITY_LABELS = { A: '最優先', B: '効率化', C: '将来性', D: '後回し' }
// 2x2 配置：左上A・右上C ／ 左下B・右下D
const KANBAN_COLS = [
  { key: 'A', label: '最優先' },
  { key: 'C', label: '将来性' },
  { key: 'B', label: '効率化' },
  { key: 'D', label: '後回し' },
]
const LATE_NIGHT_HOUR = 22

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
  const [tasks, setTasks] = useUserScopedStorage('tf_tasks_by_user', userName, [])
  const [ideas] = useUserScopedStorage('tf_ideas_by_user', userName, [])
  const [overall] = useUserScopedStorage('tf_strategy_overall_by_user', userName, { strategy: '', tactics: '' })
  const [futures] = useUserScopedStorage('tf_future_by_user', userName, [])
  const [routineItems, setRoutineItems] = useUserScopedStorage('tf_routine_items_by_user', userName, DAILY_ROUTINE)
  const [roadmapItems, setRoadmapItems] = useUserScopedStorage('tf_roadmap_by_user', userName, ROADMAP)
  const [currentPhase, setCurrentPhase] = useUserScopedStorage('tf_current_phase_by_user', userName, CURRENT_PHASE_KEY)
  const [routineLog, setRoutineLog] = useUserScopedStorage('tf_daily_routine_by_user', userName, {})
  const [eventDone, setEventDone] = useUserScopedStorage('tf_event_done_by_user', userName, {})

  // 共有データ
  const [schedule, setSchedule] = useLocalStorage('tf_schedule', {})
  const [being] = useLocalStorage('tf_being', {})
  const [allTokens, setAllTokens] = useLocalStorage('tf_gcal_user_tokens', {})
  const [allEvents, setAllEvents] = useLocalStorage('tf_gcal_user_events', {})

  const member = findMember(userName)

  // 22時以降は翌日表示
  const [nowTick, setNowTick] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNowTick(new Date()), 60 * 1000)
    return () => clearInterval(id)
  }, [])
  const isLateNight = nowTick.getHours() >= LATE_NIGHT_HOUR
  const displayDate = isLateNight
    ? new Date(nowTick.getFullYear(), nowTick.getMonth(), nowTick.getDate() + 1)
    : new Date(nowTick.getFullYear(), nowTick.getMonth(), nowTick.getDate())
  const displayKey = dateKeyOf(displayDate)
  const nextDate = new Date(displayDate.getFullYear(), displayDate.getMonth(), displayDate.getDate() + 1)
  const nextKey = dateKeyOf(nextDate)
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
    const to = new Date(from); to.setDate(to.getDate() + 3)
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
          for (let i = 0; i < 3; i++) {
            const d = new Date(from); d.setDate(d.getDate() + i)
            const k = dateKeyOf(d)
            userEvents[k] = grouped[k] || []
          }
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

  // タスクをA/B/C/Dにグループ分け（未完了のみ）
  const tasksByPriority = useMemo(() => {
    const groups = { A: [], B: [], C: [], D: [] }
    for (const t of tasks) {
      if (t.done) continue
      const pri = normalizePriority(t.priority)
      groups[pri].push(t)
    }
    for (const k of Object.keys(groups)) {
      groups[k].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    }
    return groups
  }, [tasks])

  // 表示対象日のスケジュール（GCal + 手動入力をマージ）
  const buildScheduleItems = (dateK) => {
    const list = []
    const day = schedule[dateK]?.[userName] || {}
    Object.keys(day).forEach(h => {
      (day[h] || []).forEach(e => list.push({
        id: e.id,
        hour: Number(h),
        text: e.text,
        source: 'manual',
        category: e.category,
      }))
    })
    const events = (myEvents[dateK] || []).filter(Boolean)
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
      if (a.allDay && !b.allDay) return -1
      if (!a.allDay && b.allDay) return 1
      return a.hour - b.hour
    })
  }

  const displayScheduleItems = useMemo(
    () => buildScheduleItems(displayKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schedule, myEvents, displayKey, userName]
  )
  const nextScheduleItems = useMemo(
    () => buildScheduleItems(nextKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schedule, myEvents, nextKey, userName]
  )

  const toggleEventDone = (id) => {
    setEventDone({ ...(eventDone || {}), [id]: !(eventDone || {})[id] })
  }

  const removeTask = (id) => {
    setTasks(tasks.filter(t => t.id !== id))
  }

  // スケジュールへの予定追加（1カードずつ開閉）
  const [openAddFor, setOpenAddFor] = useState(null) // dateKey
  const [addHour, setAddHour] = useState(9)
  const [addText, setAddText] = useState('')

  const addScheduleEntry = (dateK, hour, text) => {
    setSchedule(prev => {
      const next = { ...prev }
      next[dateK] = { ...(next[dateK] || {}) }
      next[dateK][userName] = { ...(next[dateK][userName] || {}) }
      const list = next[dateK][userName][hour] || []
      next[dateK][userName][hour] = [...list, { id: uid(), text }]
      return next
    })
  }

  const submitScheduleAdd = (dateK) => {
    const t = addText.trim()
    if (!t) return
    addScheduleEntry(dateK, addHour, t)
    setAddText('')
    setOpenAddFor(null)
  }

  const myIdeas = useMemo(() => ideas.slice(0, 5), [ideas])

  // なりたい自分の実践
  const myBeing = being[userName] || { description: '', items: [] }
  const myBeingItems = (myBeing.items || []).slice(0, 8)

  // 今後の取り組み
  const futurePlans = useMemo(() =>
    [...futures]
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 6),
    [futures]
  )

  const dt = displayDate
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

  // クイックタスク追加
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [quickText, setQuickText] = useState('')
  const [quickCat, setQuickCat] = useState('健美屋')
  const [quickPriority, setQuickPriority] = useState('B')
  const [quickDue, setQuickDue] = useState('')

  const nextOrder = () =>
    tasks.length === 0 ? 1 : Math.max(...tasks.map(t => t.order ?? 0)) + 1

  const addQuickTask = () => {
    if (!quickText.trim()) return
    setTasks([
      {
        id: uid(),
        text: quickText.trim(),
        category: quickCat,
        member: userName,
        priority: quickPriority,
        due: quickDue,
        done: false,
        createdAt: Date.now(),
        order: nextOrder(),
      },
      ...tasks,
    ])
    setQuickText('')
    setQuickDue('')
    setShowQuickAdd(false)
  }

  const scheduleHeading = isLateNight ? '明日のスケジュール' : '今日のスケジュール'
  const nextHeading = isLateNight ? '明後日のスケジュール' : '明日のスケジュール'
  const PICK_HOURS = Array.from({ length: 19 }, (_, i) => i + 6)

  const formatScheduleDate = (d) =>
    `${d.getMonth() + 1}/${d.getDate()}（${WEEK_DAYS_JP[d.getDay()]}）`

  const renderScheduleCard = ({ heading, dateK, date, items, isPrimary }) => {
    const showing = openAddFor === dateK
    return (
      <div className="card" key={dateK}>
        <div className="card-title">
          📅 {heading}
          <span style={{ float: 'right', display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
            <span>{formatScheduleDate(date)}</span>
            {isPrimary && tokenValid && (
              <span>{gcalBusy ? '同期中...' : 'GCal 連携中'}</span>
            )}
            {isPrimary && !tokenValid && <span>GCal 未連携</span>}
            {isPrimary && isLateNight && (
              <span className="late-night-pill" title="22時以降は翌日表示に自動切替">夜モード</span>
            )}
            <button
              className="btn btn-small"
              onClick={() => {
                if (showing) setOpenAddFor(null)
                else { setOpenAddFor(dateK); setAddText(''); setAddHour(9) }
              }}
            >{showing ? '× 閉じる' : '＋ 予定追加'}</button>
          </span>
        </div>

        {showing && (
          <div className="home-schedule-add">
            <select
              className="select"
              value={addHour}
              onChange={e => setAddHour(Number(e.target.value))}
            >
              {PICK_HOURS.map(h => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
            <input
              className="text-input"
              placeholder="予定を入力..."
              autoFocus
              value={addText}
              onChange={e => setAddText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') submitScheduleAdd(dateK)
                if (e.key === 'Escape') { setAddText(''); setOpenAddFor(null) }
              }}
            />
            <button className="btn btn-small" onClick={() => submitScheduleAdd(dateK)}>追加</button>
          </div>
        )}

        {items.length === 0 ? (
          <div className="empty" style={{ padding: 18 }}>
            予定はありません
            {isPrimary && !tokenValid && (
              <div style={{ marginTop: 8, fontSize: 12 }}>
                <button className="btn btn-small btn-secondary" onClick={() => onNavigate?.('schedule')}>
                  📅 Googleカレンダーを連携する
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="merged-schedule">
            {items.map(e => {
              const done = !!(eventDone || {})[e.id]
              return (
                <div
                  key={e.id}
                  className={`merged-schedule-row src-${e.source} ${done ? 'is-done' : ''}`}
                  title={e.source === 'gcal' ? 'Google カレンダー' : '手動入力'}
                >
                  <button
                    className={`schedule-done-check ${done ? 'on' : ''}`}
                    onClick={() => toggleEventDone(e.id)}
                    title={done ? '未完了に戻す' : '完了にする'}
                  >{done ? '✓' : ''}</button>
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
              )
            })}
          </div>
        )}

        <div style={{ marginTop: 10, textAlign: 'right' }}>
          <button className="btn btn-small btn-secondary" onClick={() => onNavigate?.('schedule')}>
            編集 →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* パーパスヒーロー */}
      <div className="purpose-hero">
        <div className="purpose-hero-content">
          <div className="purpose-hero-eyebrow">★ OUR PURPOSE</div>
          <div className="purpose-hero-title">健美屋をインフラに。</div>
          <div className="purpose-hero-sub">Make Kenbiya the infrastructure of wellness.</div>
          <div className="purpose-hero-meta">
            {dateLabel}　·　{userName} さん、今日も一歩前へ。
          </div>
        </div>
        <div className="purpose-hero-orbs" aria-hidden="true">
          <span className="orb orb-1" />
          <span className="orb orb-2" />
          <span className="orb orb-3" />
        </div>
      </div>

      <div className="page-header home-page-header">
        <div>
          <div className="home-greeting">{userName} さん</div>
          <div className="page-subtitle">{dateLabel}　·　MY　HOME</div>
        </div>
        <button
          className="quick-add-btn"
          onClick={() => setShowQuickAdd(s => !s)}
          title="タスクを追加"
        >
          <span className="quick-add-plus">＋</span>
          <span className="quick-add-label">タスク追加</span>
        </button>
      </div>

      {showQuickAdd && (
        <div className="card quick-add-card">
          <div className="card-title">
            ＋ クイックタスク追加
            <button
              className="btn btn-small btn-secondary"
              style={{ float: 'right' }}
              onClick={() => setShowQuickAdd(false)}
            >閉じる</button>
          </div>
          <div className="task-add-form">
            <input
              className="text-input"
              placeholder="やることを入力..."
              value={quickText}
              onChange={e => setQuickText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addQuickTask()}
              autoFocus
            />
            <select className="select" value={quickCat} onChange={e => setQuickCat(e.target.value)}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <select className="select" value={quickPriority} onChange={e => setQuickPriority(e.target.value)}>
              {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}（{PRIORITY_LABELS[p]}）</option>)}
            </select>
            <input
              type="date"
              className="text-input"
              value={quickDue}
              onChange={e => setQuickDue(e.target.value)}
              style={{ minWidth: 0 }}
            />
            <button className="btn" onClick={addQuickTask}>追加</button>
          </div>
        </div>
      )}

      {/* タスク4軸ボード */}
      <div className="card">
        <div className="card-title">
          🗂 タスク 4軸ボード（A・B・C・D）
          <button
            className="btn btn-small btn-secondary"
            style={{ float: 'right' }}
            onClick={() => onNavigate?.('tasks')}
          >すべて見る →</button>
        </div>
        <div className="kanban-board kanban-board-2x2 kanban-board-home">
          {KANBAN_COLS.map(col => {
            const items = tasksByPriority[col.key] || []
            return (
              <div key={col.key} className={`kanban-column kanban-col-${col.key}`}>
                <div className="kanban-col-header kanban-col-header-lg">
                  <span className={`priority-badge priority-${col.key} priority-badge-lg`}>{col.key}</span>
                  <span className="kanban-col-label kanban-col-label-lg">{col.label}</span>
                  <span className="kanban-col-count">{items.length}</span>
                </div>
                <div className="kanban-col-body">
                  {items.length === 0 ? (
                    <div className="kanban-empty">なし</div>
                  ) : (
                    items.slice(0, 6).map(t => {
                      const ds = dueStatus(t.due)
                      return (
                        <div key={t.id} className="kanban-card kanban-card-lg">
                          <div className="kanban-card-top">
                            <span className="kanban-card-text">{t.text}</span>
                            <button
                              className="btn-icon kanban-card-del"
                              onClick={() => removeTask(t.id)}
                              title="削除"
                            >×</button>
                          </div>
                          <div className="kanban-card-meta">
                            <span className={`tag tag-${t.category}`}>{t.category}</span>
                            {ds && <span className={`due-badge due-${ds.key}`}>{ds.label}</span>}
                          </div>
                        </div>
                      )
                    })
                  )}
                  {items.length > 6 && (
                    <div className="kanban-more">+{items.length - 6} 件</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="home-grid">
        <div>
          {renderScheduleCard({
            heading: scheduleHeading,
            dateK: displayKey,
            date: displayDate,
            items: displayScheduleItems,
            isPrimary: true,
          })}
          {renderScheduleCard({
            heading: nextHeading,
            dateK: nextKey,
            date: nextDate,
            items: nextScheduleItems,
            isPrimary: false,
          })}
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

      {/* 全体の戦略・戦術（最下部） */}
      <div className="card overall-strategy-card overall-strategy-bottom">
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
    </div>
  )
}
