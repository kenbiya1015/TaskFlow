import { useState, useEffect, useMemo, useCallback } from 'react'
import { useLocalStorage, uid } from '../hooks/useLocalStorage'
import { requestAccessToken, fetchEvents, revokeToken } from '../lib/googleCalendar'

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
  const [tasks] = useLocalStorage('tf_tasks', [])

  // Google Calendar state
  const [clientId, setClientId] = useLocalStorage('tf_gcal_clientId', '')
  const [token, setToken] = useLocalStorage('tf_gcal_token', null)
  const [gcalEvents, setGcalEvents] = useLocalStorage('tf_gcal_events', {})
  const [showConfig, setShowConfig] = useState(false)
  const [busy, setBusy] = useState(false)
  const [gcalError, setGcalError] = useState('')
  const [gcalInfo, setGcalInfo] = useState('')

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
      // For all-day events, ev.start = 'YYYY-MM-DD'. For timed, ISO with TZ.
      const key = ev.allDay ? start.slice(0, 10) : dateKey(new Date(start))
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(ev)
    })
    // Replace today + tomorrow buckets only
    setGcalEvents({ ...gcalEvents, [todayKey]: grouped[todayKey] || [], [tomorrowKey]: grouped[tomorrowKey] || [] })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayKey, tomorrowKey])

  const connect = async () => {
    if (!clientId.trim()) {
      setGcalError('クライアント ID を入力してください')
      setShowConfig(true)
      return
    }
    setBusy(true); setGcalError(''); setGcalInfo('')
    try {
      const t = await requestAccessToken(clientId.trim())
      setToken(t)
      await syncWithToken(t.access_token)
      setGcalInfo('連携しました。今日・明日のイベントを取得しました。')
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

  // Auto-sync once on mount if token is still valid
  useEffect(() => {
    if (tokenValid) {
      sync()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    () => tasks.filter(t => t.member === currentUser && !t.done),
    [tasks, currentUser]
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
            Google Cloud Console で OAuth 2.0 クライアント ID（ウェブ アプリケーション）を作成し、<br />
            「承認済みの JavaScript 生成元」に <code>{location.origin}</code> を登録してから貼り付けてください。<br />
            必要 API: <strong>Google Calendar API</strong> を有効化。スコープ: <code>calendar.readonly</code>
          </div>
          <div className="form-row">
            <input
              className="text-input"
              placeholder="例: 1234567890-abcdefg.apps.googleusercontent.com"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
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
        />
      </div>
    </div>
  )
}

function ScheduleSection({ label, emoji, date, dateK, daySchedule, gcal, userTasks = [], onAdd, onDelete, isToday }) {
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
            userTasks.map(t => (
              <div key={t.id} className="schedule-task-row">
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span className={`tag tag-${t.category}`} style={{ marginRight: 4 }}>{t.category}</span>
                  {t.text}
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
            ))
          )}
        </div>
      )}

      {allDayEvents.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {allDayEvents.map(ev => (
            <div
              key={ev.id}
              className="timeline-entry"
              style={{ borderLeftColor: 'var(--success)', background: '#eafaf1' }}
              title={ev.location}
            >
              🗓 {ev.title} <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 6 }}>終日</span>
            </div>
          ))}
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
                {evs.map(ev => (
                  <div
                    key={ev.id}
                    className="timeline-entry"
                    style={{ borderLeftColor: 'var(--success)', background: '#eafaf1' }}
                    title={`${fmtTimeRange(ev)}${ev.location ? '\n' + ev.location : ''}`}
                    onClick={e => e.stopPropagation()}
                  >
                    🗓 <span style={{ color: 'var(--text-muted)', fontSize: 11, marginRight: 6 }}>{fmtTimeRange(ev)}</span>
                    {ev.title}
                  </div>
                ))}
                {entries.map(e => (
                  <div key={e.id} className="timeline-entry">
                    {e.text}
                    {e.category && (
                      <span className="schedule-entry-tag" title={`タスク：${e.category}`}>{e.category}</span>
                    )}
                    <button
                      className="timeline-entry-delete"
                      onClick={ev => { ev.stopPropagation(); onDelete(dateK, h, e.id) }}
                    >×</button>
                  </div>
                ))}
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
