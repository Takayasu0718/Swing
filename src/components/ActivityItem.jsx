import { users } from '../storage/storage.js'
import { getStamp } from '../storage/stamps.js'
import { relativeTime } from '../lib/time.js'
import { useProfile } from '../hooks/useProfile.jsx'
import { useFirestoreFriends } from '../hooks/useFirestoreFriends.jsx'

export default function ActivityItem({ activity, currentUserId, onLike }) {
  const { openProfile } = useProfile()
  const { allUsers, myUid } = useFirestoreFriends()

  // 投稿者を localStorage または Firestore から解決
  const localActor = users.get(activity.userId)
  const fsActor = !localActor ? (allUsers || []).find((u) => u.uid === activity.userId) : null
  const actor = localActor
    ? localActor
    : fsActor
      ? { id: fsActor.uid, nickname: fsActor.nickname, avatarStamp: fsActor.avatarStamp }
      : null
  if (!actor) return null
  const stamp = getStamp(actor.avatarStamp)

  // FS の活動ではいいね判定に myUid を使う
  const checkId = activity.source === 'fs' ? myUid : currentUserId
  const liked = activity.likeUserIds?.includes(checkId)
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
        onClick={() => onLike?.(activity)}
        aria-pressed={liked}
        aria-label="いいね"
      >
        <span className="like-icon" aria-hidden>{liked ? '♥' : '♡'}</span>
        {likeCount > 0 && <span className="like-count">{likeCount}</span>}
      </button>
    </article>
  )
}
