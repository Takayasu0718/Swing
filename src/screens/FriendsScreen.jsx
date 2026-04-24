import { useState } from 'react'
import { users, friendships, teams, activities } from '../storage/storage.js'
import { getStamp } from '../storage/stamps.js'
import { sendFriendRequest } from '../lib/events.js'
import { matchesJa } from '../lib/kana.js'
import ActivityItem from '../components/ActivityItem.jsx'
import SearchBox from '../components/SearchBox.jsx'

export default function FriendsScreen() {
  const me = users.getCurrent()
  const [query, setQuery] = useState('')
  if (!me) return null

  const friendIds = friendships.acceptedFriendIds(me.id)
  const friends = friendIds.map((id) => users.get(id)).filter(Boolean)

  const allTeams = teams.list()
  const q = query.trim()
  const searchResults = q
    ? users.list().filter((u) => {
        if (u.id === me.id) return false
        if (matchesJa(u.nickname, q)) return true
        const userTeam = allTeams.find((t) => t.memberIds?.includes(u.id))
        return userTeam ? matchesJa(userTeam.name, q) : false
      })
    : []

  const feed = activities.listByUsers(friendIds)

  const handleLike = (activityId) => {
    activities.toggleLike(activityId, me.id)
  }

  const dropdown = q && (
    searchResults.length === 0 ? (
      <div className="search-dropdown-empty">該当するユーザーがいません</div>
    ) : (
      <ul className="search-list">
        {searchResults.map((u) => {
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
              <span className="activity-stamp" aria-hidden>{getStamp(u.avatarStamp).label}</span>
              <div className="search-info">
                <div className="activity-name">{u.nickname}</div>
                {team && <div className="search-sub">{team.name}</div>}
              </div>
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

      <section className="info-card">
        <div className="card-title">フレンド（{friends.length}）</div>
        {friends.length === 0 ? (
          <div className="empty-txt">まだフレンドがいません</div>
        ) : (
          <ul className="friend-chips">
            {friends.map((f) => (
              <li key={f.id} className="friend-chip">
                <span className="activity-stamp" aria-hidden>{getStamp(f.avatarStamp).label}</span>
                <span className="activity-name">{f.nickname}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="info-card">
        <div className="card-title">フレンドのアクティビティ</div>
        {feed.length === 0 ? (
          <div className="empty-txt">フレンドのアクティビティはまだありません</div>
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
