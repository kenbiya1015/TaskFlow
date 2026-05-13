import { useState, useEffect } from 'react'
import './App.css'
import { useLocalStorage } from './hooks/useLocalStorage'
import { MEMBERS, findMember } from './members'
import { runMigrations } from './lib/storage'
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

  useEffect(() => { runMigrations() }, [])

  useEffect(() => {
    if (currentUser) setPage('home')
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
      case 'sns':      return <SNS />
      case 'mt':       return <MTMemo currentUser={currentUser} />
      case 'goals':    return <Goals />
      case 'being':    return <BeingGoals currentUser={currentUser} />
      case 'future':   return <FuturePlans />
      case 'strategy': return <Strategy />
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
          <div className="sidebar-title">TaskFlow</div>
          <div className="sidebar-subtitle">健美</div>
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
      </aside>
      <main className="main">{render()}</main>
    </div>
  )
}

function Login({ onLogin }) {
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-title">TaskFlow へようこそ</div>
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
