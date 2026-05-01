import { useState } from 'react'
import { users, friendships, teams, activities } from '../storage/storage.js'
import { getStamp } from '../storage/stamps.js'
import { sendFriendRequest } from '../lib/events.js'
import { matchesJa } from '../lib/kana.js'
import {
  sendFriendRequestFs,
  acceptFriendRequestFs,
  declineFriendRequestFs,
} from '../lib/firestoreFriends.js'
import ActivityItem from '../components/ActivityItem.jsx'
import SearchBox from '../components/SearchBox.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { useProfile } from '../hooks/useProfile.jsx'
import { useFirestoreFriends } from '../hooks/useFirestoreFriends.jsx'
import { useFirestoreTeams } from '../hooks/useFirestoreTeams.jsx'
import { useFirestoreActivities } from '../hooks/useFirestoreActivities.jsx'
import { toggleFsActivityLike } from '../lib/firestoreActivities.js'

export default function FriendsScreen() {
  const me = users.getCurrent()
  const { openProfile } = useProfile()
  const { myUid, friendships: fsFriendships, usersByUid, allUsers } = useFirestoreFriends()
  const { allFsTeams } = useFirestoreTeams()
  const { activities: allFsActivities } = useFirestoreActivities()
  const [query, setQuery] = useState('')
  if (!me) return null

  // ----- Mock (localStorage) state -----
  const friendIds = friendships.acceptedFriendIds(me.id)
  const friends = friendIds.map((id) => users.get(id)).filter(Boolean)
  const allTeams = teams.list()

  // ----- Firestore-backed state -----
  const fsIncoming = fsFriendships.filter((f) => f.status === 'pending' && f.toUid === myUid)
  const fsOutgoing = fsFriendships.filter((f) => f.status === 'pending' && f.fromUid === myUid)
  const fsAccepted = fsFriendships.filter((f) => f.status === 'accepted')
  const fsAcceptedFriends = fsAccepted
    .map((f) => {
      const otherUid = f.participants?.find((p) => p !== myUid)
      return otherUid ? usersByUid[otherUid] : null
    })
    .filter(Boolean)

  // Helper: is there a pending/accepted Firestore relation with this remote uid?
  const fsRelationWith = (uid) =>
    fsFriendships.find((f) => f.participants?.includes(uid))

  // ----- Search -----
  const q = query.trim()
  const qLower = q.toLowerCase()
  const localResults = q
    ? users.list().filter((u) => {
        if (u.id === me.id) return false
        if (matchesJa(u.nickname, q)) return true
        if (u.userId && u.userId.toLowerCase().includes(qLower)) return true
        const userTeam = allTeams.find((t) => t.memberIds?.includes(u.id))
        return userTeam ? matchesJa(userTeam.name, q) : false
      })
    : []
  const remoteResults = q
    ? allUsers.filter((u) => {
        if (!u.uid || u.uid === myUid) return false
        if (matchesJa(u.nickname || '', q)) return true
        if (u.userId && u.userId.toLowerCase().includes(qLower)) return true
        // 所属チーム名（自由記述 or FS チームの正式名）でも検索ヒット
        if (u.teamName && matchesJa(u.teamName, q)) return true
        const fsTeam = (allFsTeams || []).find((t) => (t.memberIds || []).includes(u.uid))
        if (fsTeam) {
          if (matchesJa(fsTeam.name || '', q)) return true
          if (fsTeam.handle && fsTeam.handle.toLowerCase().includes(qLower)) return true
        }
        return false
      })
    : []

  const localFeed = activities.listByUsers(friendIds).map((a) => ({ ...a, source: 'local' }))
  const fsAcceptedFriendUids = fsAccepted
    .map((f) => f.participants?.find((p) => p !== myUid))
    .filter(Boolean)
  const fsFriendActivities = (allFsActivities || []).filter((a) =>
    fsAcceptedFriendUids.includes(a.userId),
  )
  const feed = [...fsFriendActivities, ...localFeed].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  )
  const handleLike = (a) => {
    if (a.source === 'fs') toggleFsActivityLike(a.id, myUid)
    else activities.toggleLike(a.id, me.id)
  }

  const dropdown = q && (
    (localResults.length === 0 && remoteResults.length === 0) ? (
      <div className="search-dropdown-empty">該当するユーザーがいません</div>
    ) : (
      <ul className="search-list">
        {remoteResults.map((u) => {
          const rel = fsRelationWith(u.uid)
          const isFsFriend = rel?.status === 'accepted'
          const isOutgoing = rel?.status === 'pending' && rel.fromUid === myUid
          const isIncoming = rel?.status === 'pending' && rel.toUid === myUid
          return (
            <li key={`fs-${u.uid}`} className="search-row">
              <button
                type="button"
                className="row-link"
                onClick={() => openProfile(u.uid)}
              >
                <span className="activity-stamp" aria-hidden>{getStamp(u.avatarStamp).label}</span>
                <div className="search-info">
                  <div className="activity-name">
                    {u.nickname}
                    {u.userId && <span className="user-handle">@{u.userId}</span>}
                    <span className="real-tag">実ユーザー</span>
                  </div>
                </div>
              </button>
              {isFsFriend ? (
                <span className="friend-tag">フレンド</span>
              ) : isOutgoing ? (
                <span className="friend-tag">申請中</span>
              ) : isIncoming ? (
                <span className="friend-tag">承認待ち</span>
              ) : (
                <button
                  type="button"
                  className="small-btn filled"
                  onClick={() => sendFriendRequestFs(u.uid)}
                >
                  申請
                </button>
              )}
            </li>
          )
        })}
        {localResults.map((u) => {
          const isFriend = friendIds.includes(u.id)
          const relation = friendships
            .list()
            .find(
              (f) =>
                (f.fromUserId === me.id && f.toUserId === u.id) ||
                (f.fromUserId === u.id && f.toUserId === me.id),
            )
          const outgoingPending = relation?.status === 'pending' && relation.fromUserId === me.id
          const incomingPending = relation?.status === 'pending' && relation.toUserId === me.id
          const team = allTeams.find((t) => t.memberIds?.includes(u.id))
          return (
            <li key={u.id} className="search-row">
              <button
                type="button"
                className="row-link"
                onClick={() => openProfile(u.id)}
              >
                <span className="activity-stamp" aria-hidden>{getStamp(u.avatarStamp).label}</span>
                <div className="search-info">
                  <div className="activity-name">
                    {u.nickname}
                    {u.userId && <span className="user-handle">@{u.userId}</span>}
                  </div>
                  {team && <div className="search-sub">{team.name}</div>}
                </div>
              </button>
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
                  onClick={() => sendFriendRequest(me.id, u.id)}
                >
                  申請
                </button>
              )}
            </li>
          )
        })}
      </ul>
    )
  )

  return (
    <div className="screen">
      <h1 className="screen-title">友達</h1>

      <SearchBox
        value={query}
        onChange={setQuery}
        placeholder="名前やチーム名で検索"
        dropdown={dropdown}
      />

      {fsIncoming.length > 0 && (
        <section className="info-card">
          <div className="card-title">実ユーザーからの申請（{fsIncoming.length}）</div>
          <ul className="search-list">
            {fsIncoming.map((f) => {
              const u = usersByUid[f.fromUid]
              return (
                <li key={f.id} className="search-row">
                  <button
                    type="button"
                    className="row-link"
                    onClick={() => openProfile(f.fromUid)}
                  >
                    <span className="activity-stamp" aria-hidden>
                      {getStamp(u?.avatarStamp).label}
                    </span>
                    <div className="search-info">
                      <div className="activity-name">{u?.nickname ?? f.fromUid.slice(0, 6)}</div>
                      <div className="search-sub">フレンド申請が届いています</div>
                    </div>
                  </button>
                  <div className="notif-actions">
                    <button
                      type="button"
                      className="small-btn filled"
                      onClick={() => acceptFriendRequestFs(f.id)}
                    >
                      承認
                    </button>
                    <button
                      type="button"
                      className="small-btn"
                      onClick={() => declineFriendRequestFs(f.id)}
                    >
                      拒否
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {fsOutgoing.length > 0 && (
        <section className="info-card">
          <div className="card-title">申請中（{fsOutgoing.length}）</div>
          <ul className="friend-chips">
            {fsOutgoing.map((f) => {
              const u = usersByUid[f.toUid]
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    className="friend-chip"
                    onClick={() => openProfile(f.toUid)}
                  >
                    <span className="activity-stamp" aria-hidden>{getStamp(u?.avatarStamp).label}</span>
                    <span className="activity-name">{u?.nickname ?? f.toUid.slice(0, 6)}</span>
                    <span className="friend-tag">送信済み</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="info-card">
        <div className="card-title">フレンド（{friends.length + fsAcceptedFriends.length}）</div>
        {friends.length === 0 && fsAcceptedFriends.length === 0 ? (
          <EmptyState
            icon="👥"
            title="まだフレンドがいません"
            description="検索ボックスから名前やチーム名で探してみよう！"
          />
        ) : (
          <ul className="friend-chips">
            {fsAcceptedFriends.map((f) => (
              <li key={`fs-${f.uid}`}>
                <button
                  type="button"
                  className="friend-chip"
                  onClick={() => openProfile(f.uid)}
                >
                  <span className="activity-stamp" aria-hidden>{getStamp(f.avatarStamp).label}</span>
                  <span className="activity-name">{f.nickname}</span>
                  <span className="real-tag">実</span>
                </button>
              </li>
            ))}
            {friends.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  className="friend-chip"
                  onClick={() => openProfile(f.id)}
                >
                  <span className="activity-stamp" aria-hidden>{getStamp(f.avatarStamp).label}</span>
                  <span className="activity-name">{f.nickname}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="info-card">
        <div className="card-title">フレンドのアクティビティ</div>
        {feed.length === 0 ? (
          <EmptyState
            icon="✨"
            title="アクティビティはまだありません"
            description="フレンドが素振りを達成するとここに表示されます"
          />
        ) : (
          <div className="activity-list">
            {feed.map((a) => (
              <ActivityItem key={a.id} activity={a} currentUserId={me.id} onLike={handleLike} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
