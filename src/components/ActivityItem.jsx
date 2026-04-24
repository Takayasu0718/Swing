import { users } from '../storage/storage.js'
import { getStamp } from '../storage/stamps.js'
import { relativeTime } from '../lib/time.js'
import { useProfile } from '../hooks/useProfile.jsx'

export default function ActivityItem({ activity, currentUserId, onLike }) {
  const { openProfile } = useProfile()
  const actor = users.get(activity.userId)
  if (!actor) return null
  const stamp = getStamp(actor.avatarStamp)
  const liked = activity.likeUserIds?.includes(currentUserId)
  const likeCount = activity.likeUserIds?.length ?? 0

  return (
    <article className="activity-item">
      <button
        type="button"
        className="activity-author"
        onClick={() => openProfile(actor.id)}
        aria-label={`${actor.nickname}のプロフィール`}
      >
        <span className="activity-stamp" aria-hidden>{stamp.label}</span>
      </button>
      <div className="activity-body">
        <div className="activity-head">
          <button
            type="button"
            className="activity-name-btn"
            onClick={() => openProfile(actor.id)}
          >
            {actor.nickname}
          </button>
          <span className="activity-time">{relativeTime(activity.createdAt)}</span>
        </div>
        <div className="activity-content">{activity.content}</div>
      </div>
      <button
        type="button"
        className={`like-btn ${liked ? 'liked' : ''}`}
        onClick={() => onLike?.(activity.id)}
        aria-pressed={liked}
        aria-label="いいね"
      >
        <span className="like-icon" aria-hidden>{liked ? '♥' : '♡'}</span>
        {likeCount > 0 && <span className="like-count">{likeCount}</span>}
      </button>
    </article>
  )
}
