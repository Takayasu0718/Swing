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
import { FirestoreTeamsProvider } from './hooks/useFirestoreTeams.jsx'
import {
  FirestoreNotificationsProvider,
  useFirestoreNotifications,
} from './hooks/useFirestoreNotifications.jsx'
import { FirestoreActivitiesProvider } from './hooks/useFirestoreActivities.jsx'
import { markAllReadFsNotifications } from './lib/firestoreNotifications.js'

const TABS = [
  { key: 'register', label: '登録', icon: '👤' },
  { key: 'home', label: 'ホーム', icon: '🏠' },
  { key: 'notif', label: '通知', icon: '🔔' },
  { key: 'friends', label: '友達', icon: '👥' },
  { key: 'team', label: 'チーム', icon: '⚾' },
  { key: 'guardian', label: '保護者', icon: '👪' },
]

function AppShell() {
  useStoreVersion()
  const current = users.getCurrent()
  const [tab, setTab] = useState('home')
  const needsUserIdSetup = !!current && !current.userId
  const activeTab = !current || needsUserIdSetup ? 'register' : tab
  const { unread: fsUnread, myUid } = useFirestoreNotifications()

  useEffect(() => {
    if (current) {
      seedIfNeeded()
      ensureDemoTeams()
    }
  }, [current])

  useEffect(() => {
    if (!current) return
    maybeFireGoalReminder(current)
    const interval = setInterval(() => maybeFireGoalReminder(current), 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [current])

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

  const localUnread = current ? notifications.unreadCount(current.id) : 0
  const unreadCount = localUnread + fsUnread

  const handleTabChange = (next) => {
    if (next === 'notif' && current) {
      if (localUnread > 0) notifications.markAllRead(current.id)
      if (fsUnread > 0 && myUid) markAllReadFsNotifications(myUid)
    }
    setTab(next)
  }

  let screen
  switch (activeTab) {
    case 'register':
      screen = <RegisterScreen onDone={() => setTab('home')} needsUserIdSetup={needsUserIdSetup} />
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
    <div className="app-root">
      <div className="screen-container" key={activeTab}>{screen}</div>
      <TabBar
        tabs={TABS}
        active={activeTab}
        onChange={handleTabChange}
        locked={!current || needsUserIdSetup ? 'register' : null}
        badges={{ notif: unreadCount }}
      />
      <ProfileModal />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <FirestoreFriendsProvider>
        <FirestoreTeamsProvider>
          <FirestoreActivitiesProvider>
            <FirestoreNotificationsProvider>
              <ProfileProvider>
                <AppShell />
              </ProfileProvider>
            </FirestoreNotificationsProvider>
          </FirestoreActivitiesProvider>
        </FirestoreTeamsProvider>
      </FirestoreFriendsProvider>
    </ThemeProvider>
  )
}
