import { useEffect, useState } from 'react'
import './App.css'
import { users, session, notifications, missions, useStoreVersion } from './storage/storage.js'
import { ROLES } from './storage/schema.js'
import { seedIfNeeded, ensureDemoTeams } from './storage/seed.js'
import { auth, subscribeAuthState } from './lib/firebase.js'
import { syncUserProfile, fetchMyUserProfile } from './lib/firestoreSync.js'
import { subscribeMyConversations } from './lib/firestoreDms.js'
import { loadSwingActivities } from './lib/firestoreLoad.js'
import { maybeFireGoalReminder } from './lib/reminder.js'
import { applyMissPenaltyIfNeeded } from './lib/battingPenalty.js'
import {
  subscribeTrialRequest,
  subscribeMyParticipation,
} from './lib/firestoreTrialRequests.js'
import LoginScreen from './screens/LoginScreen.jsx'
import RegisterScreen from './screens/RegisterScreen.jsx'
import TermsScreen from './screens/TermsScreen.jsx'
import PrivacyScreen from './screens/PrivacyScreen.jsx'
import HomeScreen from './screens/HomeScreen.jsx'
import NotificationScreen from './screens/NotificationScreen.jsx'
import FriendsScreen from './screens/FriendsScreen.jsx'
import TeamScreen from './screens/TeamScreen.jsx'
import GuardianScreen from './screens/GuardianScreen.jsx'
import TabBar from './components/TabBar.jsx'
import ProfileModal from './components/ProfileModal.jsx'
import DmOverlay from './components/DmOverlay.jsx'
import { ProfileProvider } from './hooks/useProfile.jsx'
import { DmProvider, useDm } from './hooks/useDm.jsx'
import { FirestoreFriendsProvider } from './hooks/useFirestoreFriends.jsx'
import { FirestoreTeamsProvider } from './hooks/useFirestoreTeams.jsx'
import {
  FirestoreNotificationsProvider,
  useFirestoreNotifications,
} from './hooks/useFirestoreNotifications.jsx'
import { FirestoreActivitiesProvider } from './hooks/useFirestoreActivities.jsx'
import { useFirestoreTeams } from './hooks/useFirestoreTeams.jsx'
import { markAllReadFsNotifications } from './lib/firestoreNotifications.js'

import tabRegister from './assets/tabs/register.png'
import tabHome from './assets/tabs/home.png'
import tabNotif from './assets/tabs/notif.png'
import tabFriends from './assets/tabs/friends.png'
import tabTeam from './assets/tabs/team.png'
import tabGuardian from './assets/tabs/guardian.png'

const TABS = [
  { key: 'register', label: '登録', iconImg: tabRegister },
  { key: 'home', label: 'ホーム', iconImg: tabHome },
  { key: 'notif', label: '通知', iconImg: tabNotif },
  { key: 'friends', label: '友達', iconImg: tabFriends },
  { key: 'team', label: 'チーム', iconImg: tabTeam },
  { key: 'guardian', label: '設定', iconImg: tabGuardian },
]

function AppShell() {
  useStoreVersion()
  // authUid: undefined = 判定中, null = 未ログイン, string = ログイン中
  const [authUid, setAuthUid] = useState(undefined)
  // どの authUid に対して Firestore profile fetch を完了したか（uid または null）
  const [profileFetchedFor, setProfileFetchedFor] = useState(null)

  useEffect(() => {
    return subscribeAuthState((uid) => setAuthUid(uid))
  }, [])

  // ログイン直後に Firestore から自分の profile を読み戻して localStorage に投入。
  // ローカルに既に current user がある場合（再読込時等）は fetch 不要。
  useEffect(() => {
    if (!authUid) return undefined
    if (users.getCurrent()) return undefined
    if (profileFetchedFor === authUid) return undefined
    let cancelled = false
    fetchMyUserProfile().then((p) => {
      if (cancelled) return
      if (p && p.nickname) {
        const u = users.create({
          email: auth?.currentUser?.email || p.email || '',
          nickname: p.nickname || '',
          userId: p.userId || '',
          avatarStamp: p.avatarStamp || '',
          role: p.role || 'player',
          dailyGoal: p.dailyGoal ?? null,
          advice: p.advice || '',
          teamName: p.teamName || '',
          childIds: p.childIds || [],
          guardianId: p.guardianId ?? null,
          battingStatus: p.battingStatus || undefined,
          customStatusLabel: p.customStatusLabel || '',
          battingStatusPenaltyCount: p.battingStatusPenaltyCount || 0,
        })
        session.setCurrentUser(u.id)
      }
      setProfileFetchedFor(authUid)
    })
    return () => {
      cancelled = true
    }
  }, [authUid, profileFetchedFor])

  const current = users.getCurrent()
  // profile チェック完了: 未ログインか、ローカルに current user がある、
  // または対応する authUid で fetch 済み。
  const profileChecked =
    authUid === null || !!current || profileFetchedFor === authUid

  const [tab, setTab] = useState('home')
  // 規約系画面（terms/privacy）から戻る時の遷移元を保持。
  // 登録画面・設定画面どちらから来ても適切に戻せる。
  const [previousTab, setPreviousTab] = useState(null)
  const navigateLegal = (legalKey) => {
    setPreviousTab(tab)
    setTab(legalKey)
  }
  const backFromLegal = () => {
    setTab(previousTab || 'guardian')
    setPreviousTab(null)
  }
  const needsUserIdSetup = !!current && !current.userId
  // 規約系（terms/privacy）は profile 未完成でも閲覧可能。それ以外は登録に矯正。
  const isLegalTab = tab === 'terms' || tab === 'privacy'
  const activeTab = isLegalTab ? tab : (!current || needsUserIdSetup ? 'register' : tab)
  const { unread: fsUnread, myUid } = useFirestoreNotifications()
  const { partnerUid: openDmPartner } = useDm()
  const { myFsTeam } = useFirestoreTeams()
  const [dmConversations, setDmConversations] = useState([])
  const [trialRequest, setTrialRequest] = useState(null)
  const [trialParticipation, setTrialParticipation] = useState(null)
  const isTrial = current?.role === ROLES.TRIAL

  // 体験ユーザーのみ trialRequest/参加状態を購読し、未回答/更新後フラグを算出。
  // updatedAt > respondedAt の場合も再回答を促すため badge を立てる。
  // role/team 切り替え時の stale state は trialUnanswered の式側で
  // isTrial && myFsTeam?.id を要求して無効化する。
  useEffect(() => {
    if (!isTrial || !myFsTeam?.id) return undefined
    return subscribeTrialRequest(myFsTeam.id, setTrialRequest)
  }, [isTrial, myFsTeam?.id])

  useEffect(() => {
    if (!isTrial || !myFsTeam?.id || !myUid) return undefined
    return subscribeMyParticipation(myFsTeam.id, myUid, setTrialParticipation)
  }, [isTrial, myFsTeam?.id, myUid])

  const trialUnanswered =
    isTrial &&
    !!myFsTeam?.id &&
    !!trialRequest &&
    (!trialParticipation ||
      (trialRequest.updatedAt &&
        (!trialParticipation.respondedAt ||
          trialParticipation.respondedAt < trialRequest.updatedAt)))

  // DM の未読数を保護者タブのバッジに出すため、会話メタを軽量購読
  // （メッセージ本体ではなく conversation doc のみ。送信のたびに 1 回更新されるだけなので安価）
  useEffect(() => {
    if (!myUid) return
    return subscribeMyConversations(myUid, setDmConversations)
  }, [myUid])

  const dmUnreadCount = dmConversations.filter((c) => {
    if (!c.lastMessageAt) return false
    if (c.lastMessageSenderUid === myUid) return false
    // 現在 DM を開いている相手の会話は楽観的に既読とみなす（サーバー応答待たない）
    const otherUid = (c.participants || []).find((p) => p !== myUid)
    if (openDmPartner && otherUid === openDmPartner) return false
    const myLastReadAt = c.lastReadAt?.[myUid]
    return !myLastReadAt || myLastReadAt < c.lastMessageAt
  }).length

  // 登録/設定 以外の画面では共通の野球背景を <body> に付与する
  useEffect(() => {
    const useBg = activeTab !== 'register' && activeTab !== 'guardian'
    document.body.classList.toggle('has-baseball-bg', useBg)
    return () => document.body.classList.remove('has-baseball-bg')
  }, [activeTab])

  // バッティングステータスの未達成ペナルティを適用（起動時に1回）
  useEffect(() => {
    if (current?.id) applyMissPenaltyIfNeeded(current.id)
  }, [current?.id])

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

  // ログイン済みかつ profile 確定後に Firestore から過去の素振り履歴を取り込み。
  useEffect(() => {
    if (!authUid || !profileChecked) return undefined
    let cancelled = false
    ;(async () => {
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
    })()
    return () => {
      cancelled = true
    }
  }, [authUid, profileChecked])

  const localUnread = current ? notifications.unreadCount(current.id) : 0
  const unreadCount = localUnread + fsUnread

  const handleTabChange = (next) => {
    if (next === 'notif' && current) {
      if (localUnread > 0) notifications.markAllRead(current.id)
      if (fsUnread > 0 && myUid) markAllReadFsNotifications(myUid)
    }
    setTab(next)
  }

  // Auth ゲート: 初期判定中 / 未ログイン / プロフィール読込中。
  // 全 hook 呼び出しの後でここに来ること（React のルール）。
  if (authUid === undefined) {
    return (
      <div className="app-root">
        <div className="screen"><div className="empty-txt">読み込み中…</div></div>
      </div>
    )
  }
  if (authUid === null) {
    return (
      <div className="app-root">
        <LoginScreen />
      </div>
    )
  }
  if (!profileChecked) {
    return (
      <div className="app-root">
        <div className="screen"><div className="empty-txt">プロフィールを読み込み中…</div></div>
      </div>
    )
  }

  let screen
  switch (activeTab) {
    case 'register':
      screen = (
        <RegisterScreen
          onDone={() => setTab('home')}
          needsUserIdSetup={needsUserIdSetup}
          onOpenLegal={navigateLegal}
        />
      )
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
      screen = <GuardianScreen onNavigate={setTab} onOpenLegal={navigateLegal} />
      break
    case 'terms':
      screen = <TermsScreen onBack={backFromLegal} />
      break
    case 'privacy':
      screen = <PrivacyScreen onBack={backFromLegal} />
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
        badges={{
          notif: unreadCount,
          guardian: { count: dmUnreadCount, dot: trialUnanswered },
        }}
      />
      <ProfileModal />
      <DmOverlay />
    </div>
  )
}

export default function App() {
  return (
    <FirestoreFriendsProvider>
      <FirestoreTeamsProvider>
        <FirestoreActivitiesProvider>
          <FirestoreNotificationsProvider>
            <ProfileProvider>
              <DmProvider>
                <AppShell />
              </DmProvider>
            </ProfileProvider>
          </FirestoreNotificationsProvider>
        </FirestoreActivitiesProvider>
      </FirestoreTeamsProvider>
    </FirestoreFriendsProvider>
  )
}
