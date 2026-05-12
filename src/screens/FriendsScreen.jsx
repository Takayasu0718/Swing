import { useEffect, useMemo, useState } from 'react'
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
import { toggleFsActivityLike, fetchRecentActivitiesByUids } from '../lib/firestoreActivities.js'
import { loadFriendRanking } from '../lib/firestoreRanking.js'

const FEED_INITIAL = 15
const FEED_STEP = 15
const FEED_MAX = 30

export default function FriendsScreen() {
  const me = users.getCurrent()
  const { openProfile } = useProfile()
  const { myUid, friendships: fsFriendships, usersByUid, allUsers } = useFirestoreFriends()
  const { allFsTeams } = useFirestoreTeams()
  const [query, setQuery] = useState('')
  // フレンドフィード state（onSnapshot は使わず getDocs + startAfter で取得）。
  const [feedFsItems, setFeedFsItems] = useState([])
  const [feedLastDoc, setFeedLastDoc] = useState(null)
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedReachedEnd, setFeedReachedEnd] = useState(false)

  // 受理済みフレンドの uid 一覧。配列参照が render ごとに新規になるので、
  // 安定キー（feedWatchedKey）で副作用の依存に使う。
  const acceptedFsFriendships = fsFriendships.filter((f) => f.status === 'accepted')
  const feedFriendUids = acceptedFsFriendships
    .map((f) => f.participants?.find((p) => p !== myUid))
    .filter(Boolean)
  const feedWatchedKey = useMemo(() => [...feedFriendUids].sort().join(','), [feedFriendUids])

  // フレンドランキング（直近7日 / 素振り合計）。自分 + 受理済みフレンドが対象。
  const [ranking, setRanking] = useState([])
  useEffect(() => {
    if (!myUid) return undefined
    const uids = [myUid, ...feedFriendUids]
    const me = users.getCurrent()
    const profiles = {}
    if (me) {
      profiles[myUid] = { nickname: me.nickname, avatarStamp: me.avatarStamp }
    }
    for (const uid of feedFriendUids) {
      const u = usersByUid[uid]
      if (u) profiles[uid] = { nickname: u.nickname, avatarStamp: u.avatarStamp }
    }
    let cancelled = false
    loadFriendRanking(uids, profiles).then((result) => {
      if (!cancelled) setRanking(result)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myUid, feedWatchedKey])

  // フレンドが変わった / 画面マウント時のみ初回 15 件を 1 回だけ取得。
  // onSnapshot は使わないので、いいね等のリアルタイム反映は楽観的更新で対応。
  useEffect(() => {
    if (!myUid) return
    if (feedFriendUids.length === 0) {
      // フレンドが居ない場合は state を空に戻す（意図的な同期 setState）
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFeedFsItems([])
      setFeedLastDoc(null)
      setFeedReachedEnd(true)
      return
    }
    let cancelled = false
    setFeedLoading(true)
    fetchRecentActivitiesByUids(feedFriendUids, FEED_INITIAL).then(({ items, lastDoc }) => {
      if (cancelled) return
      setFeedFsItems(items)
      setFeedLastDoc(lastDoc)
      setFeedReachedEnd(items.length < FEED_INITIAL)
      setFeedLoading(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedWatchedKey, myUid])

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
  // FS 側は fetchRecentActivitiesByUids で取得した feedFsItems（最大 30 件）を使用。
  // 表示はマージしてソート後、最大 FEED_MAX 件で安全側にキャップ。
  const feed = [...feedFsItems, ...localFeed]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, FEED_MAX)
  // 「もっと見る」表示条件: 30 件未満 / 末尾未到達 / ロード中でない
  const canLoadMore =
    !feedLoading && !feedReachedEnd && feedFsItems.length < FEED_MAX

  const handleLoadMore = async () => {
    if (feedLoading || feedReachedEnd) return
    if (feedFsItems.length >= FEED_MAX) return
    const remaining = FEED_MAX - feedFsItems.length
    const fetchSize = Math.min(FEED_STEP, remaining)
    setFeedLoading(true)
    const { items, lastDoc } = await fetchRecentActivitiesByUids(
      feedFriendUids,
      fetchSize,
      feedLastDoc,
    )
    setFeedFsItems((prev) => [...prev, ...items])
    if (lastDoc) setFeedLastDoc(lastDoc)
    if (items.length < fetchSize) setFeedReachedEnd(true)
    setFeedLoading(false)
  }

  const handleLike = (a) => {
    if (a.source === 'fs') {
      toggleFsActivityLike(a.id, myUid)
      // onSnapshot 不使用のため、いいね状態を楽観的にローカル state へ反映する。
      setFeedFsItems((prev) =>
        prev.map((item) => {
          if (item.id !== a.id) return item
          const liked = (item.likeUserIds || []).includes(myUid)
          return {
            ...item,
            likeUserIds: liked
              ? item.likeUserIds.filter((uid) => uid !== myUid)
              : [...(item.likeUserIds || []), myUid],
          }
        }),
      )
    } else {
      activities.toggleLike(a.id, me.id)
    }
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
                <span className="activity-stamp" aria-hidden><img src={getStamp(u.avatarStamp).image} alt="" /></span>
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
                <span className="activity-stamp" aria-hidden><img src={getStamp(u.avatarStamp).image} alt="" /></span>
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
                      <img src={getStamp(u?.avatarStamp).image} alt="" />
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
                    <span className="activity-stamp" aria-hidden><img src={getStamp(u?.avatarStamp).image} alt="" /></span>
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
        <div className="card-title">フレンドのアクティビティ</div>
        {feed.length === 0 ? (
          <EmptyState
            icon="✨"
            title="アクティビティはまだありません"
            description="フレンドが素振りを達成するとここに表示されます"
          />
        ) : (
          <>
            <div className="activity-list">
              {feed.map((a) => (
                <ActivityItem key={a.id} activity={a} currentUserId={me.id} onLike={handleLike} />
              ))}
            </div>
            {canLoadMore && (
              <button
                type="button"
                className="outline-btn"
                style={{ marginTop: '0.6rem' }}
                onClick={handleLoadMore}
                disabled={feedLoading}
              >
                {feedLoading ? '読み込み中…' : 'もっと見る'}
              </button>
            )}
          </>
        )}
      </section>

      <section className="info-card">
        <div className="card-title">フレンドランキング（直近7日 / 素振り合計）</div>
        {ranking.length === 0 || ranking.every((r) => r.totalSwing === 0) ? (
          <EmptyState
            icon="🏆"
            title="まだランキングデータがありません"
            description="フレンドと一緒に素振りを記録するとここに表示されます"
          />
        ) : (
          <ol className="ranking-list">
            {ranking.map((r, i) => (
              <li
                key={r.uid}
                className={`ranking-row ${r.uid === myUid ? 'me' : ''} clickable`}
                onClick={() => openProfile(r.uid)}
              >
                <span className={`ranking-rank rank-${i + 1}`}>{i + 1}</span>
                <span className="activity-stamp" aria-hidden>
                  <img src={getStamp(r.avatarStamp).image} alt="" />
                </span>
                <span className="ranking-name">{r.nickname}</span>
                <span className="ranking-count">{r.totalSwing}回</span>
              </li>
            ))}
          </ol>
        )}
      </section>

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
                  <span className="activity-stamp" aria-hidden><img src={getStamp(f.avatarStamp).image} alt="" /></span>
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
                  <span className="activity-stamp" aria-hidden><img src={getStamp(f.avatarStamp).image} alt="" /></span>
                  <span className="activity-name">{f.nickname}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
