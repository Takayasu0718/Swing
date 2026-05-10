import { users, notifications, friendships, activities, teamRequests, useStoreVersion } from '../storage/storage.js'
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
  markProcessedFsNotification,
  toggleLikeFsNotification,
  deleteFsNotification,
} from '../lib/firestoreNotifications.js'
import {
  acceptFsTeamRequest,
  declineFsTeamRequest,
} from '../lib/firestoreTeamRequests.js'
import {
  acceptFriendRequestFs,
  declineFriendRequestFs,
} from '../lib/firestoreFriends.js'
import { useEffect, useState } from 'react'
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

const KEEP_LIMIT = 10

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

// 通知配列を行配列に畳む。同一 likeTargetKey の type='like' 通知は 1 行に集約。
// 戻り値の各要素は { kind: 'single', item } か { kind: 'like-group', key, items }。
// items は createdAt 降順、グループの代表 createdAt は最新メンバーのもの。
function buildRows(merged) {
  const rows = []
  const groupIndex = new Map() // likeTargetKey -> row index
  for (const n of merged) {
    if (n.type === 'like' && n.likeTargetKey) {
      const idx = groupIndex.get(n.likeTargetKey)
      if (idx == null) {
        rows.push({ kind: 'like-group', key: n.likeTargetKey, items: [n] })
        groupIndex.set(n.likeTargetKey, rows.length - 1)
      } else {
        rows[idx].items.push(n)
      }
    } else {
      rows.push({ kind: 'single', item: n })
    }
  }
  return rows
}

function rowCreatedAt(row) {
  return row.kind === 'single' ? row.item.createdAt : row.items[0].createdAt
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
  // 「他N名」展開中の like グループ key
  const [expandedGroupKeys, setExpandedGroupKeys] = useState(() => new Set())
  // ローカルストレージの変更を購読し、削除後に再レンダリングを誘発する
  const storeVersion = useStoreVersion()

  // localStorage の通知（source 識別用に local を付与）
  const localItems = me
    ? notifications.listByUser(me.id).map((n) => ({ ...n, source: 'local' }))
    : []
  // FS items are already shaped with source: 'fs' by the subscriber.
  const merged = [...fsItems, ...localItems]
  merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const unread = merged.filter((n) => !n.read).length
  // 行単位で集約してから直近 KEEP_LIMIT 行のみ表示
  const allRows = buildRows(merged)
  allRows.sort((a, b) => (rowCreatedAt(a) < rowCreatedAt(b) ? 1 : -1))
  const visibleRows = allRows.slice(0, KEEP_LIMIT)

  // 直近 KEEP_LIMIT 行に含まれない通知 ID は FS / local 双方から削除する。
  // like グループは構成メンバー全てを保持対象に含める（残しているグループの
  // liker 一覧を維持するため）。
  // 依存配列: fsItems（FS 購読の差分）と storeVersion（ローカル更新の差分）。
  // 削除後は購読・bump で再レンダリングされ自然収束する。
  useEffect(() => {
    if (!me || !myUid) return
    if (allRows.length <= KEEP_LIMIT) return
    const keepKeys = new Set()
    for (const row of visibleRows) {
      const items = row.kind === 'single' ? [row.item] : row.items
      for (const n of items) keepKeys.add(`${n.source}-${n.id}`)
    }
    for (const n of fsItems) {
      if (!keepKeys.has(`fs-${n.id}`)) deleteFsNotification(n.id)
    }
    for (const n of localItems) {
      if (!keepKeys.has(`local-${n.id}`)) notifications.delete(n.id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fsItems, storeVersion, myUid, me?.id])

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
        // 通知ドキュメントに processed を立てる（再マウント後もボタン非表示を維持）
        await markProcessedFsNotification(n.id)
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

  const toggleExpandGroup = (key) => {
    setExpandedGroupKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // like グループ行: 同一 likeTargetKey の type='like' 通知をまとめて 1 行に表示。
  // liker は uid で dedupe（同一ユーザーの toggle 連打を 1 名にまとめる）し、
  // 各 uid の最新通知をエントリとして採用。
  const renderLikeGroup = (row) => {
    // items は merged 由来で createdAt 降順。先に来たものが最新。
    const seen = new Set()
    const uniqueLikers = []
    for (const n of row.items) {
      const uid = n.fromUserId
      if (!uid || seen.has(uid)) continue
      seen.add(uid)
      const from = lookupFrom(uid)
      const nickname = from?.nickname || n.fromUserNickname || '誰か'
      uniqueLikers.push({ uid, nickname, avatarStamp: from?.avatarStamp, profileId: from?.id })
    }
    if (uniqueLikers.length === 0) return null
    const latest = uniqueLikers[0]
    const stampImg = latest.avatarStamp ? getStamp(latest.avatarStamp).image : null
    const stampEmoji = stampImg ? '' : (TYPE_ICON.like || '♥')
    const others = uniqueLikers.length - 1
    const expanded = expandedGroupKeys.has(row.key)
    const isUnread = row.items.some((n) => !n.read)
    const latestCreatedAt = row.items[0].createdAt

    const markRowRead = () => {
      for (const n of row.items) {
        if (!n.read) markRead(n)
      }
    }
    const onRowClick = () => {
      markRowRead()
      if (latest.profileId) openProfile(latest.profileId)
    }
    return (
      <li
        key={`like-group-${row.key}`}
        className={`notif-row ${isUnread ? 'unread' : ''} clickable`}
        onClick={onRowClick}
      >
        {latest.profileId ? (
          <button
            type="button"
            className="notif-icon-btn"
            onClick={(e) => { e.stopPropagation(); openProfile(latest.profileId) }}
            aria-label={`${latest.nickname}のプロフィール`}
          >
            <span className="notif-icon" aria-hidden>
              {stampImg ? <img src={stampImg} alt="" /> : stampEmoji}
            </span>
          </button>
        ) : (
          <span className="notif-icon" aria-hidden>{stampEmoji}</span>
        )}
        <div className="notif-body">
          <div className="notif-content">
            {others === 0 ? (
              <>{latest.nickname}さんがいいねをくれました</>
            ) : (
              <>
                {latest.nickname}さん
                <button
                  type="button"
                  className="like-others-btn"
                  onClick={(e) => { e.stopPropagation(); toggleExpandGroup(row.key) }}
                  aria-expanded={expanded}
                >
                  他{others}名
                </button>
                がいいねをくれました
              </>
            )}
          </div>
          {expanded && others > 0 && (
            <ul className="like-others-list">
              {uniqueLikers.map((u) => (
                <li key={u.uid}>
                  <button
                    type="button"
                    className="like-others-item"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (u.profileId) openProfile(u.profileId)
                    }}
                  >
                    {u.nickname}さん
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="notif-time">{relativeTime(latestCreatedAt)}</div>
        </div>
      </li>
    )
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
        await markProcessedFsNotification(n.id)
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

      {visibleRows.length > 0 && unread > 0 && (
        <button className="outline-btn mark-all" onClick={markAllRead}>
          すべて既読にする
        </button>
      )}

      {visibleRows.length === 0 ? (
        <section className="info-card">
          <EmptyState
            icon="🔔"
            title="通知はありません"
            description="フレンドの達成やお知らせがここに届きます"
          />
        </section>
      ) : (
        <ul className="notif-list">
          {visibleRows.map((row) => {
            if (row.kind === 'like-group') {
              return renderLikeGroup(row)
            }
            const n = row.item
            const from = lookupFrom(n.fromUserId)
            const stampImg = from ? getStamp(from.avatarStamp).image : null
            const stampEmoji = from ? '' : (TYPE_ICON[n.type] || '🔔')
            const activity =
              n.source === 'local' && n.activityId ? activities.get(n.activityId) : null
            const liked =
              n.source === 'fs'
                ? n.likeUserIds?.includes(myUid)
                : activity?.likeUserIds?.includes(me.id) ?? false
            const likeCount =
              n.source === 'fs' ? n.likeUserIds?.length ?? 0 : activity?.likeUserIds?.length ?? 0
            // FS 通知は requestId があり processed フラグが立っていなければ actionable。
            // processed は承認/拒否完了後に通知ドキュメントへ書き込まれるため再マウント後も
            // 復活しない。ローカル state (isProcessed) は楽観的 UI 用のフォールバック。
            const isProcessed = processedNotifIds.has(n.id)
            const isPending = pendingNotifIds.has(n.id)
            const actionable =
              !isProcessed &&
              ACTIONABLE_TYPES.has(n.type) &&
              (n.source === 'fs'
                ? !!n.requestId && !n.processed
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
                    <span className="notif-icon" aria-hidden>
                      {stampImg ? <img src={stampImg} alt="" /> : stampEmoji}
                    </span>
                  </button>
                ) : (
                  <span className="notif-icon" aria-hidden>{stampEmoji}</span>
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
