import { useState } from 'react'
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
import { ACTIVITY_TYPES, TEAM_HANDLE_REGEX, TEAM_HANDLE_RULE } from '../storage/schema.js'
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
            )
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
                    onClick={() => sendFsJoinRequest(t.id)}
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

  const isCaptain = myTeam.captainId === myMemberId
  // MVPでは全員編集可。将来的に権限管理を戻す場合は isCaptain に差し替える。
  const canEdit = true
  // FS team のメンバーは uid なので allUsers から名前を解決。local team は users.get で従来通り。
  const lookupMember = (id) => {
    if (isFsTeam) {
      const u = allUsers.find((x) => x.uid === id)
      return u ? { id: u.uid, nickname: u.nickname, avatarStamp: u.avatarStamp } : null
    }
    return users.get(id)
  }
  const members = (myTeam.memberIds || []).map(lookupMember).filter(Boolean)
  const friendTeamIds = myTeam.friendTeamIds || []
  const friendTeamActivities = friendTeamIds
    .flatMap((fid) => activities.listByTeam(fid))
    .map((a) => ({ ...a, source: 'local' }))
  const friendTeams = friendTeamIds.map((fid) => teams.get(fid)).filter(Boolean)
  // Exclude match_result from teammates timeline — shown separately in 試合結果 card.
  const localTeamActivities = activities
    .listByTeam(myTeam.id)
    .filter((a) => a.type !== ACTIVITY_TYPES.MATCH_RESULT)
    .map((a) => ({ ...a, source: 'local' }))
  const fsTeamActivities = isFsTeam
    ? (allFsActivities || []).filter(
        (a) =>
          a.teamId === myTeam.id && a.type !== ACTIVITY_TYPES.MATCH_RESULT,
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
          )
          const outgoingFriend = isCaptain && isFsTeam
            ? outgoingRequests.find(
                (r) => r.kind === 'friend_team' && r.teamId === t.id && r.fromTeamId === myTeam.id,
              )
            : null
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
                  onClick={() => sendFsFriendTeamRequest(myTeam.id, t.id)}
                >
                  フレンドチーム申請
                </button>
              ) : (
                <button
                  type="button"
                  className="small-btn filled"
                  onClick={() => sendFsJoinRequest(t.id)}
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

      {isFsTeam && isCaptain && incomingRequests.length > 0 && (
        <section className="info-card">
          <div className="card-title">チーム宛の申請（{incomingRequests.length}）</div>
          <ul className="search-list">
            {incomingRequests.map((req) => {
              const fromUser = allUsers.find((u) => u.uid === req.fromUid)
              const label = req.kind === 'join' ? '加入申請' : 'フレンドチーム申請'
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
                      </div>
                      <div className="search-sub">{label}</div>
                    </div>
                  </button>
                  <div className="notif-actions">
                    <button
                      type="button"
                      className="small-btn filled"
                      onClick={() => acceptFsTeamRequest(req.id)}
                    >
                      承認
                    </button>
                    <button
                      type="button"
                      className="small-btn"
                      onClick={() => declineFsTeamRequest(req.id)}
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
        const teamRanking = computeTeamRanking(members).slice(0, 10)
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
                    className={`ranking-row ${r.id === me.id ? 'me' : ''} clickable`}
                    onClick={() => r.id && openProfile(r.id)}
                  >
                    <span className={`ranking-rank rank-${i + 1}`}>{i + 1}</span>
                    <span className="activity-stamp small" aria-hidden>
                      {getStamp(r.avatarStamp).label}
                    </span>
                    <span className="ranking-name">
                      {r.nickname}
                      {r.id === me.id && <span className="real-tag">あなた</span>}
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
