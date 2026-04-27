import { useEffect, useState } from 'react'
import './App.css'
import { users, notifications, missions, useStoreVersion } from './storage/storage.js'
import { seedIfNeeded, ensureDemoTeams } from './storage/seed.js'
import { ensureAnonymousAuth } from './lib/firebase.js'
import { syncUserProfile } from './lib/firestoreSync.js'
import { loadSwingActivities } from './lib/firestoreLoad.js'
import { maybeFireGoalReminder } from './lib/reminder.js'
import RegisterScreen from './screens/RegisterScreen.jsx'
import HomeScreen from './screens/HomeScreen.jsx'
import NotificationScreen from './screens/NotificationScreen.jsx'
import FriendsScreen from './screens/FriendsScreen.jsx'
import TeamScreen from './screens/TeamScreen.jsx'
import GuardianScreen from './screens/GuardianScreen.jsx'
import TabBar from './components/TabBar.jsx'
import ProfileModal from './components/ProfileModal.jsx'
import { ProfileProvider } from './hooks/useProfile.jsx'
import { ThemeProvider } from './hooks/useTheme.jsx'
import { FirestoreFriendsProvider } from './hooks/useFirestoreFriends.jsx'

const TABS = [
  { key: 'register', label: '登録', icon: '👤' },
  { key: 'home', label: 'ホーム', icon: '🏠' },
  { key: 'notif', label: '通知', icon: '🔔' },
  { key: 'friends', label: '友達', icon: '👥' },
  { key: 'team', label: 'チーム', icon: '⚾' },
  { key: 'guardian', label: '保護者', icon: '👪' },
]

export default function App() {
  useStoreVersion()
  const current = users.getCurrent()
  const [tab, setTab] = useState('home')
  const activeTab = current ? tab : 'register'

  useEffect(() => {
    if (current) {
      seedIfNeeded()
      ensureDemoTeams()
    }
  }, [current])

  // 20:00 以降に未達成ミッションがあればリマインダー通知（1日1回）。
  useEffect(() => {
    if (!current) return
    maybeFireGoalReminder(current)
    const interval = setInterval(() => maybeFireGoalReminder(current), 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [current])

  // Firebase anon auth + initial profile push + activities load (one-shot at mount).
  useEffect(() => {
    let cancelled = false
    ensureAnonymousAuth().then(async (uid) => {
      if (cancelled || !uid) return
      const me = users.getCurrent()
      if (!me) return
      syncUserProfile(me)
      const list = await loadSwingActivities()
      if (cancelled || !list) return
      const records = list.map((a) => {
        // createdAt が Firebase Timestamp なら toDate() で ISO 文字列に変換。
        // 取得不能なら date フィールド ("YYYY-MM-DD") を 12:00 に解釈してフォールバック。
        let ts = null
        if (a.createdAt && typeof a.createdAt.toDate === 'function') {
          ts = a.createdAt.toDate().toISOString()
        } else if (a.date) {
          ts = new Date(`${a.date}T12:00:00`).toISOString()
        }
        return {
          userId: me.id,
          date: a.date,
          goal: Number.isFinite(a.swingCount) ? a.swingCount : 0,
          childClaimed: true,
          claimedAt: ts,
          completed: true,
          approvedAt: ts,
        }
      })
      console.log('[Firestore] converted missions', records)
      missions.upsertMany(records)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const unreadCount = current ? notifications.unreadCount(current.id) : 0

  const handleTabChange = (next) => {
    if (next === 'notif' && current && unreadCount > 0) {
      notifications.markAllRead(current.id)
    }
    setTab(next)
  }

  let screen
  switch (activeTab) {
    case 'register':
      screen = <RegisterScreen onDone={() => setTab('home')} />
      break
    case 'home':
      screen = <HomeScreen />
      break
    case 'notif':
      screen = <NotificationScreen />
      break
    case 'friends':
      screen = <FriendsScreen />
      break
    case 'team':
      screen = <TeamScreen />
      break
    case 'guardian':
      screen = <GuardianScreen onNavigate={setTab} />
      break
    default:
      screen = <HomeScreen />
  }

  return (
    <ThemeProvider>
      <FirestoreFriendsProvider>
        <ProfileProvider>
          <div className="app-root">
            <div className="screen-container" key={activeTab}>{screen}</div>
            <TabBar
              tabs={TABS}
              active={activeTab}
              onChange={handleTabChange}
              locked={!current ? 'register' : null}
              badges={{ notif: unreadCount }}
            />
            <ProfileModal />
          </div>
        </ProfileProvider>
      </FirestoreFriendsProvider>
    </ThemeProvider>
  )
}
