import { useEffect, useRef } from 'react'
import { useProfile } from '../hooks/useProfile.jsx'
import { users, teams, friendships, missions, activities } from '../storage/storage.js'
import { ROLES, ROLE_LABELS } from '../storage/schema.js'
import { getStamp } from '../storage/stamps.js'
import { countAchievementDays, computeStreak } from '../lib/date.js'
import { levelFromDays, stageLabel } from '../lib/dragon.js'
import { sendFriendRequest } from '../lib/events.js'
import ActivityItem from './ActivityItem.jsx'

export default function ProfileModal() {
  const { viewUserId, closeProfile } = useProfile()
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
  const user = users.get(viewUserId)
  if (!user) return null

  const isMe = user.id === me.id
  const stamp = getStamp(user.avatarStamp)
  const team = teams.findByMember(user.id)
  const isPlayer = user.role === ROLES.PLAYER

  const userMissions = isPlayer ? missions.listByUser(user.id) : []
  const days = countAchievementDays(userMissions)
  const streak = computeStreak(userMissions)
  const level = levelFromDays(days)

  const userActivities = activities.listByUsers([user.id]).slice(0, 10)

  const relation = !isMe
    ? friendships
        .list()
        .find(
          (f) =>
            (f.fromUserId === me.id && f.toUserId === user.id) ||
            (f.fromUserId === user.id && f.toUserId === me.id),
        )
    : null
  const isFriend = relation?.status === 'accepted'
  const outgoingPending = relation?.status === 'pending' && relation.fromUserId === me.id
  const incomingPending = relation?.status === 'pending' && relation.toUserId === me.id

  const handleLikeActivity = (id) => activities.toggleLike(id, me.id)

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
            <div className="profile-meta">
              <span className="role-tag">{ROLE_LABELS[user.role]}</span>
              {team && <span className="friend-tag">{team.name}</span>}
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
                onClick={() => sendFriendRequest(me.id, user.id)}
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
              <dd>Lv.{level} <span className="dragon-stage">{stageLabel(level)}</span></dd>
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
