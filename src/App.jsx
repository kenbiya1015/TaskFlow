import { useState, useEffect, useRef } from 'react'
import './App.css'
import { useLocalStorage } from './hooks/useLocalStorage'
import { AUTOSAVE_EVENT } from './hooks/useAutoSave'
import { MEMBERS, findMember } from './members'
import { runMigrations, autoBackup } from './lib/storage'
import { initCloudSync, STATUS_EVENT, forceFlush, getSyncStatus } from './lib/cloudSync'
import {
  consumeOAuthCallback,
  consumeServerCallback,
  exchangeServerCode,
  fetchGoogleEmail,
  startGcalAutoRefresh,
  stopGcalAutoRefresh,
  TOKEN_REFRESH_NOTICE_EVENT,
} from './lib/googleCalendar'
import { GCAL_CLIENT_ID, GCAL_USE_BACKEND } from './config'
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
import BusinessPriority from './components/BusinessPriority'
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
  { id: 'bizpriority', icon: '🏆', label: '事業優先順位' },
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
  const [allGcalTokens, setAllGcalTokens] = useLocalStorage('tf_gcal_user_tokens', {})
  const [clientIdOverride] = useLocalStorage('tf_gcal_clientId', '')
  const unreadCount = (messages || []).filter(m => m.to === currentUser && !m.readAt).length
  const [page, setPage] = useState('home')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [oauthNotice, setOauthNotice] = useState('')
  const [gcalReconnectNotice, setGcalReconnectNotice] = useState('')

  // 最新値を参照するための ref（useEffect のクロージャ問題回避）
  const allGcalTokensRef = useRef(allGcalTokens)
  allGcalTokensRef.current = allGcalTokens
  const clientIdRef = useRef(clientIdOverride)
  clientIdRef.current = clientIdOverride
  const currentUserRef = useRef(currentUser)
  currentUserRef.current = currentUser

  // Google OAuth リダイレクトからの戻り着地。/auth/callback のフラグメントに access_token がある。
  // ・該当ユーザーのトークンを tf_gcal_user_tokens に保存
  // ・currentUser を認証時のユーザーに切り替え
  // ・URL を元に戻し、戻り先ページ（既定: schedule）へ遷移
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.pathname !== '/auth/callback') return

    const cleanUrl = () => { try { window.history.replaceState({}, '', '/') } catch {} }
    const hasCode = !!new URLSearchParams(window.location.search || '').get('code')

    // ① サーバーサイド方式（認可コードフロー）：?code=... を Edge Function でトークン交換
    if (GCAL_USE_BACKEND && hasCode) {
      const pending = consumeServerCallback()
      cleanUrl()
      if (!pending) return
      if (pending.error) {
        setOauthNotice(`Google カレンダー連携に失敗しました：${pending.error}`)
        if (pending.returnTo) setPage(pending.returnTo)
        return
      }
      exchangeServerCode(pending.code, pending.user)
        .then(token => {
          if (token && token.access_token) {
            setAllGcalTokens(prev => ({ ...(prev || {}), [pending.user]: token }))
            setCurrentUser(pending.user)
            setPage(pending.returnTo || 'settings')
            setOauthNotice(`${pending.user} さんの Google カレンダーと連携しました。`)
          } else {
            setOauthNotice('Google カレンダー連携に失敗しました（トークン交換に失敗）。')
            setPage(pending.returnTo || 'settings')
          }
        })
        .catch(e => {
          setOauthNotice(`Google カレンダー連携に失敗しました：${e.message || e}`)
          setPage(pending.returnTo || 'settings')
        })
      return
    }

    // ② ブラウザ専用方式（暗黙フロー）：#access_token=... を直接受け取る
    const result = consumeOAuthCallback()
    cleanUrl()

    if (!result) return

    if (result.error) {
      setOauthNotice(`Google カレンダー連携に失敗しました：${result.error}`)
      if (result.returnTo) setPage(result.returnTo)
      return
    }

    if (result.user && result.token) {
      // まずはトークンを即保存（React 経由 → useLocalStorage → queuePush → Supabase）
      setAllGcalTokens(prev => ({ ...(prev || {}), [result.user]: result.token }))
      // 次に email を取得して hint 用に上書き保存
      fetchGoogleEmail(result.token.access_token).then(email => {
        if (!email) return
        setAllGcalTokens(prev => {
          const cur = (prev && prev[result.user]) || result.token
          return { ...(prev || {}), [result.user]: { ...cur, email } }
        })
      })
      // 認証したユーザーに切り替え（既に同じならノーオペ）
      setCurrentUser(result.user)
      setPage(result.returnTo || 'schedule')
      setOauthNotice(`${result.user} さんの Google カレンダーと連携しました。`)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // OAuth 通知は数秒で消す
  useEffect(() => {
    if (!oauthNotice) return
    const t = setTimeout(() => setOauthNotice(''), 5000)
    return () => clearTimeout(t)
  }, [oauthNotice])

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
    initCloudSync()
      .catch(e => console.warn('[App] cloud sync init failed', e))
      .finally(() => {
        // 4. GCal トークンの自動更新スケジューラ。
        //    ブラウザ方式（GCAL_USE_BACKEND=false）では、期限切れトークンの自動更新は
        //    Google のアカウント選択ポップアップを誘発しうるため、起動時の自動更新は行わない。
        //    （保存済みトークンが有効ならそのまま使用。失効時は設定ページの「再連携」ボタンで明示的に再取得）
        //    サーバー方式（Edge Function 経由）はポップアップを伴わないため、従来どおり自動更新する。
        if (GCAL_USE_BACKEND) {
          startGcalAutoRefresh({
            getClientId: () => (clientIdRef.current || '').trim() || GCAL_CLIENT_ID,
            getUser: () => currentUserRef.current,
            getAllTokens: () => allGcalTokensRef.current,
            setAllTokens: setAllGcalTokens,
          })
        }
      })
    return () => stopGcalAutoRefresh()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 連携が切れたら「一度だけ静かに」通知する（発火元の googleCalendar 側で重複抑止済み）。
  // その後は催促しない。再連携は設定画面の小さなボタンから行う。
  useEffect(() => {
    const handler = (e) => {
      const user = e.detail?.user || ''
      if (!user) return
      // 別ユーザーの更新失敗通知は無視（誤通知を防ぐ）
      if (user !== currentUserRef.current) return
      setGcalReconnectNotice(`Google カレンダー連携が切れました。設定からいつでも再連携できます。`)
    }
    window.addEventListener(TOKEN_REFRESH_NOTICE_EVENT, handler)
    return () => window.removeEventListener(TOKEN_REFRESH_NOTICE_EVENT, handler)
  }, [])

  useEffect(() => {
    if (!gcalReconnectNotice) return
    const t = setTimeout(() => setGcalReconnectNotice(''), 6000)
    return () => clearTimeout(t)
  }, [gcalReconnectNotice])

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
      case 'schedule': return <TodaySchedule currentUser={currentUser} onNavigate={setPage} />
      case 'tasks':    return <TaskList currentUser={currentUser} />
      case 'members':  return <Members currentUser={currentUser} />
      case 'ideas':    return <Ideas currentUser={currentUser} />
      case 'sns':      return <SNS currentUser={currentUser} />
      case 'mt':       return <MTMemo currentUser={currentUser} />
      case 'goals':    return <Goals currentUser={currentUser} />
      case 'being':    return <BeingGoals currentUser={currentUser} />
      case 'future':   return <FuturePlans currentUser={currentUser} />
      case 'bizpriority': return <BusinessPriority currentUser={currentUser} />
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
      {oauthNotice && (
        <div
          className="save-status save-status-saved"
          role="status"
          aria-live="polite"
          style={{ background: oauthNotice.includes('失敗') ? 'var(--danger)' : 'var(--success)', color: '#fff' }}
        >
          {oauthNotice}
        </div>
      )}
      {gcalReconnectNotice && (
        // 「一度だけ静かに通知」：控えめなトースト。数秒で自動的に消える（催促しない）。
        <div
          className="save-status"
          role="status"
          aria-live="polite"
          style={{
            pointerEvents: 'auto', cursor: 'pointer',
            background: 'var(--surface-2, #f1f3f5)', color: 'var(--text, #333)',
            border: '1px solid var(--border, #ddd)',
          }}
          onClick={() => { setPage('settings'); setGcalReconnectNotice('') }}
          title="クリックで設定画面へ"
        >
          {gcalReconnectNotice}
        </div>
      )}
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
  // ローカル debounce の保存状態
  const [autoState, setAutoState] = useState('idle')
  // クラウド同期の状態（pending 件数・失敗有無・オンライン可否）
  const [sync, setSync] = useState(() => {
    try { return getSyncStatus() } catch { return { pendingPushes: 0, hasFailed: false, online: true, connected: false } }
  })
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    const onAuto = (e) => setAutoState(e.detail?.state || 'idle')
    const onSync = (e) => setSync(e.detail || {})
    window.addEventListener(AUTOSAVE_EVENT, onAuto)
    window.addEventListener(STATUS_EVENT, onSync)
    return () => {
      window.removeEventListener(AUTOSAVE_EVENT, onAuto)
      window.removeEventListener(STATUS_EVENT, onSync)
    }
  }, [])

  const handleRetry = async () => {
    if (retrying) return
    setRetrying(true)
    try { await forceFlush() } finally { setRetrying(false) }
  }

  // 優先度：失敗 > オフライン > クラウド送信中 > ローカル保存中/完了
  if (sync.hasFailed) {
    return (
      <div className="save-status save-status-failed" role="status" aria-live="assertive">
        <span className="save-status-dot" aria-hidden />
        <span>保存に失敗しました（未送信 {sync.pendingPushes || 0} 件）</span>
        <button className="save-status-btn" onClick={handleRetry} disabled={retrying}>
          {retrying ? '再送信中…' : '再送信'}
        </button>
      </div>
    )
  }
  if (sync.online === false && (sync.pendingPushes || 0) > 0) {
    return (
      <div className="save-status save-status-offline" role="status" aria-live="polite">
        <span className="save-status-dot" aria-hidden />
        オフライン — {sync.pendingPushes} 件はオンライン復帰時に送信します
      </div>
    )
  }
  if ((sync.pendingPushes || 0) > 0) {
    return (
      <div className="save-status save-status-saving" aria-live="polite">
        <span className="save-status-dot" aria-hidden />
        クラウド保存中… ({sync.pendingPushes})
      </div>
    )
  }
  if (autoState === 'idle') return null
  return (
    <div className={`save-status save-status-${autoState}`} aria-live="polite">
      <span className="save-status-dot" aria-hidden />
      {autoState === 'saving' ? '保存中…' : '保存しました'}
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
