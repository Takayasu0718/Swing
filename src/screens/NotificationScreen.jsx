import { users, notifications, friendships } from '../storage/storage.js'
import { getStamp } from '../storage/stamps.js'
import { relativeTime } from '../lib/time.js'

const TYPE_ICON = {
  swing_complete: '⚾',
  streak_10: '🔥',
  like: '♥',
  friend_request: '👥',
  friend_accepted: '✅',
  team_invite: '📣',
  friend_team_request: '🤝',
  goal_raised: '📈',
}

export default function NotificationScreen() {
  const me = users.getCurrent()
  if (!me) return null

  const items = notifications.listByUser(me.id)
  const unread = items.filter((n) => !n.read).length

  const markRead = (id) => notifications.markRead(id)
  const markAllRead = () => notifications.markAllRead(me.id)
  const toggleLike = (id) => notifications.toggleLike(id, me.id)

  const acceptFriend = (n) => {
    // Find the friendship record and accept it
    const pending = friendships
      .list()
      .find((f) => f.status === 'pending' && f.fromUserId === n.fromUserId && f.toUserId === me.id)
    if (pending) friendships.accept(pending.id)
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
            const liked = n.likeUserIds?.includes(me.id)
            const likeCount = n.likeUserIds?.length || 0
            const isFriendRequest = n.type === 'friend_request'
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
                  {isFriendRequest && !n.read && (
                    <button
                      type="button"
                      className="small-btn filled"
                      onClick={(e) => { e.stopPropagation(); acceptFriend(n) }}
                    >
                      承認
                    </button>
                  )}
                </div>
                {n.activityId && (
                  <button
                    type="button"
                    className={`like-btn ${liked ? 'liked' : ''}`}
                    onClick={(e) => { e.stopPropagation(); toggleLike(n.id) }}
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
