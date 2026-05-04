import { users, notifications, friendships, activities, teamRequests } from '../storage/storage.js'
import { getStamp } from '../storage/stamps.js'
import { relativeTime } from '../lib/time.js'
import {
  acceptFriendRequest,
  declineFriendRequest,
  acceptTeamJoinRequest,
  declineTeamJoinRequest,
  acceptFriendTeamRequest,
  declineFriendTeamRequest,
} from '../lib/events.js'
import {
  markReadFsNotification,
  markAllReadFsNotifications,
  toggleLikeFsNotification,
} from '../lib/firestoreNotifications.js'
import {
  acceptFsTeamRequest,
  declineFsTeamRequest,
} from '../lib/firestoreTeamRequests.js'
import {
  acceptFriendRequestFs,
  declineFriendRequestFs,
} from '../lib/firestoreFriends.js'
import { useState } from 'react'
import { useProfile } from '../hooks/useProfile.jsx'
import { useFirestoreFriends } from '../hooks/useFirestoreFriends.jsx'
import { useFirestoreNotifications } from '../hooks/useFirestoreNotifications.jsx'
import EmptyState from '../components/EmptyState.jsx'

const TYPE_ICON = {
  swing_complete: '⚾',
  streak_milestone: '🔥',
  like: '♥',
  friend_request: '👥',
  friend_accepted: '✅',
  team_invite: '📣',
  team_join_request: '🙋',
  friend_team_request: '🤝',
  goal_raised: '📈',
  mvp_selected: '🏆',
  goal_reminder: '⏰',
  trial_request: '📋',
}

const ACTIONABLE_TYPES = new Set(['friend_request', 'team_join_request', 'friend_team_request'])
// いいねボタンを出さない通知タイプ（自分宛 like、自分宛アクション要求、リマインダー等）
const NO_LIKE_TYPES = new Set([
  'like',
  'friend_request',
  'friend_accepted',
  'team_invite',
  'team_join_request',
  'friend_team_request',
  'goal_reminder',
  'trial_request',
])

function resolveFriendshipId(n) {
  if (n.requestId) return n.requestId
  const f = friendships
    .list()
    .find((x) => x.fromUserId === n.fromUserId && x.toUserId === n.userId && x.status === 'pending')
  return f?.id ?? null
}

function isRequestPending(n) {
  if (n.type === 'friend_request') {
    const id = resolveFriendshipId(n)
    if (!id) return false
    const f = friendships.get(id)
    return !!f && f.status === 'pending'
  }
  if (n.type === 'team_join_request' || n.type === 'friend_team_request') {
    const r = n.requestId ? teamRequests.get(n.requestId) : null
    return !!r && r.status === 'pending'
  }
  return false
}

export default function NotificationScreen() {
  const me = users.getCurrent()
  const { openProfile } = useProfile()
  const { allUsers } = useFirestoreFriends()
  const { items: fsItems, myUid } = useFirestoreNotifications()
  // 既に承認/拒否ボタンを押した通知 ID（楽観的に二重操作を防ぐ）
  const [processedNotifIds, setProcessedNotifIds] = useState(() => new Set())
  // 処理中（API 完了待ち）の通知 ID — ボタンを disabled にする用
  const [pendingNotifIds, setPendingNotifIds] = useState(() => new Set())
  if (!me) return null

  const markProcessed = (id) => {
    setProcessedNotifIds((prev) => new Set(prev).add(id))
  }
  const markPending = (id, on) => {
    setPendingNotifIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  // localStorage の通知（source 識別用に local を付与）
  const localItems = notifications
    .listByUser(me.id)
    .map((n) => ({ ...n, source: 'local' }))
  // FS items are already shaped with source: 'fs' by the subscriber.
  const merged = [...fsItems, ...localItems]
  merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const unread = merged.filter((n) => !n.read).length

  const lookupFrom = (fromUserId) => {
    if (!fromUserId) return null
    const local = users.get(fromUserId)
    if (local) return { id: local.id, nickname: local.nickname, avatarStamp: local.avatarStamp }
    const fs = allUsers?.find((u) => u.uid === fromUserId)
    if (fs) return { id: fs.uid, nickname: fs.nickname, avatarStamp: fs.avatarStamp }
    return null
  }

  const markRead = (n) => {
    if (n.source === 'fs') markReadFsNotification(n.id)
    else notifications.markRead(n.id)
  }

  const markAllRead = () => {
    notifications.markAllRead(me.id)
    if (myUid) markAllReadFsNotifications(myUid)
  }

  const toggleActivityLike = (activityId) => activities.toggleLike(activityId, me.id)
  const toggleFsLike = (notifId) => toggleLikeFsNotification(notifId, myUid)

  const handleAccept = async (n) => {
    if (processedNotifIds.has(n.id) || pendingNotifIds.has(n.id)) return
    console.log('[notif] accept clicked', { type: n.type, source: n.source, requestId: n.requestId })
    markPending(n.id, true)
    try {
      if (n.source === 'fs') {
        if (n.type === 'friend_request' && n.requestId) {
          await acceptFriendRequestFs(n.requestId)
        } else if (n.type === 'team_join_request' || n.type === 'friend_team_request') {
          if (!n.requestId) {
            alert('この申請には requestId がありません（古い通知の可能性）。再度申請してもらってください。')
            return
          }
          await acceptFsTeamRequest(n.requestId)
        }
      } else {
        if (n.type === 'friend_request') acceptFriendRequest(resolveFriendshipId(n))
        else if (n.type === 'team_join_request') acceptTeamJoinRequest(n.requestId)
        else if (n.type === 'friend_team_request') acceptFriendTeamRequest(n.requestId)
      }
      markRead(n)
      markProcessed(n.id)
    } catch (e) {
      console.error('[notif] accept failed', e)
      alert(`承認に失敗しました: ${e?.message || e}`)
    } finally {
      markPending(n.id, false)
    }
  }

  const handleDecline = async (n) => {
    if (processedNotifIds.has(n.id) || pendingNotifIds.has(n.id)) return
    console.log('[notif] decline clicked', { type: n.type, source: n.source, requestId: n.requestId })
    markPending(n.id, true)
    try {
      if (n.source === 'fs') {
        if (n.type === 'friend_request' && n.requestId) {
          await declineFriendRequestFs(n.requestId)
        } else if (n.type === 'team_join_request' || n.type === 'friend_team_request') {
          if (n.requestId) await declineFsTeamRequest(n.requestId)
        }
      } else {
        if (n.type === 'friend_request') declineFriendRequest(resolveFriendshipId(n))
        else if (n.type === 'team_join_request') declineTeamJoinRequest(n.requestId)
        else if (n.type === 'friend_team_request') declineFriendTeamRequest(n.requestId)
      }
      markRead(n)
      markProcessed(n.id)
    } catch (e) {
      console.error('[notif] decline failed', e)
      alert(`拒否に失敗しました: ${e?.message || e}`)
    } finally {
      markPending(n.id, false)
    }
  }

  return (
    <div className="screen">
      <h1 className="screen-title">
        通知
        {unread > 0 && <span className="unread-pill">{unread}</span>}
      </h1>

      {merged.length > 0 && unread > 0 && (
        <button className="outline-btn mark-all" onClick={markAllRead}>
          すべて既読にする
        </button>
      )}

      {merged.length === 0 ? (
        <section className="info-card">
          <EmptyState
            icon="🔔"
            title="通知はありません"
            description="フレンドの達成やお知らせがここに届きます"
          />
        </section>
      ) : (
        <ul className="notif-list">
          {merged.map((n) => {
            const from = lookupFrom(n.fromUserId)
            const stamp = from ? getStamp(from.avatarStamp).label : (TYPE_ICON[n.type] || '🔔')
            const activity =
              n.source === 'local' && n.activityId ? activities.get(n.activityId) : null
            const liked =
              n.source === 'fs'
                ? n.likeUserIds?.includes(myUid)
                : activity?.likeUserIds?.includes(me.id) ?? false
            const likeCount =
              n.source === 'fs' ? n.likeUserIds?.length ?? 0 : activity?.likeUserIds?.length ?? 0
            // FS 通知は requestId があれば actionable とする（pending 状態は accept 側で確認）
            // 既に処理済み（承認・拒否押下後）はボタン非表示
            const isProcessed = processedNotifIds.has(n.id)
            const isPending = pendingNotifIds.has(n.id)
            const actionable =
              !isProcessed &&
              ACTIONABLE_TYPES.has(n.type) &&
              (n.source === 'fs'
                ? !!n.requestId
                : isRequestPending(n))
            // いいね通知・申請系・リマインダー等にはいいねボタンを出さない
            const showLike = (n.source === 'fs' || !!activity) && !NO_LIKE_TYPES.has(n.type)
            return (
              <li
                key={`${n.source}-${n.id}`}
                className={`notif-row ${n.read ? '' : 'unread'} ${from ? 'clickable' : ''}`}
                onClick={() => {
                  markRead(n)
                  if (from) openProfile(from.id)
                }}
              >
                {from ? (
                  <button
                    type="button"
                    className="notif-icon-btn"
                    onClick={(e) => { e.stopPropagation(); openProfile(from.id) }}
                    aria-label={`${from.nickname}のプロフィール`}
                  >
                    <span className="notif-icon" aria-hidden>{stamp}</span>
                  </button>
                ) : (
                  <span className="notif-icon" aria-hidden>{stamp}</span>
                )}
                <div className="notif-body">
                  <div className="notif-content">{n.content}</div>
                  <div className="notif-time">{relativeTime(n.createdAt)}</div>
                  {actionable && (
                    <div className="notif-actions">
                      <button
                        type="button"
                        className="small-btn filled"
                        disabled={isPending}
                        onClick={(e) => { e.stopPropagation(); handleAccept(n) }}
                      >
                        {isPending ? '処理中…' : '承認'}
                      </button>
                      <button
                        type="button"
                        className="small-btn"
                        disabled={isPending}
                        onClick={(e) => { e.stopPropagation(); handleDecline(n) }}
                      >
                        {isPending ? '処理中…' : '拒否'}
                      </button>
                    </div>
                  )}
                </div>
                {showLike && (
                  <button
                    type="button"
                    className={`like-btn ${liked ? 'liked' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (n.source === 'fs') toggleFsLike(n.id)
                      else if (activity) toggleActivityLike(activity.id)
                    }}
                    aria-pressed={liked}
                    aria-label="いいね"
                  >
                    <span className="like-icon" aria-hidden>{liked ? '♥' : '♡'}</span>
                    {likeCount > 0 && <span className="like-count">{likeCount}</span>}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
