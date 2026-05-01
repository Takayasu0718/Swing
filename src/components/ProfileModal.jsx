import { useEffect, useRef } from 'react'
import { useProfile } from '../hooks/useProfile.jsx'
import { useFirestoreFriends } from '../hooks/useFirestoreFriends.jsx'
import { useFirestoreTeams } from '../hooks/useFirestoreTeams.jsx'
import { useFirestoreActivities } from '../hooks/useFirestoreActivities.jsx'
import { toggleFsActivityLike } from '../lib/firestoreActivities.js'
import { users, teams, friendships, missions, activities } from '../storage/storage.js'
import { ROLES, ROLE_LABELS } from '../storage/schema.js'
import { getStamp } from '../storage/stamps.js'
import { countAchievementDays, computeStreak, computeLongestStreak } from '../lib/date.js'
import { levelFromProgress } from '../lib/dragon.js'
import { sendFriendRequest } from '../lib/events.js'
import { sendFriendRequestFs } from '../lib/firestoreFriends.js'
import ActivityItem from './ActivityItem.jsx'

export default function ProfileModal() {
  const { viewUserId, closeProfile } = useProfile()
  const { myUid, allUsers, friendships: fsFriendships } = useFirestoreFriends()
  const { allFsTeams } = useFirestoreTeams()
  const { activities: fsActivities } = useFirestoreActivities()
  const me = users.getCurrent()
  const modalRef = useRef(null)
  const closeRef = useRef(null)
  const open = Boolean(viewUserId)

  useEffect(() => {
    if (!open) return
    const prevActive = document.activeElement
    closeRef.current?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeProfile()
        return
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (prevActive instanceof HTMLElement) prevActive.focus()
    }
  }, [open, closeProfile])

  if (!open || !me) return null
  // localStorage か Firestore（実ユーザー）からユーザーを引く
  const localUser = users.get(viewUserId)
  const fsUser = !localUser ? (allUsers || []).find((u) => u.uid === viewUserId) : null
  const user = localUser || (fsUser
    ? {
        id: fsUser.uid,
        nickname: fsUser.nickname,
        userId: fsUser.userId,
        teamName: fsUser.teamName,
        avatarStamp: fsUser.avatarStamp,
        role: fsUser.role || ROLES.PLAYER,
        dailyGoal: fsUser.dailyGoal,
        email: fsUser.email,
        advice: fsUser.advice,
      }
    : null)
  if (!user) return null

  const isFsUser = !!fsUser
  const isMe = isFsUser ? user.id === myUid : user.id === me.id
  const stamp = getStamp(user.avatarStamp)
  // 表示対象のチーム名を解決:
  // 1. user.teamName（登録画面で入力された自由記述）が最優先
  // 2. FS チーム所属（memberIds に user.id を含むチーム名）
  // 3. localStorage チーム所属
  // 4. どれもなければ「無所属」
  const fsTeam = isFsUser
    ? (allFsTeams || []).find((t) => (t.memberIds || []).includes(user.id))
    : null
  const localTeam = !isFsUser ? teams.findByMember(user.id) : null
  const teamLabel = user.teamName || fsTeam?.name || localTeam?.name || '無所属'
  const isPlayer = user.role === ROLES.PLAYER

  const userMissions = isPlayer && !isFsUser ? missions.listByUser(user.id) : []
  const days = countAchievementDays(userMissions)
  const streak = computeStreak(userMissions)
  const longestStreak = computeLongestStreak(userMissions)
  const level = levelFromProgress(days, longestStreak)

  const localActs = activities.listByUsers([user.id]).map((a) => ({ ...a, source: 'local' }))
  const fsActs = isFsUser ? fsActivities.filter((a) => a.userId === user.id) : []
  const userActivities = [...fsActs, ...localActs]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 10)

  // フレンド関係: Firestore（実ユーザー対象）優先、なければ localStorage を確認
  let isFriend = false
  let outgoingPending = false
  let incomingPending = false
  if (!isMe) {
    if (isFsUser) {
      const fsRel = (fsFriendships || []).find((f) => f.participants?.includes(user.id))
      isFriend = fsRel?.status === 'accepted'
      outgoingPending = fsRel?.status === 'pending' && fsRel.fromUid === myUid
      incomingPending = fsRel?.status === 'pending' && fsRel.toUid === myUid
    } else {
      const localRel = friendships.list().find(
        (f) =>
          (f.fromUserId === me.id && f.toUserId === user.id) ||
          (f.fromUserId === user.id && f.toUserId === me.id),
      )
      isFriend = localRel?.status === 'accepted'
      outgoingPending = localRel?.status === 'pending' && localRel.fromUserId === me.id
      incomingPending = localRel?.status === 'pending' && localRel.toUserId === me.id
    }
  }

  const handleLikeActivity = (a) => {
    if (a.source === 'fs') toggleFsActivityLike(a.id, myUid)
    else activities.toggleLike(a.id, me.id)
  }
  const handleSendRequest = () => {
    if (isFsUser) sendFriendRequestFs(user.id)
    else sendFriendRequest(me.id, user.id)
  }

  return (
    <div className="modal-overlay" onClick={closeProfile}>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-label={`${user.nickname}のプロフィール`}
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeRef} className="modal-close" onClick={closeProfile} aria-label="閉じる">×</button>

        <div className="profile-hero">
          <span className="avatar-xxl" aria-hidden>{stamp.label}</span>
          <div className="profile-hero-info">
            <div className="profile-name">{user.nickname}</div>
            {user.userId && <div className="profile-handle">@{user.userId}</div>}
            <div className="profile-meta">
              <span className="role-tag">{ROLE_LABELS[user.role]}</span>
              <span className="friend-tag">{teamLabel}</span>
            </div>
          </div>
        </div>

        {!isMe && (
          <div className="profile-action">
            {isFriend ? (
              <span className="friend-tag">フレンド</span>
            ) : outgoingPending ? (
              <span className="friend-tag">申請中</span>
            ) : incomingPending ? (
              <span className="friend-tag">承認待ち</span>
            ) : (
              <button
                type="button"
                className="small-btn filled"
                onClick={handleSendRequest}
              >
                フレンド申請
              </button>
            )}
          </div>
        )}

        {isPlayer && (
          <dl className="stat-list">
            <div className="stat-row">
              <dt>1日の目標</dt>
              <dd>{user.dailyGoal}回</dd>
            </div>
            <div className="stat-row">
              <dt>連続達成</dt>
              <dd>{streak}日</dd>
            </div>
            <div className="stat-row">
              <dt>累計達成日数</dt>
              <dd>{days}日</dd>
            </div>
            <div className="stat-row">
              <dt>スイングドラゴン</dt>
              <dd>Lv.{level}</dd>
            </div>
          </dl>
        )}

        {user.role === ROLES.COACH && user.advice && (
          <div className="advice-preview">
            <div className="advice-name">一言アドバイス</div>
            <div className="advice-text">{user.advice}</div>
          </div>
        )}

        <div className="profile-section">
          <div className="card-title">最近のアクティビティ</div>
          {userActivities.length === 0 ? (
            <div className="empty-txt">まだアクティビティはありません</div>
          ) : (
            <div className="activity-list">
              {userActivities.map((a) => (
                <ActivityItem
                  key={a.id}
                  activity={a}
                  currentUserId={me.id}
                  onLike={handleLikeActivity}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
