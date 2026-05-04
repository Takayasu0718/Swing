import { useEffect, useState } from 'react'
import { users, teams, teamRequests, chats, activities, missions } from '../storage/storage.js'
import { getStamp } from '../storage/stamps.js'
import { relativeTime } from '../lib/time.js'
import SearchBox from '../components/SearchBox.jsx'
import ActivityItem from '../components/ActivityItem.jsx'
import {
  onMatchAdded,
  sendTeamJoinRequest,
  sendFriendTeamRequest,
} from '../lib/events.js'
import { matchesJa } from '../lib/kana.js'
import { ACTIVITY_TYPES, ROLES, TEAM_HANDLE_REGEX, TEAM_HANDLE_RULE } from '../storage/schema.js'
import { PREFECTURES, MUNICIPALITIES_BY_PREF, OTHER_OPTION } from '../lib/jpRegions.js'
import { authReady } from '../lib/firebase.js'
import { reserveTeamHandle } from '../lib/firestoreTeamHandle.js'
import { useProfile } from '../hooks/useProfile.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { useFirestoreTeams } from '../hooks/useFirestoreTeams.jsx'
import { useFirestoreFriends } from '../hooks/useFirestoreFriends.jsx'
import { useFirestoreActivities } from '../hooks/useFirestoreActivities.jsx'
import { toggleFsActivityLike } from '../lib/firestoreActivities.js'
import {
  createFsTeam,
  addFsMatch,
  updateFsTeam,
  removeFsTeamMember,
  deleteFsTeam,
} from '../lib/firestoreTeams.js'
import {
  sendFsJoinRequest,
  sendFsFriendTeamRequest,
  acceptFsTeamRequest,
  declineFsTeamRequest,
} from '../lib/firestoreTeamRequests.js'
import { postFsChat, toggleFsChatLike } from '../lib/firestoreChats.js'
import {
  subscribeTrialRequest,
  setTrialRequest,
  deleteTrialRequest,
} from '../lib/firestoreTrialRequests.js'
import { loadFriendRanking } from '../lib/firestoreRanking.js'

function computeTeamRanking(members) {
  const since = Date.now() - 7 * 24 * 3600 * 1000
  return members
    .map((m) => {
      const userMissions = missions.listByUser(m.id).filter((x) => x.completed)
      const last7Sum = userMissions.reduce((sum, mission) => {
        const ts = mission.approvedAt
          ? new Date(mission.approvedAt).getTime()
          : mission.date
            ? new Date(`${mission.date}T12:00:00`).getTime()
            : 0
        return ts >= since ? sum + (mission.goal || 0) : sum
      }, 0)
      return {
        id: m.id,
        nickname: m.nickname,
        avatarStamp: m.avatarStamp,
        totalSwing: last7Sum,
      }
    })
    .sort((a, b) => b.totalSwing - a.totalSwing)
}

export default function TeamScreen() {
  const me = users.getCurrent()
  const { openProfile } = useProfile()
  const {
    myUid,
    myFsTeam,
    allFsTeams,
    incomingRequests,
    outgoingRequests,
    teamChats: fsTeamChats,
    refreshAllTeams,
  } = useFirestoreTeams()
  const { allUsers } = useFirestoreFriends()
  const { activities: allFsActivities } = useFirestoreActivities()
  const [query, setQuery] = useState('')
  const [editingTeam, setEditingTeam] = useState(false)
  const [editingMatchId, setEditingMatchId] = useState(null)
  const [chatInput, setChatInput] = useState('')
  const [creatingTeam, setCreatingTeam] = useState(false)
  const [trialRequest, setTrialRequestState] = useState(null)
  const [editingTrialRequest, setEditingTrialRequest] = useState(false)
  const [fsTeamRanking, setFsTeamRanking] = useState([])
  const [viewingTeamId, setViewingTeamId] = useState(null)
  // 楽観的 UI 用: 送信直後にラウンドトリップを待たず「申請中」を表示
  const [pendingFriendTeamReqs, setPendingFriendTeamReqs] = useState(() => new Set())
  const [pendingJoinReqs, setPendingJoinReqs] = useState(() => new Set())

  // 体験会・助っ人参加のお願いを購読（FS チームのみ）
  useEffect(() => {
    if (!myFsTeam?.id) return
    return subscribeTrialRequest(myFsTeam.id, setTrialRequestState)
  }, [myFsTeam?.id])

  // FS チームのランキング: users/{uid}/activities から直近7日の swing 数を集計
  const fsRankingMemberKey = (myFsTeam?.memberIds || []).join(',')
  useEffect(() => {
    if (!myFsTeam?.id) return
    const memberUids = (myFsTeam.memberIds || []).filter((uid) => {
      const u = (allUsers || []).find((x) => x.uid === uid)
      // 体験ロールは分母から除外。allUsers にまだ載っていない場合は仮に含める。
      return !u || u.role !== ROLES.TRIAL
    })
    const profiles = {}
    for (const uid of memberUids) {
      const u = (allUsers || []).find((x) => x.uid === uid)
      if (u) profiles[uid] = { nickname: u.nickname, avatarStamp: u.avatarStamp }
    }
    let cancelled = false
    loadFriendRanking(memberUids, profiles).then((list) => {
      if (!cancelled) setFsTeamRanking(list)
    })
    return () => {
      cancelled = true
    }
    // allUsers.length をキーに使い、ユーザー一覧読み込み完了で再集計
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myFsTeam?.id, fsRankingMemberKey, allUsers.length])

  // 楽観的 UI: 送信直後に pending Set へ追加し「申請中」表示。失敗時は revert。
  const handleSendFsFriendTeamRequest = (fromTeamId, targetTeamId) => {
    if (!fromTeamId) return
    setPendingFriendTeamReqs((prev) => new Set(prev).add(targetTeamId))
    sendFsFriendTeamRequest(fromTeamId, targetTeamId)
      .then((id) => {
        if (!id) {
          setPendingFriendTeamReqs((prev) => {
            const next = new Set(prev)
            next.delete(targetTeamId)
            return next
          })
        }
      })
      .catch((e) => {
        console.error('[friend-team-request] failed', e)
        setPendingFriendTeamReqs((prev) => {
          const next = new Set(prev)
          next.delete(targetTeamId)
          return next
        })
      })
  }

  const handleSendFsJoinRequest = (targetTeamId) => {
    setPendingJoinReqs((prev) => new Set(prev).add(targetTeamId))
    sendFsJoinRequest(targetTeamId)
      .then((id) => {
        if (!id) {
          setPendingJoinReqs((prev) => {
            const next = new Set(prev)
            next.delete(targetTeamId)
            return next
          })
        }
      })
      .catch((e) => {
        console.error('[join-request] failed', e)
        setPendingJoinReqs((prev) => {
          const next = new Set(prev)
          next.delete(targetTeamId)
          return next
        })
      })
  }

  if (!me) return null

  // Firestore team が存在すればそれを優先、なければ localStorage（mock 用）にフォールバック
  const localTeam = teams.findByMember(me.id)
  const myTeam = myFsTeam || localTeam
  const isFsTeam = !!myFsTeam
  const myMemberId = isFsTeam ? myUid : me.id

  const q = query.trim()
  const qLower = q.toLowerCase()
  const matchesTeam = (t) => {
    if (matchesJa(t.name || '', q)) return true
    if (t.handle && t.handle.toLowerCase().includes(qLower)) return true
    return false
  }
  const localSearchResults = q ? teams.list().filter(matchesTeam) : []
  const fsSearchResults = q ? allFsTeams.filter(matchesTeam) : []

  if (!myTeam) {
    const dropdown = q && (
      (fsSearchResults.length === 0 && localSearchResults.length === 0) ? (
        <div className="search-dropdown-empty">該当するチームがありません</div>
      ) : (
        <ul className="search-list">
          {fsSearchResults.map((t) => {
            const outgoing = outgoingRequests.find(
              (r) => r.kind === 'join' && r.teamId === t.id,
            ) || pendingJoinReqs.has(t.id)
            return (
              <li key={`fs-${t.id}`} className="search-row">
                <div className="search-info">
                  <div className="activity-name">
                    {t.name}
                    {t.handle && <span className="user-handle">@{t.handle}</span>}
                    <span className="real-tag">実チーム</span>
                  </div>
                  <div className="search-sub">{t.description}</div>
                </div>
                {outgoing ? (
                  <span className="friend-tag">申請中</span>
                ) : (
                  <button
                    type="button"
                    className="small-btn filled"
                    onClick={() => handleSendFsJoinRequest(t.id)}
                  >
                    加入申請
                  </button>
                )}
              </li>
            )
          })}
          {localSearchResults.map((t) => {
            const outgoing = teamRequests.findOutgoingJoin(me.id, t.id)
            return (
              <li key={t.id} className="search-row">
                <div className="search-info">
                  <div className="activity-name">
                    {t.name}
                    {t.handle && <span className="user-handle">@{t.handle}</span>}
                  </div>
                  <div className="search-sub">{t.description}</div>
                </div>
                {outgoing ? (
                  <span className="friend-tag">申請中</span>
                ) : (
                  <button
                    type="button"
                    className="small-btn filled"
                    onClick={() => sendTeamJoinRequest(t.id, me.id)}
                  >
                    加入申請
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
        <h1 className="screen-title">チーム</h1>
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="チームを検索"
          dropdown={dropdown}
        />
        {!creatingTeam && (
          <section className="info-card">
            <EmptyState
              icon="⚾"
              title="まだチームに所属していません"
              description="チームを探して加入申請するか、自分のチームを立ち上げよう"
            />
          </section>
        )}
        <CreateTeamCard
          userId={me.id}
          creating={creatingTeam}
          onStart={() => setCreatingTeam(true)}
          onCancel={() => setCreatingTeam(false)}
          onCreate={async (payload) => {
            // Firestore に作成（認証済みなら）。失敗時 / 未認証時は localStorage にフォールバック
            const newId = await createFsTeam({
              name: payload.name,
              description: payload.description,
              prefecture: payload.prefecture,
              municipality: payload.municipality,
              handle: payload.handle,
            })
            if (newId) {
              await refreshAllTeams()
            } else {
              teams.create({
                name: payload.name,
                handle: payload.handle,
                description: payload.description,
                prefecture: payload.prefecture,
                municipality: payload.municipality,
                captainId: me.id,
                memberIds: [me.id],
                friendTeamIds: [],
                nextMatch: null,
                matches: [],
              })
            }
            setCreatingTeam(false)
          }}
        />
      </div>
    )
  }

  // フレンドチームを閲覧中ならそちらの読み取り専用ビューを返す
  if (viewingTeamId) {
    const viewingTeam =
      (allFsTeams || []).find((t) => t.id === viewingTeamId) || teams.get(viewingTeamId)
    if (!viewingTeam) {
      return (
        <div className="screen">
          <button className="outline-btn" onClick={() => setViewingTeamId(null)}>
            ← 自分のチームに戻る
          </button>
          <EmptyState
            icon="🔎"
            title="チームが見つかりません"
            description="削除された可能性があります。"
          />
        </div>
      )
    }
    return (
      <FriendTeamView
        team={viewingTeam}
        allUsers={allUsers || []}
        allFsTeams={allFsTeams || []}
        onBack={() => setViewingTeamId(null)}
        onOpenProfile={openProfile}
        onOpenTeam={(id) => setViewingTeamId(id)}
      />
    )
  }

  const isCaptain = myTeam.captainId === myMemberId
  // MVPでは全員編集可。将来的に権限管理を戻す場合は isCaptain に差し替える。
  const canEdit = true
  // FS team のメンバーは uid なので allUsers から名前を解決。local team は users.get で従来通り。
  const lookupMember = (id) => {
    if (isFsTeam) {
      const u = allUsers.find((x) => x.uid === id)
      return u
        ? { id: u.uid, nickname: u.nickname, avatarStamp: u.avatarStamp, role: u.role }
        : null
    }
    return users.get(id)
  }
  const members = (myTeam.memberIds || []).map(lookupMember).filter(Boolean)
  // 体験ロールはチームランキングの分母から除外
  const rankingMembers = members.filter((m) => m.role !== ROLES.TRIAL)
  const friendTeamIds = myTeam.friendTeamIds || []
  const friendTeamActivities = friendTeamIds
    .flatMap((fid) => activities.listByTeam(fid))
    .map((a) => ({ ...a, source: 'local' }))
  // フレンドチームは FS / local 両方から解決
  const friendTeams = friendTeamIds
    .map((fid) => (allFsTeams || []).find((t) => t.id === fid) || teams.get(fid))
    .filter(Boolean)
  // match_result は試合結果カードで別表示、level_up は表示対象外。
  const isHiddenInTimeline = (a) =>
    a.type === ACTIVITY_TYPES.MATCH_RESULT || a.type === ACTIVITY_TYPES.LEVEL_UP
  const localTeamActivities = activities
    .listByTeam(myTeam.id)
    .filter((a) => !isHiddenInTimeline(a))
    .map((a) => ({ ...a, source: 'local' }))
  const fsTeamActivities = isFsTeam
    ? (allFsActivities || []).filter(
        (a) => a.teamId === myTeam.id && !isHiddenInTimeline(a),
      )
    : []
  const teamActivities = [...fsTeamActivities, ...localTeamActivities].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  )
  // FS team では Firestore のチャットを使用、それ以外は localStorage（mock 互換）
  const teamChat = isFsTeam ? fsTeamChats : chats.listByTeam(myTeam.id)

  const handleLikeActivity = (a) => {
    if (a.source === 'fs') toggleFsActivityLike(a.id, myUid)
    else activities.toggleLike(a.id, me.id)
  }
  const handleLikeChat = (id) => {
    if (isFsTeam) toggleFsChatLike(myTeam.id, id, myUid)
    else chats.toggleLike(id, me.id)
  }

  const submitChat = () => {
    const content = chatInput.trim()
    if (!content) return
    if (isFsTeam) postFsChat(myTeam.id, content)
    else chats.post({ teamId: myTeam.id, userId: me.id, content })
    setChatInput('')
  }

  const handleLeaveTeam = () => {
    if (!myTeam) return
    if (myTeam.captainId === myMemberId) {
      alert('キャプテンは脱退できません。先に他のメンバーにキャプテンを譲ってください。')
      return
    }
    if (!confirm('チームを脱退しますか？')) return
    if (isFsTeam) {
      removeFsTeamMember(myTeam.id, myUid)
    } else {
      const next = (myTeam.memberIds || []).filter((id) => id !== me.id)
      teams.update(myTeam.id, { memberIds: next })
    }
  }

  const handleDeleteTeam = () => {
    if (!myTeam) return
    if (myTeam.captainId !== myMemberId) {
      alert('キャプテンのみが抹消できます')
      return
    }
    if (!confirm(`「${myTeam.name}」を抹消しますか？\n所属メンバー全員が無所属になり、元に戻せません。`)) return
    if (isFsTeam) {
      deleteFsTeam(myTeam.id)
    } else {
      teams.remove(myTeam.id)
    }
  }

  const teamSearchDropdown = q && (
    (fsSearchResults.length === 0 && localSearchResults.length === 0) ? (
      <div className="search-dropdown-empty">該当するチームがありません</div>
    ) : (
      <ul className="search-list">
        {fsSearchResults.map((t) => {
          const joined = t.id === myTeam.id
          const isFriendTeam = friendTeamIds.includes(t.id)
          const outgoingJoin = outgoingRequests.find(
            (r) => r.kind === 'join' && r.teamId === t.id,
          ) || pendingJoinReqs.has(t.id)
          const outgoingFriend = (isCaptain && isFsTeam
            ? outgoingRequests.find(
                (r) => r.kind === 'friend_team' && r.teamId === t.id && r.fromTeamId === myTeam.id,
              )
            : null) || pendingFriendTeamReqs.has(t.id)
          return (
            <li key={`fs-${t.id}`} className="search-row">
              <div className="search-info">
                <div className="activity-name">
                  {t.name}
                  {t.handle && <span className="user-handle">@{t.handle}</span>}
                  <span className="real-tag">実チーム</span>
                </div>
                <div className="search-sub">{t.description}</div>
              </div>
              {joined ? (
                <span className="friend-tag">所属中</span>
              ) : isFriendTeam ? (
                <span className="friend-tag">フレンドチーム</span>
              ) : outgoingJoin ? (
                <span className="friend-tag">申請中</span>
              ) : outgoingFriend ? (
                <span className="friend-tag">申請中</span>
              ) : isCaptain && isFsTeam ? (
                <button
                  type="button"
                  className="small-btn filled"
                  onClick={() => handleSendFsFriendTeamRequest(myTeam.id, t.id)}
                >
                  フレンドチーム申請
                </button>
              ) : (
                <button
                  type="button"
                  className="small-btn filled"
                  onClick={() => handleSendFsJoinRequest(t.id)}
                >
                  加入申請
                </button>
              )}
            </li>
          )
        })}
        {localSearchResults.map((t) => {
          const joined = t.id === myTeam.id
          const isFriendTeam = friendTeamIds.includes(t.id)
          const outgoingJoin = !isCaptain ? teamRequests.findOutgoingJoin(me.id, t.id) : null
          const outgoingFriend = isCaptain
            ? teamRequests.findOutgoingFriendTeam(myTeam.id, t.id)
            : null
          return (
            <li key={t.id} className="search-row">
              <div className="search-info">
                <div className="activity-name">
                  {t.name}
                  {t.handle && <span className="user-handle">@{t.handle}</span>}
                </div>
                <div className="search-sub">{t.description}</div>
              </div>
              {joined ? (
                <span className="friend-tag">所属中</span>
              ) : isFriendTeam ? (
                <span className="friend-tag">フレンドチーム</span>
              ) : outgoingJoin ? (
                <span className="friend-tag">申請中</span>
              ) : outgoingFriend ? (
                <span className="friend-tag">申請中</span>
              ) : isCaptain && !isFsTeam ? (
                <button
                  type="button"
                  className="small-btn filled"
                  onClick={() => sendFriendTeamRequest(myTeam.id, t.id)}
                >
                  フレンドチーム申請
                </button>
              ) : (
                <button
                  type="button"
                  className="small-btn filled"
                  onClick={() => sendTeamJoinRequest(t.id, me.id)}
                >
                  加入申請
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
      <h1 className="screen-title">チーム</h1>

      <SearchBox
        value={query}
        onChange={setQuery}
        placeholder="チームを検索"
        dropdown={teamSearchDropdown}
      />

      <TeamInfoCard
        team={myTeam}
        canEdit={canEdit}
        members={members}
        editing={editingTeam}
        onStartEdit={() => setEditingTeam(true)}
        onCancelEdit={() => setEditingTeam(false)}
        onSave={(patch) => {
          if (isFsTeam) {
            updateFsTeam(myTeam.id, patch)
          } else {
            teams.update(myTeam.id, patch)
          }
          setEditingTeam(false)
        }}
      />

      {isFsTeam && isCaptain && incomingRequests.length > 0 && (() => {
        const joinReqs = incomingRequests.filter((r) => r.kind === 'join')
        const friendTeamReqs = incomingRequests.filter((r) => r.kind === 'friend_team')
        const groups = [
          { kind: 'friend_team', title: 'フレンドチーム申請', items: friendTeamReqs },
          { kind: 'join', title: '加入申請', items: joinReqs },
        ].filter((g) => g.items.length > 0)
        return groups.map((g) => (
        <section key={g.kind} className="info-card">
          <div className="card-title">{g.title}（{g.items.length}）</div>
          <ul className="search-list">
            {g.items.map((req) => {
              const fromUser = allUsers.find((u) => u.uid === req.fromUid)
              const label = req.kind === 'join' ? '加入申請' : 'フレンドチーム申請'
              // フレンドチーム申請の場合は申請元チーム名を取得
              const fromTeam = req.kind === 'friend_team' && req.fromTeamId
                ? (allFsTeams || []).find((t) => t.id === req.fromTeamId)
                : null
              return (
                <li key={req.id} className="search-row">
                  <button
                    type="button"
                    className="row-link"
                    onClick={() => openProfile(req.fromUid)}
                  >
                    <span className="activity-stamp" aria-hidden>
                      {getStamp(fromUser?.avatarStamp).label}
                    </span>
                    <div className="search-info">
                      <div className="activity-name">
                        {fromUser?.nickname ?? req.fromUid.slice(0, 6)}
                        {fromTeam && (
                          <span className="friend-tag" style={{ marginLeft: '0.4rem' }}>
                            {fromTeam.name}
                          </span>
                        )}
                      </div>
                      <div className="search-sub">{label}</div>
                    </div>
                  </button>
                  <div className="notif-actions">
                    <button
                      type="button"
                      className="small-btn filled"
                      onClick={async () => {
                        try { await acceptFsTeamRequest(req.id) }
                        catch (e) { alert(`承認に失敗: ${e?.message || e}`) }
                      }}
                    >
                      承認
                    </button>
                    <button
                      type="button"
                      className="small-btn"
                      onClick={async () => {
                        try { await declineFsTeamRequest(req.id) }
                        catch (e) { alert(`拒否に失敗: ${e?.message || e}`) }
                      }}
                    >
                      拒否
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
        ))
      })()}

      <section className="info-card">
        <div className="card-title">メンバー（{members.length}）</div>
        <ul className="friend-chips">
          {members.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="friend-chip"
                onClick={() => openProfile(m.id)}
              >
                <span className="activity-stamp" aria-hidden>{getStamp(m.avatarStamp).label}</span>
                <span className="activity-name">{m.nickname}</span>
                {m.id === myTeam.captainId && <span className="captain-tag">C</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {(() => {
        // FS チームは Firestore activities ベース、ローカルチームは localStorage missions ベース
        const teamRanking = isFsTeam
          ? fsTeamRanking.map((r) => ({
              id: r.uid,
              nickname: r.nickname,
              avatarStamp: r.avatarStamp,
              totalSwing: r.totalSwing,
            })).slice(0, 10)
          : computeTeamRanking(rankingMembers).slice(0, 10)
        console.log('[team-ranking]', teamRanking)
        const hasData = teamRanking.some((r) => r.totalSwing > 0)
        return (
          <section className="info-card">
            <div className="card-title">チームランキング（直近7日 / 上位10名）</div>
            {!hasData ? (
              <EmptyState
                icon="🏆"
                title="まだランキングデータがありません"
                description="チームメイトが素振りを達成するとここに反映されます"
              />
            ) : (
              <ol className="ranking-list">
                {teamRanking.map((r, i) => (
                  <li
                    key={r.id}
                    className={`ranking-row ${r.id === myMemberId ? 'me' : ''} clickable`}
                    onClick={() => r.id && openProfile(r.id)}
                  >
                    <span className={`ranking-rank rank-${i + 1}`}>{i + 1}</span>
                    <span className="activity-stamp small" aria-hidden>
                      {getStamp(r.avatarStamp).label}
                    </span>
                    <span className="ranking-name">
                      {r.nickname}
                      {r.id === myMemberId && <span className="real-tag">あなた</span>}
                      {r.id === myTeam.captainId && <span className="captain-tag">C</span>}
                    </span>
                    <span className="ranking-count">
                      {r.totalSwing.toLocaleString()}
                      <span className="stat-unit">回</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )
      })()}

      <section className="info-card">
        <div className="card-title">チームメイトのアクティビティ</div>
        {teamActivities.length === 0 ? (
          <div className="empty-txt">まだアクティビティがありません</div>
        ) : (
          <div className="activity-list">
            {teamActivities.map((a) => (
              <ActivityItem key={a.id} activity={a} currentUserId={me.id} onLike={handleLikeActivity} />
            ))}
          </div>
        )}
      </section>

      <section className="info-card">
        <div className="card-title">チームチャット</div>
        {teamChat.length === 0 ? (
          <div className="empty-txt">まだメッセージがありません</div>
        ) : (
          <div className="chat-list">
            {teamChat.map((c) => {
              const sender = lookupMember(c.userId)
              const myCheckId = isFsTeam ? myUid : me.id
              const liked = c.likeUserIds?.includes(myCheckId)
              const likeCount = c.likeUserIds?.length || 0
              const isMine = c.userId === myCheckId
              return (
                <div key={c.id} className={`chat-row ${isMine ? 'mine' : ''}`}>
                  <button
                    type="button"
                    className="activity-author"
                    onClick={() => sender && openProfile(sender.id)}
                    aria-label={sender ? `${sender.nickname}のプロフィール` : undefined}
                  >
                    <span className="activity-stamp small" aria-hidden>{getStamp(sender?.avatarStamp).label}</span>
                  </button>
                  <div className="chat-body">
                    <div className="chat-head">
                      <button
                        type="button"
                        className="activity-name-btn small"
                        onClick={() => sender && openProfile(sender.id)}
                      >
                        {sender?.nickname}
                      </button>
                      <span className="activity-time">{relativeTime(c.createdAt)}</span>
                    </div>
                    <div className="chat-bubble">{c.content}</div>
                  </div>
                  <button
                    type="button"
                    className={`like-btn ${liked ? 'liked' : ''}`}
                    onClick={() => handleLikeChat(c.id)}
                    aria-pressed={liked}
                    aria-label="いいね"
                  >
                    <span className="like-icon" aria-hidden>{liked ? '♥' : '♡'}</span>
                    {likeCount > 0 && <span className="like-count">{likeCount}</span>}
                  </button>
                </div>
              )
            })}
          </div>
        )}
        <div className="input-row">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="メッセージを入力"
            onKeyDown={(e) => e.key === 'Enter' && submitChat()}
          />
          <button onClick={submitChat}>送信</button>
        </div>
      </section>

      {friendTeams.length > 0 && (
        <section className="info-card">
          <div className="card-title">
            フレンドチームのアクティビティ
            <span className="meta-tag">{friendTeams.map((t) => t.name).join(' / ')}</span>
          </div>
          {friendTeamActivities.length === 0 ? (
            <div className="empty-txt">まだアクティビティがありません</div>
          ) : (
            <div className="activity-list">
              {friendTeamActivities.map((a) => (
                <ActivityItem key={a.id} activity={a} currentUserId={me.id} onLike={handleLikeActivity} />
              ))}
            </div>
          )}
        </section>
      )}

      <TeamMatchesCard
        team={myTeam}
        members={members}
        canEdit={canEdit}
        editingMatchId={editingMatchId}
        onStartAdd={() => setEditingMatchId('new')}
        onStartEdit={(id) => setEditingMatchId(id)}
        onCancel={() => setEditingMatchId(null)}
        onOpenProfile={openProfile}
        onAdd={(match) => {
          if (isFsTeam) {
            addFsMatch(myTeam.id, match)
            const mvpUser = members.find((m) => m.id === match.mvpPlayerId)
            onMatchAdded(myTeam.id, match, {
              fsTeamMemberUids: myTeam.memberIds || [],
              mvpName: mvpUser?.nickname || '',
            })
          } else {
            teams.addMatch(myTeam.id, match)
            onMatchAdded(myTeam.id, match)
          }
          setEditingMatchId(null)
        }}
        onUpdate={(matchId, match) => {
          if (isFsTeam) {
            const next = (myTeam.matches || []).map((m) => (m.id === matchId ? { ...m, ...match } : m))
            updateFsTeam(myTeam.id, { matches: next })
          } else {
            teams.updateMatch(myTeam.id, matchId, match)
          }
          setEditingMatchId(null)
        }}
      />

      <section className="info-card">
        <div className="card-title">フレンドチーム（{friendTeams.length}）</div>
        {friendTeams.length === 0 ? (
          <div className="empty-txt">
            まだフレンドチームがありません。チーム検索→申請→承認で追加できます。
          </div>
        ) : (
          <ul className="friend-chips">
            {friendTeams.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="friend-chip"
                  onClick={() => setViewingTeamId(t.id)}
                >
                  <span className="activity-name">{t.name}</span>
                  {t.handle && <span className="user-handle">@{t.handle}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isFsTeam && (
        <TeamTrialRequestCard
          members={members}
          request={trialRequest}
          editing={editingTrialRequest}
          onStartEdit={() => setEditingTrialRequest(true)}
          onCancel={() => setEditingTrialRequest(false)}
          onSave={async (fields) => {
            const trialUids = members
              .filter((m) => m.role === ROLES.TRIAL)
              .map((m) => m.id)
            await setTrialRequest(myTeam.id, fields, {
              trialUids,
              teamName: myTeam.name || '',
            })
            setEditingTrialRequest(false)
          }}
          onDelete={async () => {
            if (!confirm('体験会・助っ人参加のお願いを削除しますか？')) return
            await deleteTrialRequest(myTeam.id)
            setEditingTrialRequest(false)
          }}
        />
      )}

      <section className="info-card">
        <button className="danger-btn" onClick={handleLeaveTeam}>
          チームを脱退する
        </button>
        <button
          className="danger-btn"
          onClick={handleDeleteTeam}
          style={{ marginTop: '0.5rem' }}
        >
          チームを抹消する
        </button>
      </section>
    </div>
  )
}

function TeamInfoCard({ team, canEdit, editing, onStartEdit, onCancelEdit, onSave, members }) {
  const [name, setName] = useState(team.name)
  const [description, setDescription] = useState(team.description)
  const [captainId, setCaptainId] = useState(team.captainId)
  const [nm, setNm] = useState(team.nextMatch || { tournament: '', date: '', opponent: '' })

  // 都道府県・市町村の編集状態。既存の市町村が prefecture の MUNICIPALITIES に
  // 含まれない場合は「その他」扱いにしてカスタム入力欄を出す。
  const [prefecture, setPrefecture] = useState(team.prefecture || '')
  const initialMuniIsKnown =
    team.prefecture &&
    (MUNICIPALITIES_BY_PREF[team.prefecture] || []).includes(team.municipality)
  const [municipalitySel, setMunicipalitySel] = useState(
    team.municipality
      ? initialMuniIsKnown
        ? team.municipality
        : OTHER_OPTION
      : '',
  )
  const [municipalityCustom, setMunicipalityCustom] = useState(
    initialMuniIsKnown ? '' : team.municipality || '',
  )

  const municipalities = prefecture ? MUNICIPALITIES_BY_PREF[prefecture] || [] : []
  const municipalityValue =
    municipalitySel === OTHER_OPTION ? municipalityCustom.trim() : municipalitySel

  const save = () => {
    onSave({
      name: name.trim() || team.name,
      description: description.trim().slice(0, 50),
      captainId,
      prefecture: prefecture || '',
      municipality: municipalityValue || '',
      nextMatch: nm.tournament || nm.opponent || nm.date ? nm : null,
    })
  }

  const locationLabel = [team.prefecture, team.municipality].filter(Boolean).join(' ')

  if (!editing) {
    return (
      <section className="info-card">
        <div className="card-title card-title-row">
          <span>
            {team.name}
            {team.handle && <span className="user-handle">@{team.handle}</span>}
          </span>
          {canEdit && (
            <button type="button" className="small-btn card-edit-btn" onClick={onStartEdit}>編集</button>
          )}
        </div>
        {locationLabel && <div className="team-location">📍 {locationLabel}</div>}
        {team.description && <div className="team-desc">{team.description}</div>}
        <div className="next-match">
          <div className="next-match-label">次の試合</div>
          {team.nextMatch ? (
            <div className="next-match-body">
              <div className="next-match-tournament">{team.nextMatch.tournament}</div>
              <div className="next-match-detail">
                {team.nextMatch.date} vs {team.nextMatch.opponent}
              </div>
            </div>
          ) : (
            <div className="empty-txt">未設定</div>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="info-card">
      <div className="card-title">チーム編集</div>
      <label className="field">
        <span className="field-label">チーム名</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} />
      </label>
      <label className="field">
        <span className="field-label">チーム紹介文（50文字以内）</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 50))}
          rows={2}
          maxLength={50}
        />
        <span className="char-count">{description.length} / 50</span>
      </label>
      <label className="field">
        <span className="field-label">都道府県</span>
        <select
          value={prefecture}
          onChange={(e) => {
            setPrefecture(e.target.value)
            setMunicipalitySel('')
            setMunicipalityCustom('')
          }}
        >
          <option value="">選択してください</option>
          {PREFECTURES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </label>
      {prefecture && (
        <label className="field">
          <span className="field-label">市町村</span>
          <select
            value={municipalitySel}
            onChange={(e) => setMunicipalitySel(e.target.value)}
          >
            <option value="">選択してください</option>
            {municipalities.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
            <option value={OTHER_OPTION}>{OTHER_OPTION}</option>
          </select>
        </label>
      )}
      {municipalitySel === OTHER_OPTION && (
        <label className="field">
          <span className="field-label">市町村（直接入力）</span>
          <input
            type="text"
            value={municipalityCustom}
            onChange={(e) => setMunicipalityCustom(e.target.value)}
            maxLength={30}
            placeholder="例: 桜台町"
          />
        </label>
      )}
      <label className="field">
        <span className="field-label">キャプテン</span>
        <select value={captainId} onChange={(e) => setCaptainId(e.target.value)}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.nickname}</option>
          ))}
        </select>
      </label>
      <div className="field">
        <span className="field-label">次の試合</span>
        <input
          type="text"
          placeholder="大会名"
          value={nm.tournament}
          onChange={(e) => setNm({ ...nm, tournament: e.target.value })}
        />
        <input
          type="date"
          value={nm.date}
          onChange={(e) => setNm({ ...nm, date: e.target.value })}
        />
        <input
          type="text"
          placeholder="相手チーム名"
          value={nm.opponent}
          onChange={(e) => setNm({ ...nm, opponent: e.target.value })}
        />
      </div>
      <div className="btn-row">
        <button className="outline-btn" onClick={onCancelEdit}>キャンセル</button>
        <button className="submit" onClick={save}>保存</button>
      </div>
    </section>
  )
}

function TeamMatchesCard({
  team,
  members,
  canEdit,
  editingMatchId,
  onStartAdd,
  onStartEdit,
  onCancel,
  onAdd,
  onUpdate,
  onOpenProfile,
}) {
  const matches = [...(team.matches || [])].sort((a, b) => (a.date < b.date ? 1 : -1))
  const editingMatch = editingMatchId && editingMatchId !== 'new'
    ? matches.find((m) => m.id === editingMatchId) ?? null
    : null

  return (
    <section className="info-card">
      <div className="card-title card-title-row">
        <span>試合結果</span>
        {canEdit && !editingMatchId && (
          <button type="button" className="small-btn card-edit-btn" onClick={onStartAdd}>追加</button>
        )}
      </div>

      {editingMatchId && (
        <MatchForm
          key={editingMatchId}
          members={members}
          match={editingMatch}
          onCancel={onCancel}
          onSave={(payload) => {
            if (editingMatchId === 'new') onAdd(payload)
            else onUpdate(editingMatchId, payload)
          }}
        />
      )}

      {matches.length === 0 ? (
        <div className="empty-txt">まだ試合結果がありません</div>
      ) : (
        <ul className="match-list">
          {matches.map((m) => {
            const mvp = members.find((x) => x.id === m.mvpPlayerId) || null
            const resultLabel = m.result === 'win' ? '勝利' : m.result === 'lose' ? '敗北' : '引分'
            const isEditing = editingMatchId === m.id
            if (isEditing) return null
            return (
              <li key={m.id} className={`match-row ${m.result}`}>
                <div className="match-main">
                  <div className="match-line">vs {m.opponent} <b>{m.score}</b> {resultLabel}</div>
                  <div className="match-date">{m.date}</div>
                </div>
                {mvp && (
                  <button
                    type="button"
                    className="mvp-chip mvp-chip-btn"
                    onClick={() => onOpenProfile?.(mvp.id)}
                  >
                    <span className="mvp-label">MVP</span>
                    <span className="activity-stamp small" aria-hidden>{getStamp(mvp.avatarStamp).label}</span>
                    <span className="activity-name small">{mvp.nickname}</span>
                    {m.mvpReason && <span className="mvp-reason">「{m.mvpReason}」</span>}
                  </button>
                )}
                {canEdit && !editingMatchId && (
                  <div className="match-actions">
                    <button
                      type="button"
                      className="small-btn"
                      onClick={() => onStartEdit(m.id)}
                    >
                      編集
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function MatchForm({ members, match, onCancel, onSave }) {
  const today = new Date().toISOString().slice(0, 10)
  const [opponent, setOpponent] = useState(match?.opponent ?? '')
  const [score, setScore] = useState(match?.score ?? '')
  const [result, setResult] = useState(match?.result ?? 'win')
  const [mvpPlayerId, setMvpPlayerId] = useState(match?.mvpPlayerId ?? members[0]?.id ?? '')
  const [mvpReason, setMvpReason] = useState(match?.mvpReason ?? '')
  const [date, setDate] = useState(match?.date ?? today)

  const submit = () => {
    if (!opponent.trim() || !score.trim()) return
    onSave({
      opponent: opponent.trim(),
      score: score.trim(),
      result,
      mvpPlayerId,
      mvpReason: mvpReason.trim().slice(0, 15),
      date,
    })
  }

  return (
    <div className="match-form">
      <label className="field">
        <span className="field-label">相手チーム</span>
        <input value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="例: ブルーフェニックス" />
      </label>
      <label className="field">
        <span className="field-label">スコア</span>
        <input value={score} onChange={(e) => setScore(e.target.value)} placeholder="例: 7-2" />
      </label>
      <label className="field">
        <span className="field-label">結果</span>
        <div className="role-row">
          {[{ k: 'win', l: '勝利' }, { k: 'lose', l: '敗北' }, { k: 'draw', l: '引分' }].map((r) => (
            <button key={r.k} type="button" className={`role-btn ${result === r.k ? 'active' : ''}`} onClick={() => setResult(r.k)}>
              {r.l}
            </button>
          ))}
        </div>
      </label>
      <label className="field">
        <span className="field-label">日付</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">MVP</span>
        <select value={mvpPlayerId} onChange={(e) => setMvpPlayerId(e.target.value)}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.nickname}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">MVP理由（15文字以内）</span>
        <input
          value={mvpReason}
          onChange={(e) => setMvpReason(e.target.value.slice(0, 15))}
          maxLength={15}
          placeholder="例: 決勝打"
        />
        <span className="char-count">{mvpReason.length} / 15</span>
      </label>
      <div className="btn-row">
        <button className="outline-btn" onClick={onCancel}>キャンセル</button>
        <button className="submit" onClick={submit}>{match ? '保存' : '登録'}</button>
      </div>
    </div>
  )
}

function CreateTeamCard({ creating, onStart, onCancel, onCreate }) {
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [description, setDescription] = useState('')
  const [prefecture, setPrefecture] = useState('')
  const [municipalitySel, setMunicipalitySel] = useState('')
  const [municipalityCustom, setMunicipalityCustom] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setName('')
    setHandle('')
    setDescription('')
    setPrefecture('')
    setMunicipalitySel('')
    setMunicipalityCustom('')
    setError('')
  }

  if (!creating) {
    return (
      <section className="info-card">
        <div className="card-title">新しいチームを作る</div>
        <div className="empty-txt">キャプテンとしてチームを立ち上げましょう</div>
        <button className="outline-btn" onClick={onStart}>
          チームを作成する
        </button>
      </section>
    )
  }

  const municipalities = prefecture ? MUNICIPALITIES_BY_PREF[prefecture] || [] : []
  const municipalityValue = municipalitySel === OTHER_OPTION ? municipalityCustom.trim() : municipalitySel

  const submit = async () => {
    if (submitting) return
    setError('')
    const trimmed = name.trim()
    if (!trimmed) {
      setError('チーム名を入力してください')
      return
    }
    const trimmedHandle = handle.trim()
    if (!trimmedHandle) {
      setError('チームIDを入力してください')
      return
    }
    if (!TEAM_HANDLE_REGEX.test(trimmedHandle)) {
      setError(`チームIDは ${TEAM_HANDLE_RULE} で入力してください`)
      return
    }

    setSubmitting(true)
    try {
      // Firestore で一意性を担保（認証済みのとき）
      const myUid = await authReady
      if (myUid) {
        const result = await reserveTeamHandle(trimmedHandle, myUid)
        if (!result.ok) {
          if (result.reason === 'taken') {
            setError('このチームIDはすでに使われています')
          } else {
            setError('チームIDの予約に失敗しました。時間をおいて再度お試しください。')
          }
          return
        }
      }

      onCreate({
        name: trimmed,
        handle: trimmedHandle,
        description: description.trim().slice(0, 50),
        prefecture: prefecture || '',
        municipality: municipalityValue || '',
      })
      reset()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="info-card">
      <div className="card-title">新しいチームを作る</div>
      <label className="field">
        <span className="field-label">チーム名 <span className="req">*</span></span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          placeholder="例: スイングドラゴンズ"
        />
      </label>
      <label className="field">
        <span className="field-label">チームID <span className="req">*</span></span>
        <input
          type="text"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          maxLength={20}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          pattern="[a-zA-Z0-9_-]{3,20}"
          placeholder="例: swing_dragons"
        />
        <span className="field-hint">{TEAM_HANDLE_RULE}（重複不可）</span>
      </label>
      <label className="field">
        <span className="field-label">都道府県</span>
        <select
          value={prefecture}
          onChange={(e) => {
            setPrefecture(e.target.value)
            setMunicipalitySel('')
            setMunicipalityCustom('')
          }}
        >
          <option value="">選択してください</option>
          {PREFECTURES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </label>
      {prefecture && (
        <label className="field">
          <span className="field-label">市町村</span>
          <select
            value={municipalitySel}
            onChange={(e) => setMunicipalitySel(e.target.value)}
          >
            <option value="">選択してください</option>
            {municipalities.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
            <option value={OTHER_OPTION}>{OTHER_OPTION}</option>
          </select>
        </label>
      )}
      {municipalitySel === OTHER_OPTION && (
        <label className="field">
          <span className="field-label">市町村（直接入力）</span>
          <input
            type="text"
            value={municipalityCustom}
            onChange={(e) => setMunicipalityCustom(e.target.value)}
            maxLength={30}
            placeholder="例: 桜台町"
          />
        </label>
      )}
      <label className="field">
        <span className="field-label">チーム紹介文（50文字以内）</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 50))}
          rows={2}
          maxLength={50}
          placeholder="例: 毎日コツコツ素振りで強くなるチーム！"
        />
        <span className="char-count">{description.length} / 50</span>
      </label>
      {error && <div className="error">{error}</div>}
      <div className="btn-row">
        <button className="outline-btn" onClick={() => { reset(); onCancel() }}>
          キャンセル
        </button>
        <button
          className="submit"
          onClick={submit}
          disabled={submitting || !name.trim() || !handle.trim()}
        >
          {submitting ? '作成中...' : '作成'}
        </button>
      </div>
    </section>
  )
}

function TeamTrialRequestCard({
  members,
  request,
  editing,
  onStartEdit,
  onCancel,
  onSave,
  onDelete,
}) {
  const trialCount = members.filter((m) => m.role === ROLES.TRIAL).length
  return (
    <section className="info-card">
      <div className="card-title card-title-row">
        <span>体験会・試合助っ人参加のお願い</span>
        {!editing && (
          <button type="button" className="small-btn card-edit-btn" onClick={onStartEdit}>
            {request ? '編集' : '作成'}
          </button>
        )}
      </div>

      {editing ? (
        <TrialRequestForm request={request} onCancel={onCancel} onSave={onSave} />
      ) : request ? (
        <>
          <div className="trial-request-row"><b>開催日:</b> {request.date || '未設定'}</div>
          <div className="trial-request-row"><b>場所:</b> {request.location || '未設定'}</div>
          {request.notes && (
            <div className="trial-request-notes">{request.notes}</div>
          )}
          <div className="empty-txt" style={{ marginTop: '0.5rem' }}>
            体験ロールのメンバー{trialCount}名に通知済み。参加状況は各メンバーの保護者画面で確認できます。
          </div>
          <button className="danger-btn" onClick={onDelete} style={{ marginTop: '0.6rem' }}>
            お願いを削除
          </button>
        </>
      ) : (
        <div className="empty-txt">右上の「作成」から募集を開始できます。</div>
      )}
    </section>
  )
}

function TrialRequestForm({ request, onCancel, onSave }) {
  const [date, setDate] = useState(request?.date ?? '')
  const [location, setLocation] = useState(request?.location ?? '')
  const [notes, setNotes] = useState(request?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!date) return
    setSaving(true)
    try {
      await onSave({ date, location: location.trim(), notes: notes.trim() })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="match-form">
      <label className="field">
        <span className="field-label">開催日 <span className="req">*</span></span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">場所</span>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="例: 〇〇グラウンド"
        />
      </label>
      <label className="field">
        <span className="field-label">備考</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="持ち物・集合時間など"
        />
      </label>
      <div className="btn-row">
        <button className="outline-btn" onClick={onCancel} disabled={saving}>キャンセル</button>
        <button className="submit" onClick={submit} disabled={saving || !date}>
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  )
}

// フレンドチームの読み取り専用ビュー（チーム検索→申請→承認 後に表示される）
function FriendTeamView({ team, allUsers, allFsTeams, onBack, onOpenProfile, onOpenTeam }) {
  // FS チームならメンバーは uid で allUsers から解決、ローカルチームは users.get
  const isFsTeam = !!(allFsTeams || []).find((t) => t.id === team.id)
  const members = (team.memberIds || [])
    .map((id) => {
      if (isFsTeam) {
        const u = allUsers.find((x) => x.uid === id)
        return u
          ? { id: u.uid, nickname: u.nickname, avatarStamp: u.avatarStamp, role: u.role }
          : null
      }
      return users.get(id)
    })
    .filter(Boolean)

  const friendTeamIds = team.friendTeamIds || []
  const friendTeams = friendTeamIds
    .map((fid) => (allFsTeams || []).find((t) => t.id === fid) || teams.get(fid))
    .filter(Boolean)

  const matches = [...(team.matches || [])].sort((a, b) => (a.date < b.date ? 1 : -1))
  const locationLabel = [team.prefecture, team.municipality].filter(Boolean).join(' ')

  // ランキング: FS チームは loadFriendRanking、ローカルは computeTeamRanking
  const [ranking, setRanking] = useState([])
  const memberKey = (team.memberIds || []).join(',')
  useEffect(() => {
    const rankingMembers = members.filter((m) => m.role !== ROLES.TRIAL)
    if (isFsTeam) {
      const memberUids = rankingMembers.map((m) => m.id)
      const profiles = {}
      for (const m of rankingMembers) {
        profiles[m.id] = { nickname: m.nickname, avatarStamp: m.avatarStamp }
      }
      let cancelled = false
      loadFriendRanking(memberUids, profiles).then((list) => {
        if (!cancelled) {
          setRanking(list.map((r) => ({
            id: r.uid,
            nickname: r.nickname,
            avatarStamp: r.avatarStamp,
            totalSwing: r.totalSwing,
          })))
        }
      })
      return () => {
        cancelled = true
      }
    }
    // ローカルチームは同期計算だが、setState 直呼びは lint で禁止のため microtask 経由
    let cancelledLocal = false
    Promise.resolve().then(() => {
      if (!cancelledLocal) setRanking(computeTeamRanking(rankingMembers))
    })
    return () => {
      cancelledLocal = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.id, isFsTeam, memberKey, allUsers.length])
  const top10 = ranking.slice(0, 10)
  const hasRankingData = top10.some((r) => r.totalSwing > 0)

  return (
    <div className="screen">
      <button className="outline-btn" onClick={onBack}>← 自分のチームに戻る</button>

      <section className="info-card">
        <div className="card-title-row">
          <span>{team.name}</span>
          {team.handle && <span className="user-handle">@{team.handle}</span>}
        </div>
        {team.description && <div className="team-desc">{team.description}</div>}
        {locationLabel && <div className="team-location">{locationLabel}</div>}
      </section>

      <section className="info-card">
        <div className="card-title">メンバー（{members.length}）</div>
        <ul className="friend-chips">
          {members.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="friend-chip"
                onClick={() => onOpenProfile?.(m.id)}
              >
                <span className="activity-stamp" aria-hidden>{getStamp(m.avatarStamp).label}</span>
                <span className="activity-name">{m.nickname}</span>
                {m.id === team.captainId && <span className="captain-tag">C</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="info-card">
        <div className="card-title">チームランキング（直近7日 / 上位10名）</div>
        {!hasRankingData ? (
          <EmptyState
            icon="🏆"
            title="まだランキングデータがありません"
            description="メンバーが素振りを達成するとここに反映されます"
          />
        ) : (
          <ol className="ranking-list">
            {top10.map((r, i) => (
              <li
                key={r.id}
                className="ranking-row clickable"
                onClick={() => r.id && onOpenProfile?.(r.id)}
              >
                <span className={`ranking-rank rank-${i + 1}`}>{i + 1}</span>
                <span className="activity-stamp small" aria-hidden>
                  {getStamp(r.avatarStamp).label}
                </span>
                <span className="ranking-name">
                  {r.nickname}
                  {r.id === team.captainId && <span className="captain-tag">C</span>}
                </span>
                <span className="ranking-count">
                  {r.totalSwing.toLocaleString()}
                  <span className="stat-unit">回</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="info-card">
        <div className="card-title">試合結果</div>
        {matches.length === 0 ? (
          <div className="empty-txt">まだ試合結果がありません</div>
        ) : (
          <ul className="match-list">
            {matches.map((m) => {
              const mvp = members.find((x) => x.id === m.mvpPlayerId) || null
              const resultLabel = m.result === 'win' ? '勝利' : m.result === 'lose' ? '敗北' : '引分'
              return (
                <li key={m.id} className={`match-row ${m.result}`}>
                  <div className="match-line">vs {m.opponent} <b>{m.score}</b> {resultLabel}</div>
                  <div className="match-date">{m.date}</div>
                  {mvp && (
                    <div className="mvp-chip">
                      <span className="mvp-label">MVP</span>
                      <span className="activity-stamp small" aria-hidden>{getStamp(mvp.avatarStamp).label}</span>
                      <span className="activity-name small">{mvp.nickname}</span>
                      {m.mvpReason && <span className="mvp-reason">「{m.mvpReason}」</span>}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="info-card">
        <div className="card-title">フレンドチーム（{friendTeams.length}）</div>
        {friendTeams.length === 0 ? (
          <div className="empty-txt">フレンドチームはありません</div>
        ) : (
          <ul className="friend-chips">
            {friendTeams.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="friend-chip"
                  onClick={() => onOpenTeam?.(t.id)}
                >
                  <span className="activity-name">{t.name}</span>
                  {t.handle && <span className="user-handle">@{t.handle}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
