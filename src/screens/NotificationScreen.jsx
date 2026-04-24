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
}

// Request types that have a pending record and show accept/decline buttons.
const ACTIONABLE_TYPES = new Set(['friend_request', 'team_join_request', 'friend_team_request'])

function resolveFriendshipId(n) {
  if (n.requestId) return n.requestId
  // Fallback for older notifications missing requestId
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
  if (!me) return null

  const items = notifications.listByUser(me.id)
  const unread = items.filter((n) => !n.read).length

  const markRead = (id) => notifications.markRead(id)
  const markAllRead = () => notifications.markAllRead(me.id)
  // Like targets the underlying activity (spec: 通知一覧のアクティビティにもいいね可能).
  const toggleActivityLike = (activityId) => activities.toggleLike(activityId, me.id)

  const handleAccept = (n) => {
    if (n.type === 'friend_request') acceptFriendRequest(resolveFriendshipId(n))
    else if (n.type === 'team_join_request') acceptTeamJoinRequest(n.requestId)
    else if (n.type === 'friend_team_request') acceptFriendTeamRequest(n.requestId)
    notifications.markRead(n.id)
  }

  const handleDecline = (n) => {
    if (n.type === 'friend_request') declineFriendRequest(resolveFriendshipId(n))
    else if (n.type === 'team_join_request') declineTeamJoinRequest(n.requestId)
    else if (n.type === 'friend_team_request') declineFriendTeamRequest(n.requestId)
    notifications.markRead(n.id)
  }

  return (
    <div className="screen">
      <h1 className="screen-title">
        通知
        {unread > 0 && <span className="unread-pill">{unread}</span>}
      </h1>

      {items.length > 0 && unread > 0 && (
        <button className="outline-btn mark-all" onClick={markAllRead}>
          すべて既読にする
        </button>
      )}

      {items.length === 0 ? (
        <section className="info-card">
          <div className="empty-txt">通知はありません</div>
        </section>
      ) : (
        <ul className="notif-list">
          {items.map((n) => {
            const from = n.fromUserId ? users.get(n.fromUserId) : null
            const stamp = from ? getStamp(from.avatarStamp).label : (TYPE_ICON[n.type] || '🔔')
            const activity = n.activityId ? activities.get(n.activityId) : null
            const liked = activity?.likeUserIds?.includes(me.id) ?? false
            const likeCount = activity?.likeUserIds?.length ?? 0
            const actionable = ACTIONABLE_TYPES.has(n.type) && isRequestPending(n)
            return (
              <li
                key={n.id}
                className={`notif-row ${n.read ? '' : 'unread'}`}
                onClick={() => markRead(n.id)}
              >
                <span className="notif-icon" aria-hidden>{stamp}</span>
                <div className="notif-body">
                  <div className="notif-content">{n.content}</div>
                  <div className="notif-time">{relativeTime(n.createdAt)}</div>
                  {actionable && (
                    <div className="notif-actions">
                      <button
                        type="button"
                        className="small-btn filled"
                        onClick={(e) => { e.stopPropagation(); handleAccept(n) }}
                      >
                        承認
                      </button>
                      <button
                        type="button"
                        className="small-btn"
                        onClick={(e) => { e.stopPropagation(); handleDecline(n) }}
                      >
                        拒否
                      </button>
                    </div>
                  )}
                </div>
                {activity && (
                  <button
                    type="button"
                    className={`like-btn ${liked ? 'liked' : ''}`}
                    onClick={(e) => { e.stopPropagation(); toggleActivityLike(activity.id) }}
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
