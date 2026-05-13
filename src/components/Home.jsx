import { useMemo, useEffect, useState, useRef } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { findMember } from '../members'
import { DAILY_ROUTINE, ROADMAP, CURRENT_PHASE_KEY } from '../data/strategyDefaults'
import { fetchEvents } from '../lib/googleCalendar'
import {
  downloadExport,
  importAll,
  autoBackup,
  listAutoBackups,
} from '../lib/storage'

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

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'こんばんは'
  if (h < 11) return 'おはようございます'
  if (h < 18) return 'こんにちは'
  return 'おつかれさまです'
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
  const [tasks] = useLocalStorage('tf_tasks', [])
  const [schedule] = useLocalStorage('tf_schedule', {})
  const [ideas] = useLocalStorage('tf_ideas', [])
  const [memos] = useLocalStorage('tf_mtmemos', [])
  const [overall] = useLocalStorage('tf_strategy_overall', { strategy: '', tactics: '' })
  const [being] = useLocalStorage('tf_being', {})
  const [futures] = useLocalStorage('tf_future', [])
  const [routineLog, setRoutineLog] = useLocalStorage('tf_daily_routine', {})
  const [allTokens, setAllTokens] = useLocalStorage('tf_gcal_user_tokens', {})
  const [allEvents, setAllEvents] = useLocalStorage('tf_gcal_user_events', {})

  const member = findMember(userName)
  const today = todayKey()

  // 1週間分の日付キー
  const weekDays = useMemo(() => {
    const out = []
    const base = new Date(); base.setHours(0, 0, 0, 0)
    for (let i = 0; i < 7; i++) {
      const d = new Date(base); d.setDate(d.getDate() + i)
      out.push({
        key: dateKeyOf(d),
        date: d,
        label: i === 0 ? '今日' : i === 1 ? '明日' : `${d.getMonth() + 1}/${d.getDate()}`,
        wday: WEEK_DAYS_JP[d.getDay()],
      })
    }
    return out
  }, [])

  const myToken = allTokens[userName] || null
  const tokenValid = myToken && myToken.access_token && myToken.expires_at > Date.now()
  const myEvents = allEvents[userName] || {}
  const [gcalBusy, setGcalBusy] = useState(false)

  // 有効なトークンがあれば、マイページ表示時に1週間分を自動同期
  useEffect(() => {
    let cancelled = false
    if (!tokenValid) return
    setGcalBusy(true)
    const from = new Date(); from.setHours(0, 0, 0, 0)
    const to = new Date(from); to.setDate(to.getDate() + 7)
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
          weekDays.forEach(d => { userEvents[d.key] = grouped[d.key] || [] })
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
      .filter(t => t.member === userName && !t.done)
      .sort((a, b) => {
        const ao = a.order ?? Number.MAX_SAFE_INTEGER
        const bo = b.order ?? Number.MAX_SAFE_INTEGER
        return ao - bo
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

  // なりたい自分の実践（現在ユーザー）
  const myBeing = being[userName] || { description: '', items: [] }
  const myBeingItems = (myBeing.items || []).slice(0, 8)

  // 今後の取り組み（最大8件）
  const futurePlans = useMemo(() =>
    [...futures]
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 6),
    [futures]
  )

  const myMemoCount = memos.length
  const dt = new Date()
  const dateLabel = `${dt.getMonth() + 1}月${dt.getDate()}日（${WEEK_DAYS_JP[dt.getDay()]}）`

  const todayRoutine = routineLog[today] || {}
  const toggleRoutine = key => {
    setRoutineLog({
      ...routineLog,
      [today]: { ...todayRoutine, [key]: !todayRoutine[key] },
    })
  }
  const routineDone = DAILY_ROUTINE.filter(r => todayRoutine[r.key]).length

  // データのエクスポート／インポート
  const importInputRef = useRef(null)
  const [dataMsg, setDataMsg] = useState('')
  const [dataErr, setDataErr] = useState('')
  const backups = listAutoBackups()
  const latestBackup = backups[0]

  const handleExport = () => {
    setDataMsg(''); setDataErr('')
    try {
      autoBackup({ force: true })
      downloadExport()
      setDataMsg(`データを書き出しました（${new Date().toLocaleString('ja-JP')}）`)
    } catch (e) {
      setDataErr(`エクスポート失敗: ${e.message || e}`)
    }
  }

  const handleImportClick = () => importInputRef.current?.click()

  const handleImportFile = async (ev) => {
    setDataMsg(''); setDataErr('')
    const file = ev.target.files?.[0]
    if (!file) return
    if (!confirm('現在のデータと、選択した JSON ファイルの内容をマージして復元します。続行しますか？\n（既存データは温存され、空のキーだけ埋められます）')) {
      ev.target.value = ''
      return
    }
    try {
      const text = await file.text()
      const payload = JSON.parse(text)
      autoBackup({ force: true })
      importAll(payload, { merge: true })
      setDataMsg('インポート完了。ページを再読み込みします...')
      setTimeout(() => location.reload(), 800)
    } catch (e) {
      setDataErr(`インポート失敗: ${e.message || e}`)
    } finally {
      ev.target.value = ''
    }
  }

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

      {/* 全体の戦略・戦術（戦略ページの最上部の内容） */}
      <div className="card overall-strategy-card">
        <div className="card-title">
          🌐 全体の戦略・戦術
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

      <div className="card data-mgmt-card">
        <div className="card-title">
          💾 データ管理
          <span style={{ float: 'right', fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
            自動バックアップ {backups.length}/5 世代
            {latestBackup && `　·　最新: ${new Date(latestBackup.timestamp).toLocaleString('ja-JP')}`}
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.7 }}>
          起動するたびに自動でスナップショットが保存されます（同一内容・1時間以内はスキップ）。<br />
          重要な変更前や機種変更前は <strong>エクスポート</strong> で JSON ファイルを保存しておくと完全に安全です。
        </div>
        <div className="form-row" style={{ flexWrap: 'wrap', margin: 0 }}>
          <button className="btn" onClick={handleExport}>⬇ データをエクスポート</button>
          <button className="btn btn-secondary" onClick={handleImportClick}>⬆ データをインポート</button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
          <button
            className="btn btn-secondary btn-small"
            onClick={() => onNavigate?.('settings')}
          >📂 バックアップ履歴 →</button>
        </div>
        {dataMsg && <div style={{ color: 'var(--success)', fontSize: 12, marginTop: 8 }}>{dataMsg}</div>}
        {dataErr && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{dataErr}</div>}
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
              📅 今日のスケジュール
              <button
                className="btn btn-small btn-secondary"
                style={{ float: 'right' }}
                onClick={() => onNavigate?.('schedule')}
              >編集 →</button>
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
              🗓️ Google カレンダー（1週間）
              <span style={{ float: 'right', fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                {tokenValid
                  ? (gcalBusy ? '同期中...' : `${userName} さんと連携中`)
                  : '未連携'}
              </span>
            </div>
            {!tokenValid ? (
              <div className="empty" style={{ padding: 16, fontSize: 13 }}>
                スケジュール画面の「📅 Googleカレンダー連携」から自分のアカウントを接続すると、
                ここに今日から1週間分の予定が自動表示されます。
                <div style={{ marginTop: 10 }}>
                  <button className="btn btn-small" onClick={() => onNavigate?.('schedule')}>
                    📅 スケジュール画面へ
                  </button>
                </div>
              </div>
            ) : (
              <div className="gcal-week">
                {weekDays.map(d => {
                  const events = myEvents[d.key] || []
                  return (
                    <div key={d.key} className={`gcal-week-day ${d.key === today ? 'today' : ''}`}>
                      <div className="gcal-week-day-label">
                        <span className="gcal-week-day-name">{d.label}</span>
                        <span className="gcal-week-day-wday">（{d.wday}）</span>
                        <span className="gcal-week-day-count">{events.length}件</span>
                      </div>
                      {events.length === 0 ? (
                        <div className="gcal-empty">予定なし</div>
                      ) : (
                        events.map(ev => (
                          <div key={ev.id} className="gcal-event">
                            <span className="gcal-event-time">{fmtEventTime(ev)}</span>
                            <span className="gcal-event-title">{ev.title}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-title">
              🎯 今日やること
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
                    <span className="routine-icon">{r.icon}</span>
                    <span className="routine-text">{r.text}</span>
                  </label>
                )
              })}
            </div>
          </div>

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

          <div className="card">
            <div className="card-title">クイックジャンプ</div>
            <div style={{ display: 'grid', gap: 6 }}>
              <button className="btn btn-secondary" onClick={() => onNavigate?.('mt')}>📝 MTメモを書く</button>
              <button className="btn btn-secondary" onClick={() => onNavigate?.('goals')}>🎯 目標を見る</button>
              <button className="btn btn-secondary" onClick={() => onNavigate?.('strategy')}>📋 戦略・戦術</button>
              <button className="btn btn-secondary" onClick={() => onNavigate?.('sns')}>📱 SNSネタ帳</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
