import { useState, useEffect, useMemo, useCallback } from 'react'
import { useLocalStorage, useUserScopedStorage, uid } from '../hooks/useLocalStorage'
import { requestAccessToken, fetchEvents, revokeToken } from '../lib/googleCalendar'
import { GCAL_CLIENT_ID } from '../config'

function normalizePriority(p) {
  if (p === '高') return 'A'
  if (p === '中') return 'B'
  if (p === '低') return 'C'
  if (['A', 'B', 'C', 'D'].includes(p)) return p
  return 'C'
}

const PICK_HOURS = Array.from({ length: 19 }, (_, i) => i + 6)

const HOURS = Array.from({ length: 19 }, (_, i) => i + 6) // 6..24
const DAYS_JP = ['日', '月', '火', '水', '木', '金', '土']

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatLabel(d) {
  return `${d.getMonth() + 1}月${d.getDate()}日（${DAYS_JP[d.getDay()]}）`
}

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function hourOf(isoStr) {
  if (!isoStr) return null
  const d = new Date(isoStr)
  return d.getHours()
}

function fmtTimeRange(ev) {
  if (ev.allDay) return '終日'
  const s = new Date(ev.start)
  const e = ev.end ? new Date(ev.end) : null
  const fmt = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return e ? `${fmt(s)}–${fmt(e)}` : fmt(s)
}

export default function TodaySchedule({ currentUser }) {
  const [schedule, setSchedule] = useLocalStorage('tf_schedule', {})
  const [tasks] = useUserScopedStorage('tf_tasks_by_user', currentUser, [])
  const [eventDone, setEventDone] = useUserScopedStorage('tf_event_done_by_user', currentUser, {})
  const toggleDone = (id) => {
    setEventDone({ ...(eventDone || {}), [id]: !(eventDone || {})[id] })
  }

  // Google Calendar state（ユーザーごとに分離）
  const [clientIdOverride, setClientIdOverride] = useLocalStorage('tf_gcal_clientId', '')
  const [allTokens, setAllTokens] = useLocalStorage('tf_gcal_user_tokens', {})
  const [allEvents, setAllEvents] = useLocalStorage('tf_gcal_user_events', {})
  const [showConfig, setShowConfig] = useState(false)
  const [busy, setBusy] = useState(false)
  const [gcalError, setGcalError] = useState('')
  const [gcalInfo, setGcalInfo] = useState('')

  const clientId = (clientIdOverride || '').trim() || GCAL_CLIENT_ID

  const token = allTokens[currentUser] || null
  const setToken = (t) => {
    const next = { ...allTokens }
    if (t == null) delete next[currentUser]
    else next[currentUser] = t
    setAllTokens(next)
  }

  const gcalEvents = allEvents[currentUser] || {}
  const setGcalEvents = (e) => setAllEvents({ ...allEvents, [currentUser]: e })

  const todayD = startOfDay(new Date())
  const tomorrowD = addDays(todayD, 1)
  const todayKey = dateKey(todayD)
  const tomorrowKey = dateKey(tomorrowD)

  const tokenValid = token && token.access_token && token.expires_at > Date.now()

  const syncWithToken = useCallback(async accessToken => {
    const from = new Date(todayD)
    const to = addDays(tomorrowD, 1) // exclusive upper bound
    const items = await fetchEvents(accessToken, from, to)
    const grouped = {}
    items.forEach(ev => {
      const start = ev.start
      if (!start) return
      const key = ev.allDay ? start.slice(0, 10) : dateKey(new Date(start))
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(ev)
    })
    setAllEvents(prev => ({
      ...prev,
      [currentUser]: {
        ...(prev[currentUser] || {}),
        [todayKey]: grouped[todayKey] || [],
        [tomorrowKey]: grouped[tomorrowKey] || [],
        __syncedAt: Date.now(),
      },
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayKey, tomorrowKey, currentUser])

  const connect = async () => {
    if (!clientId) {
      setGcalError('クライアント ID が設定されていません')
      setShowConfig(true)
      return
    }
    setBusy(true); setGcalError(''); setGcalInfo('')
    try {
      const t = await requestAccessToken(clientId)
      setToken(t)
      await syncWithToken(t.access_token)
      setGcalInfo(`${currentUser} さんの Google カレンダーと連携しました。`)
    } catch (e) {
      setGcalError(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const sync = async () => {
    if (!tokenValid) return connect()
    setBusy(true); setGcalError(''); setGcalInfo('')
    try {
      await syncWithToken(token.access_token)
      setGcalInfo(`同期しました（${new Date().toLocaleTimeString('ja-JP')}）`)
    } catch (e) {
      setGcalError(`同期失敗: ${e.message}. 再接続してください。`)
      setToken(null)
    } finally {
      setBusy(false)
    }
  }

  const disconnect = () => {
    if (token?.access_token) revokeToken(token.access_token)
    setToken(null)
    setGcalEvents({})
    setGcalInfo('連携を解除しました')
  }

  // ユーザー切替・初回マウント時に、有効なトークンがあれば自動同期
  useEffect(() => {
    if (tokenValid) {
      sync()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser])

  const addEntry = (dateK, hour, textRaw, meta = {}) => {
    const text = (textRaw || '').trim()
    if (!text) return
    const next = { ...schedule }
    next[dateK] = { ...(next[dateK] || {}) }
    next[dateK][currentUser] = { ...(next[dateK][currentUser] || {}) }
    const list = next[dateK][currentUser][hour] || []
    next[dateK][currentUser][hour] = [...list, { id: uid(), text, ...meta }]
    setSchedule(next)
  }

  const userTasks = useMemo(
    () => tasks.filter(t => !t.done),
    [tasks]
  )

  const deleteEntry = (dateK, hour, id) => {
    const next = { ...schedule }
    if (!next[dateK]?.[currentUser]?.[hour]) return
    next[dateK][currentUser][hour] = next[dateK][currentUser][hour].filter(e => e.id !== id)
    setSchedule(next)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">スケジュール</div>
          <div className="page-subtitle">{currentUser} さんの予定　·　{formatLabel(todayD)} ／ {formatLabel(tomorrowD)}</div>
        </div>
        <div className="form-row" style={{ margin: 0, alignItems: 'center' }}>
          {tokenValid ? (
            <>
              <span style={{ fontSize: 12, color: 'var(--success)' }}>● Google接続中</span>
              <button className="btn btn-small" onClick={sync} disabled={busy}>
                {busy ? '同期中...' : '🔄 同期'}
              </button>
              <button className="btn btn-small btn-secondary" onClick={disconnect}>連携解除</button>
            </>
          ) : (
            <button className="btn btn-small" onClick={connect} disabled={busy}>
              {busy ? '接続中...' : '📅 Googleカレンダー連携'}
            </button>
          )}
          <button
            className="btn btn-small btn-secondary"
            onClick={() => setShowConfig(s => !s)}
            title="クライアント ID 設定"
          >⚙️</button>
        </div>
      </div>

      {showConfig && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <div className="card-title">⚙️ Google カレンダー設定</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.7 }}>
            クライアント ID は本アプリに既定値が組み込まれています。<br />
            別の OAuth クライアントを使う場合のみ下に上書き値を入力してください。<br />
            Google Cloud Console の「承認済みの JavaScript 生成元」に <code>{location.origin}</code> を登録しておく必要があります。<br />
            必要 API: <strong>Google Calendar API</strong> ／ スコープ: <code>calendar.readonly</code>
          </div>
          <div className="form-row">
            <input
              className="text-input"
              placeholder={`既定値を使用中：${GCAL_CLIENT_ID}`}
              value={clientIdOverride}
              onChange={e => setClientIdOverride(e.target.value)}
            />
            <button className="btn btn-secondary" onClick={() => setShowConfig(false)}>閉じる</button>
          </div>
        </div>
      )}

      {(gcalError || gcalInfo) && (
        <div
          className="card"
          style={{
            padding: '10px 14px', marginBottom: 12,
            color: gcalError ? 'var(--danger)' : 'var(--success)',
            borderColor: gcalError ? 'var(--danger)' : 'var(--success)',
            fontSize: 13,
          }}
        >
          {gcalError || gcalInfo}
        </div>
      )}

      <div className="schedule-2col">
        <ScheduleSection
          label="今日のスケジュール"
          emoji="📅"
          date={todayD}
          dateK={todayKey}
          currentUser={currentUser}
          daySchedule={schedule[todayKey]?.[currentUser] || {}}
          gcal={gcalEvents[todayKey] || []}
          userTasks={userTasks}
          onAdd={addEntry}
          onDelete={deleteEntry}
          eventDone={eventDone || {}}
          onToggleDone={toggleDone}
          isToday
        />
        <ScheduleSection
          label="明日のスケジュール"
          emoji="🌅"
          date={tomorrowD}
          dateK={tomorrowKey}
          currentUser={currentUser}
          daySchedule={schedule[tomorrowKey]?.[currentUser] || {}}
          gcal={gcalEvents[tomorrowKey] || []}
          userTasks={userTasks}
          onAdd={addEntry}
          onDelete={deleteEntry}
          eventDone={eventDone || {}}
          onToggleDone={toggleDone}
        />
      </div>
    </div>
  )
}

function ScheduleSection({ label, emoji, date, dateK, daySchedule, gcal, userTasks = [], onAdd, onDelete, eventDone = {}, onToggleDone, isToday }) {
  const [editing, setEditing] = useState(null)
  const [editText, setEditText] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [pickHour, setPickHour] = useState({}) // taskId -> hour

  const allDayEvents = gcal.filter(ev => ev.allDay)
  const timedEvents = gcal.filter(ev => !ev.allDay)

  const addFromTask = task => {
    const h = pickHour[task.id] || 9
    onAdd(dateK, h, task.text, { taskId: task.id, category: task.category, priority: task.priority })
  }

  const eventsByHour = useMemo(() => {
    const map = {}
    timedEvents.forEach(ev => {
      const h = hourOf(ev.start)
      if (h == null) return
      const slot = h < 6 ? 6 : h > 24 ? 24 : h
      if (!map[slot]) map[slot] = []
      map[slot].push(ev)
    })
    return map
  }, [timedEvents])

  const submit = hour => {
    onAdd(dateK, hour, editText)
    setEditText('')
    setEditing(null)
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: isToday ? 'var(--accent)' : 'var(--text)' }}>
          {emoji} {label}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {formatLabel(date)} ／ Google {gcal.length}件
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <button
          className="btn btn-small btn-secondary"
          onClick={() => setShowPicker(s => !s)}
        >📋 タスクから追加 {showPicker ? '▲' : '▼'}</button>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 10 }}>
          または各時間帯をクリックして直接入力
        </span>
      </div>

      {showPicker && (
        <div className="schedule-task-picker">
          <div className="schedule-task-picker-title">
            あなたの未完了タスクから選択（{userTasks.length}件）
          </div>
          {userTasks.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 6 }}>
              未完了のタスクはありません
            </div>
          ) : (
            [...userTasks]
              .sort((a, b) => {
                const ord = { A: 0, B: 1, C: 2, D: 3 }
                const ap = ord[normalizePriority(a.priority)] ?? 9
                const bp = ord[normalizePriority(b.priority)] ?? 9
                if (ap !== bp) return ap - bp
                return (a.order ?? 0) - (b.order ?? 0)
              })
              .map(t => {
                const pri = normalizePriority(t.priority)
                return (
                  <div key={t.id} className="schedule-task-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                      <span className={`priority-badge priority-${pri}`} style={{ minWidth: 22, height: 20, fontSize: 11 }}>{pri}</span>
                      <span className={`tag tag-${t.category}`}>{t.category}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.text}
                      </span>
                    </div>
                    <select
                      value={pickHour[t.id] || 9}
                      onChange={e => setPickHour({ ...pickHour, [t.id]: Number(e.target.value) })}
                    >
                      {PICK_HOURS.map(h => (
                        <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                    <button onClick={() => addFromTask(t)}>＋ 追加</button>
                  </div>
                )
              })
          )}
        </div>
      )}

      {allDayEvents.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {allDayEvents.map(ev => {
            const id = `gcal-${ev.id}`
            const done = !!eventDone[id]
            return (
              <div
                key={ev.id}
                className={`timeline-entry ${done ? 'is-done' : ''}`}
                style={{ borderLeftColor: 'var(--success)', background: done ? '#eef0f2' : '#eafaf1' }}
                title={ev.location}
              >
                <button
                  className={`schedule-done-check ${done ? 'on' : ''}`}
                  onClick={() => onToggleDone?.(id)}
                  title={done ? '未完了に戻す' : '完了にする'}
                >{done ? '✓' : ''}</button>
                🗓 {ev.title} <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 6 }}>終日</span>
              </div>
            )
          })}
        </div>
      )}

      <div className="timeline">
        {HOURS.map(h => {
          const entries = daySchedule[h] || []
          const evs = eventsByHour[h] || []
          const isEditing = editing === h
          const hourLabel = h === 24 ? '24:00' : `${String(h).padStart(2, '0')}:00`
          return (
            <div key={h} className="timeline-row">
              <div className="timeline-hour">{hourLabel}</div>
              <div
                className="timeline-content"
                onClick={() => !isEditing && setEditing(h)}
              >
                {evs.map(ev => {
                  const id = `gcal-${ev.id}`
                  const done = !!eventDone[id]
                  return (
                    <div
                      key={ev.id}
                      className={`timeline-entry ${done ? 'is-done' : ''}`}
                      style={{ borderLeftColor: 'var(--success)', background: done ? '#eef0f2' : '#eafaf1' }}
                      title={`${fmtTimeRange(ev)}${ev.location ? '\n' + ev.location : ''}`}
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        className={`schedule-done-check ${done ? 'on' : ''}`}
                        onClick={(e) => { e.stopPropagation(); onToggleDone?.(id) }}
                        title={done ? '未完了に戻す' : '完了にする'}
                      >{done ? '✓' : ''}</button>
                      🗓 <span style={{ color: 'var(--text-muted)', fontSize: 11, marginRight: 6 }}>{fmtTimeRange(ev)}</span>
                      {ev.title}
                    </div>
                  )
                })}
                {entries.map(e => {
                  const done = !!eventDone[e.id]
                  return (
                    <div key={e.id} className={`timeline-entry ${done ? 'is-done' : ''}`}>
                      <button
                        className={`schedule-done-check ${done ? 'on' : ''}`}
                        onClick={(ev) => { ev.stopPropagation(); onToggleDone?.(e.id) }}
                        title={done ? '未完了に戻す' : '完了にする'}
                      >{done ? '✓' : ''}</button>
                      {e.text}
                      {e.category && (
                        <span className="schedule-entry-tag" title={`タスク：${e.category}`}>{e.category}</span>
                      )}
                      <button
                        className="timeline-entry-delete"
                        onClick={ev => { ev.stopPropagation(); onDelete(dateK, h, e.id) }}
                      >×</button>
                    </div>
                  )
                })}
                {isEditing && (
                  <input
                    className="timeline-input"
                    autoFocus
                    value={editText}
                    placeholder="予定を入力..."
                    onChange={e => setEditText(e.target.value)}
                    onBlur={() => submit(h)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') submit(h)
                      if (e.key === 'Escape') { setEditing(null); setEditText('') }
                    }}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
