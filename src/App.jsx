import { useState, useEffect, useRef } from 'react'
import './App.css'
import { useLocalStorage, useUserScopedStorage } from './hooks/useLocalStorage'
import { MEMBERS, findMember } from './members'
import { runMigrations, autoBackup, listAutoBackups, restoreAutoBackup } from './lib/storage'
import { initCloudSync, getSyncStatus, STATUS_EVENT, uploadAllLocal } from './lib/cloudSync'
import Home from './components/Home'
import TodaySchedule from './components/TodaySchedule'
import TaskList from './components/TaskList'
import Members from './components/Members'
import Ideas from './components/Ideas'
import SNS from './components/SNS'
import MTMemo from './components/MTMemo'
import Goals from './components/Goals'
import BeingGoals from './components/BeingGoals'
import FuturePlans from './components/FuturePlans'
import Strategy from './components/Strategy'
import Settings from './components/Settings'

const NAV = [
  { id: 'home',     icon: '🏠', label: 'マイページ' },
  { id: 'schedule', icon: '📅', label: '今日のスケジュール' },
  { id: 'tasks',    icon: '✅', label: 'タスク一覧' },
  { id: 'ideas',    icon: '💡', label: 'アイデア' },
  { id: 'sns',      icon: '📱', label: 'SNS' },
  { id: 'mt',       icon: '📝', label: 'MT' },
  { id: 'goals',    icon: '🎯', label: '目標' },
  { id: 'being',    icon: '🌟', label: 'なりたい自分' },
  { id: 'future',   icon: '🚀', label: '取り組み' },
  { id: 'strategy', icon: '📋', label: '戦略・戦術' },
  { id: 'members',  icon: '👥', label: 'メンバー管理' },
  { id: 'settings', icon: '⚙️', label: '設定' },
]

export default function App() {
  const [currentUser, setCurrentUser] = useLocalStorage('tf_currentUser', '')
  const [page, setPage] = useState('home')

  useEffect(() => {
    // 1. 起動時にスキーマ移行を実行（古いキー名・形式があれば自動で新形式へ）
    runMigrations()
    // 2. 起動時のスナップショットを履歴に保存（最大5世代、1時間以内は重複保存しない）
    autoBackup()
    // 3. クラウド同期を開始（Supabaseから最新取得 → Realtime購読）
    initCloudSync().catch(e => console.warn('[App] cloud sync init failed', e))
  }, [])

  useEffect(() => {
    if (!currentUser) return
    // ユーザーごとのデフォルトページを読み込んで表示
    try {
      const all = JSON.parse(window.localStorage.getItem('tf_default_page_by_user') || '{}')
      const dp = all[currentUser] || 'home'
      setPage(dp)
    } catch {
      setPage('home')
    }
  }, [currentUser])

  if (!currentUser) {
    return <Login onLogin={setCurrentUser} />
  }

  const member = findMember(currentUser)

  const render = () => {
    switch (page) {
      case 'home':     return <Home userName={currentUser} onNavigate={setPage} />
      case 'schedule': return <TodaySchedule currentUser={currentUser} />
      case 'tasks':    return <TaskList currentUser={currentUser} />
      case 'members':  return <Members currentUser={currentUser} />
      case 'ideas':    return <Ideas currentUser={currentUser} />
      case 'sns':      return <SNS currentUser={currentUser} />
      case 'mt':       return <MTMemo currentUser={currentUser} />
      case 'goals':    return <Goals currentUser={currentUser} />
      case 'being':    return <BeingGoals currentUser={currentUser} />
      case 'future':   return <FuturePlans currentUser={currentUser} />
      case 'strategy': return <Strategy currentUser={currentUser} />
      case 'settings': return (
        <Settings
          currentUser={currentUser}
          onChangeUser={setCurrentUser}
          onLogout={() => setCurrentUser('')}
        />
      )
      default: return <Home userName={currentUser} onNavigate={setPage} />
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-title">heartrust</div>
          <div className="sidebar-subtitle">健美屋</div>
        </div>

        <div className="sidebar-user">
          <div
            className="sidebar-avatar"
            style={{ background: `linear-gradient(135deg, ${member?.color || '#2f6fed'}, ${member?.color || '#2f6fed'}cc)` }}
            title={currentUser}
          >
            {member?.initial || currentUser.slice(0, 1)}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{currentUser}</div>
            <button className="sidebar-logout" onClick={() => setCurrentUser('')}>ログアウト</button>
          </div>
        </div>

        <nav>
          {NAV.map(n => (
            <button
              key={n.id}
              className={`nav-item ${page === n.id ? 'active' : ''}`}
              onClick={() => setPage(n.id)}
              aria-label={n.label}
            >
              <span className="nav-icon">{n.icon}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <CloudSyncIndicator />
        <QuickRestoreButton />
      </aside>
      <main className="main">{render()}</main>
    </div>
  )
}

function CloudSyncIndicator() {
  const [status, setStatus] = useState(getSyncStatus())
  const [flash, setFlash] = useState(false)
  const lastSyncRef = useRef(status.lastSyncAt)

  useEffect(() => {
    const handler = (e) => setStatus(e.detail || getSyncStatus())
    window.addEventListener(STATUS_EVENT, handler)
    return () => window.removeEventListener(STATUS_EVENT, handler)
  }, [])

  // 同期成功した瞬間、緑バッジを一瞬光らせる
  useEffect(() => {
    if (status.lastSyncAt && status.lastSyncAt !== lastSyncRef.current) {
      lastSyncRef.current = status.lastSyncAt
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 1500)
      return () => clearTimeout(t)
    }
  }, [status.lastSyncAt])

  let label, cls
  if (!status.online) {
    label = '⚠ オフライン'; cls = 'cloud-ind-offline'
  } else if (status.pendingPushes > 0) {
    label = `↻ 保存中... (${status.pendingPushes})`; cls = 'cloud-ind-saving'
  } else if (flash) {
    label = '✓ 保存しました'; cls = 'cloud-ind-flash'
  } else if (status.connected) {
    label = '● クラウド同期中'; cls = 'cloud-ind-online'
  } else {
    label = '… 接続待機中'; cls = 'cloud-ind-connecting'
  }

  return (
    <div className={`cloud-indicator ${cls}`} title={status.lastSyncAt ? `最終同期: ${new Date(status.lastSyncAt).toLocaleString('ja-JP')}` : ''}>
      {label}
    </div>
  )
}

function QuickRestoreButton() {
  const [open, setOpen] = useState(false)
  const [backups, setBackups] = useState(() => listAutoBackups())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (open) setBackups(listAutoBackups())
  }, [open])

  const handleRestore = async (b) => {
    const label = new Date(b.timestamp).toLocaleString('ja-JP')
    if (!confirm(`${label} のバックアップに戻します。\n（既存データに上書きせず、空のキーだけ補完するマージ復元）\n続行しますか？`)) return
    setBusy(true)
    setMsg('')
    try {
      restoreAutoBackup(b.timestamp, { merge: true })
      // 復元後の状態をクラウドへも反映（先に push してから reload）
      try { await uploadAllLocal() } catch {}
      setMsg('復元しました。再読み込みします...')
      setTimeout(() => location.reload(), 600)
    } catch (e) {
      setMsg(`失敗: ${e.message || e}`)
    } finally {
      setBusy(false)
    }
  }

  if (backups.length === 0) return null

  return (
    <div className="quick-restore">
      <button
        className="quick-restore-toggle"
        onClick={() => setOpen(s => !s)}
        title="自動バックアップから復元"
      >
        ↶ 復元 {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="quick-restore-panel">
          <div className="quick-restore-title">直前のバックアップから復元</div>
          {backups.slice(0, 5).map((b, i) => (
            <button
              key={b.timestamp}
              className="quick-restore-item"
              disabled={busy}
              onClick={() => handleRestore(b)}
            >
              <span>{i === 0 ? '🟢 最新' : ` ${i + 1} 番目`}</span>
              <span>{new Date(b.timestamp).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{b.keyCount}キー</span>
            </button>
          ))}
          {msg && <div style={{ fontSize: 10, padding: '4px 6px' }}>{msg}</div>}
        </div>
      )}
    </div>
  )
}

function Login({ onLogin }) {
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">heartrust</div>
        <div className="login-title">健美屋へようこそ</div>
        <div className="login-subtitle">SELECT　YOUR　ACCOUNT</div>
        <div className="login-users">
          {MEMBERS.map(m => (
            <button key={m.id} className="login-user" onClick={() => onLogin(m.name)}>
              <div
                className="login-avatar"
                style={{ background: `linear-gradient(135deg, ${m.color}, ${m.color}cc)` }}
              >
                {m.initial}
              </div>
              <div className="login-user-info">
                <div className="login-user-name">{m.name}</div>
                <div className="login-user-role">{m.role}</div>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 18 }}>→</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
