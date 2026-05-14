import { useState, useMemo } from 'react'
import { useLocalStorage, uid } from '../hooks/useLocalStorage'
import { MEMBERS, findMember } from '../members'

// メッセージ機能（メンバー伝達）
// 構造: tf_messages = [{ id, from, to, text, createdAt, readAt }]
export default function Members({ currentUser }) {
  const [messages, setMessages] = useLocalStorage('tf_messages', [])
  const [tab, setTab] = useState('inbox') // 'inbox' | 'sent' | 'send'

  const others = useMemo(
    () => MEMBERS.filter(m => m.name !== currentUser),
    [currentUser]
  )

  const [to, setTo] = useState(others[0]?.name || '')
  const [text, setText] = useState('')
  const [sentMsg, setSentMsg] = useState('')

  const inbox = useMemo(
    () => (messages || [])
      .filter(m => m.to === currentUser)
      .sort((a, b) => b.createdAt - a.createdAt),
    [messages, currentUser]
  )

  const sent = useMemo(
    () => (messages || [])
      .filter(m => m.from === currentUser)
      .sort((a, b) => b.createdAt - a.createdAt),
    [messages, currentUser]
  )

  const unreadCount = inbox.filter(m => !m.readAt).length

  const send = () => {
    const t = text.trim()
    if (!t || !to) return
    const next = [
      ...(messages || []),
      { id: uid(), from: currentUser, to, text: t, createdAt: Date.now(), readAt: null },
    ]
    setMessages(next)
    setText('')
    setSentMsg(`${to} さんへ送信しました`)
    setTimeout(() => setSentMsg(''), 2000)
  }

  const markRead = (id) => {
    setMessages((messages || []).map(m => m.id === id ? { ...m, readAt: m.readAt || Date.now() } : m))
  }

  const remove = (id) => {
    setMessages((messages || []).filter(m => m.id !== id))
  }

  const markAllRead = () => {
    const now = Date.now()
    setMessages((messages || []).map(m =>
      m.to === currentUser && !m.readAt ? { ...m, readAt: now } : m
    ))
  }

  const fmt = (ts) => {
    const d = new Date(ts)
    const today = new Date()
    const sameDay = d.toDateString() === today.toDateString()
    const pad = n => String(n).padStart(2, '0')
    if (sameDay) return `今日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">メンバー伝達</div>
          <div className="page-subtitle">MESSAGES　·　メンバー間メッセージ</div>
        </div>
      </div>

      <div className="message-tabs">
        <button
          className={`message-tab ${tab === 'inbox' ? 'active' : ''}`}
          onClick={() => setTab('inbox')}
        >
          📥 受信
          {unreadCount > 0 && <span className="message-badge">{unreadCount}</span>}
        </button>
        <button
          className={`message-tab ${tab === 'sent' ? 'active' : ''}`}
          onClick={() => setTab('sent')}
        >📤 送信済み <span className="message-count">{sent.length}</span></button>
        <button
          className={`message-tab ${tab === 'send' ? 'active' : ''}`}
          onClick={() => setTab('send')}
        >✍️ 新規送信</button>
      </div>

      {tab === 'send' && (
        <div className="card">
          <div className="card-title">✍️ 新しいメッセージ</div>
          <div className="form-row" style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>送信先：</label>
            <select className="select" value={to} onChange={e => setTo(e.target.value)}>
              {others.map(m => (
                <option key={m.id} value={m.name}>{m.name}</option>
              ))}
            </select>
          </div>
          <textarea
            className="textarea"
            style={{ minHeight: 120 }}
            placeholder="伝えたいことを自由に書いてください..."
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <div className="form-row" style={{ marginTop: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
            {sentMsg && <span style={{ fontSize: 12, color: 'var(--success)', marginRight: 8 }}>✓ {sentMsg}</span>}
            <button className="btn btn-secondary" onClick={() => setText('')}>クリア</button>
            <button className="btn" onClick={send} disabled={!text.trim() || !to}>送信</button>
          </div>
        </div>
      )}

      {tab === 'inbox' && (
        <>
          {inbox.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📭</div>
              受信メッセージはありません
            </div>
          ) : (
            <>
              {unreadCount > 0 && (
                <div className="form-row" style={{ marginBottom: 10, justifyContent: 'flex-end' }}>
                  <button className="btn btn-small btn-secondary" onClick={markAllRead}>
                    すべて既読にする
                  </button>
                </div>
              )}
              <div className="message-list">
                {inbox.map(m => {
                  const from = findMember(m.from)
                  const unread = !m.readAt
                  return (
                    <div key={m.id} className={`message-card ${unread ? 'unread' : ''}`}>
                      <div className="message-card-head">
                        <div className="message-card-from">
                          <span
                            className="message-avatar"
                            style={{ background: `linear-gradient(135deg, ${from?.color || '#999'}, ${from?.color || '#999'}aa)` }}
                          >{from?.initial || m.from.slice(0, 1)}</span>
                          <div>
                            <div className="message-from-name">{m.from}</div>
                            <div className="message-time">{fmt(m.createdAt)}</div>
                          </div>
                        </div>
                        <div className="message-actions">
                          {unread && (
                            <button className="btn btn-small btn-secondary" onClick={() => markRead(m.id)}>既読にする</button>
                          )}
                          {!unread && <span className="message-read-mark">✓ 既読</span>}
                          <button className="btn-icon" onClick={() => remove(m.id)} title="削除">×</button>
                        </div>
                      </div>
                      <div className="message-text">{m.text}</div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'sent' && (
        <>
          {sent.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📨</div>
              送信したメッセージはありません
            </div>
          ) : (
            <div className="message-list">
              {sent.map(m => {
                const target = findMember(m.to)
                return (
                  <div key={m.id} className="message-card message-card-sent">
                    <div className="message-card-head">
                      <div className="message-card-from">
                        <span
                          className="message-avatar"
                          style={{ background: `linear-gradient(135deg, ${target?.color || '#999'}, ${target?.color || '#999'}aa)` }}
                        >{target?.initial || m.to.slice(0, 1)}</span>
                        <div>
                          <div className="message-from-name">→ {m.to}</div>
                          <div className="message-time">
                            {fmt(m.createdAt)}　{m.readAt ? <span style={{ color: 'var(--success)' }}>✓ 既読</span> : <span style={{ color: 'var(--text-muted)' }}>未読</span>}
                          </div>
                        </div>
                      </div>
                      <div className="message-actions">
                        <button className="btn-icon" onClick={() => remove(m.id)} title="削除">×</button>
                      </div>
                    </div>
                    <div className="message-text">{m.text}</div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
