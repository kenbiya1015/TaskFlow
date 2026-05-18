import { useState, useEffect } from 'react'
import './App.css'
import { useLocalStorage } from './hooks/useLocalStorage'
import { AUTOSAVE_EVENT } from './hooks/useAutoSave'
import { MEMBERS, findMember } from './members'
import { runMigrations, autoBackup } from './lib/storage'
import { initCloudSync } from './lib/cloudSync'
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
  { id: 'members',  icon: '💬', label: 'メンバー伝達' },
  { id: 'settings', icon: '⚙️', label: '設定' },
]

// スマホ下部タブに常時表示するページ（短いラベルで表示）
const PRIMARY_TABS = [
  { id: 'home',     icon: '🏠', label: 'マイページ' },
  { id: 'schedule', icon: '📅', label: 'スケジュール' },
  { id: 'tasks',    icon: '✅', label: 'タスク' },
  { id: 'ideas',    icon: '💡', label: 'アイデア' },
]
const PRIMARY_TAB_IDS = PRIMARY_TABS.map(t => t.id)

export default function App() {
  const [currentUser, setCurrentUser] = useLocalStorage('tf_currentUser', '')
  const [messages] = useLocalStorage('tf_messages', [])
  const unreadCount = (messages || []).filter(m => m.to === currentUser && !m.readAt).length
  const [page, setPage] = useState('home')
  const [drawerOpen, setDrawerOpen] = useState(false)

  // ページ遷移時にドロワーを自動で閉じる
  useEffect(() => { setDrawerOpen(false) }, [page])

  // Escキーでドロワーを閉じる
  useEffect(() => {
    if (!drawerOpen) return
    const handler = (e) => { if (e.key === 'Escape') setDrawerOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [drawerOpen])

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
      <SaveStatusIndicator />
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
              {n.id === 'members' && unreadCount > 0 && (
                <span className="nav-badge">{unreadCount}</span>
              )}
            </button>
          ))}
        </nav>
      </aside>
      <main className="main">{render()}</main>

      {/* スマホ下部タブバー（CSSで <=768px のみ表示） */}
      <nav className="mobile-tabbar" aria-label="モバイルタブ">
        {PRIMARY_TABS.map(t => (
          <button
            key={t.id}
            className={`mobile-tab ${page === t.id ? 'active' : ''}`}
            onClick={() => setPage(t.id)}
            aria-label={t.label}
            aria-current={page === t.id ? 'page' : undefined}
          >
            <span className="mobile-tab-icon">{t.icon}</span>
            <span className="mobile-tab-label">{t.label}</span>
          </button>
        ))}
        <button
          className={`mobile-tab mobile-tab-menu ${drawerOpen || !PRIMARY_TAB_IDS.includes(page) ? 'active' : ''}`}
          onClick={() => setDrawerOpen(o => !o)}
          aria-label="メニューを開く"
          aria-expanded={drawerOpen}
        >
          <span className="mobile-tab-icon">≡</span>
          <span className="mobile-tab-label">メニュー</span>
        </button>
      </nav>

      {/* スマホ用 全メニュードロワー */}
      <div
        className={`mobile-menu-overlay ${drawerOpen ? 'open' : ''}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden={!drawerOpen}
      />
      <div
        className={`mobile-menu-drawer ${drawerOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!drawerOpen}
        aria-label="全メニュー"
      >
        <div className="mobile-menu-handle" />
        <div className="mobile-menu-header">
          <div
            className="login-avatar"
            style={{
              width: 44, height: 44, fontSize: 17,
              background: `linear-gradient(135deg, ${member?.color || '#0d9488'}, ${member?.color || '#0d9488'}cc)`,
            }}
          >
            {member?.initial || currentUser.slice(0, 1)}
          </div>
          <div className="mobile-menu-user-info">
            <div className="mobile-menu-user-name">{currentUser}</div>
            <div className="mobile-menu-user-role">{member?.role || ''}</div>
          </div>
          <button
            className="mobile-menu-close"
            onClick={() => setDrawerOpen(false)}
            aria-label="閉じる"
          >×</button>
        </div>
        <div className="mobile-menu-list">
          {NAV.map(n => (
            <button
              key={n.id}
              className={`mobile-menu-item ${page === n.id ? 'active' : ''}`}
              onClick={() => setPage(n.id)}
            >
              <span className="mobile-menu-item-icon">{n.icon}</span>
              <span className="mobile-menu-item-label">{n.label}</span>
              {n.id === 'members' && unreadCount > 0 && (
                <span className="nav-badge" style={{ marginLeft: 'auto' }}>{unreadCount}</span>
              )}
              {page === n.id && <span className="mobile-menu-item-mark" aria-hidden>●</span>}
            </button>
          ))}
        </div>
        <div className="mobile-menu-footer">
          <button className="btn btn-secondary" onClick={() => setCurrentUser('')}>ログアウト</button>
        </div>
      </div>
    </div>
  )
}

function SaveStatusIndicator() {
  const [state, setState] = useState('idle')
  useEffect(() => {
    const handler = (e) => setState(e.detail?.state || 'idle')
    window.addEventListener(AUTOSAVE_EVENT, handler)
    return () => window.removeEventListener(AUTOSAVE_EVENT, handler)
  }, [])
  if (state === 'idle') return null
  return (
    <div className={`save-status save-status-${state}`} aria-live="polite">
      <span className="save-status-dot" aria-hidden />
      {state === 'saving' ? '保存中…' : '保存しました'}
    </div>
  )
}

function Login({ onLogin }) {
  return (
    <div className="login-screen">
      <div className="login-bg-orbs" aria-hidden>
        <span className="login-orb login-orb-1" />
        <span className="login-orb login-orb-2" />
        <span className="login-orb login-orb-3" />
      </div>
      <div className="login-card">
        <div className="login-brand">heartrust</div>
        <h1 className="login-hero-title">
          医療の前に、<br />健美屋がある生活を。
        </h1>
        <div className="login-hero-sub">今日も一歩、理想の自分へ。</div>
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
              </div>
              <div className="login-user-arrow" aria-hidden>→</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
