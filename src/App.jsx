import { useEffect, useState } from 'react'
import './App.css'
import { users, notifications, useStoreVersion } from './storage/storage.js'
import { seedIfNeeded, ensureDemoTeams } from './storage/seed.js'
import RegisterScreen from './screens/RegisterScreen.jsx'
import HomeScreen from './screens/HomeScreen.jsx'
import NotificationScreen from './screens/NotificationScreen.jsx'
import FriendsScreen from './screens/FriendsScreen.jsx'
import TeamScreen from './screens/TeamScreen.jsx'
import GuardianScreen from './screens/GuardianScreen.jsx'
import TabBar from './components/TabBar.jsx'
import ProfileModal from './components/ProfileModal.jsx'
import { ProfileProvider } from './hooks/useProfile.jsx'

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
    <ProfileProvider>
      <div className="app-root">
        <div className="screen-container">{screen}</div>
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
  )
}
