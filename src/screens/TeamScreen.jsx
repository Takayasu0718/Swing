import { useState } from 'react'
import { users, teams, chats, activities } from '../storage/storage.js'
import { getStamp } from '../storage/stamps.js'
import { relativeTime } from '../lib/time.js'
import SearchBox from '../components/SearchBox.jsx'
import ActivityItem from '../components/ActivityItem.jsx'

export default function TeamScreen() {
  const me = users.getCurrent()
  const [query, setQuery] = useState('')
  const [editingTeam, setEditingTeam] = useState(false)
  const [addingMatch, setAddingMatch] = useState(false)
  const [chatInput, setChatInput] = useState('')
  if (!me) return null

  const myTeam = teams.findByMember(me.id)
  const q = query.trim().toLowerCase()
  const searchResults = q
    ? teams.list().filter((t) => t.name?.toLowerCase().includes(q))
    : []

  if (!myTeam) {
    return (
      <div className="screen">
        <h1 className="screen-title">チーム</h1>
        <SearchBox value={query} onChange={setQuery} placeholder="チームを検索" />
        {q && (
          <section className="info-card">
            <div className="card-title">検索結果</div>
            {searchResults.length === 0 ? (
              <div className="empty-txt">該当するチームがありません</div>
            ) : (
              <ul className="search-list">
                {searchResults.map((t) => (
                  <li key={t.id} className="search-row">
                    <div className="search-info">
                      <div className="activity-name">{t.name}</div>
                      <div className="search-sub">{t.description}</div>
                    </div>
                    <button className="small-btn" disabled>加入申請（今後対応）</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        <section className="info-card">
          <div className="empty-txt">まだチームに所属していません</div>
        </section>
      </div>
    )
  }

  const isCaptain = myTeam.captainId === me.id
  // MVPでは全員編集可。将来的に権限管理を戻す場合は isCaptain に差し替える。
  const canEdit = true
  const members = (myTeam.memberIds || []).map((id) => users.get(id)).filter(Boolean)
  const friendTeamIds = myTeam.friendTeamIds || []
  const friendTeamActivities = friendTeamIds.flatMap((fid) => activities.listByTeam(fid))
  const friendTeams = friendTeamIds.map((fid) => teams.get(fid)).filter(Boolean)
  const teamActivities = activities.listByTeam(myTeam.id)
  const teamChat = chats.listByTeam(myTeam.id)

  const handleLikeActivity = (id) => activities.toggleLike(id, me.id)
  const handleLikeChat = (id) => chats.toggleLike(id, me.id)

  const submitChat = () => {
    const content = chatInput.trim()
    if (!content) return
    chats.post({ teamId: myTeam.id, userId: me.id, content })
    setChatInput('')
  }

  return (
    <div className="screen">
      <h1 className="screen-title">チーム</h1>

      <SearchBox value={query} onChange={setQuery} placeholder="チームを検索" />

      {q && (
        <section className="info-card">
          <div className="card-title">検索結果</div>
          {searchResults.length === 0 ? (
            <div className="empty-txt">該当するチームがありません</div>
          ) : (
            <ul className="search-list">
              {searchResults.map((t) => {
                const joined = t.id === myTeam.id
                const isFriendTeam = friendTeamIds.includes(t.id)
                return (
                  <li key={t.id} className="search-row">
                    <div className="search-info">
                      <div className="activity-name">{t.name}</div>
                      <div className="search-sub">{t.description}</div>
                    </div>
                    {joined ? (
                      <span className="friend-tag">所属中</span>
                    ) : isFriendTeam ? (
                      <span className="friend-tag">フレンドチーム</span>
                    ) : (
                      <button className="small-btn" disabled>
                        {isCaptain ? 'フレンド申請（今後対応）' : '加入申請（今後対応）'}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      <TeamInfoCard
        team={myTeam}
        canEdit={canEdit}
        members={members}
        editing={editingTeam}
        onStartEdit={() => setEditingTeam(true)}
        onCancelEdit={() => setEditingTeam(false)}
        onSave={(patch) => {
          teams.update(myTeam.id, patch)
          setEditingTeam(false)
        }}
      />

      <section className="info-card">
        <div className="card-title">メンバー（{members.length}）</div>
        <ul className="friend-chips">
          {members.map((m) => (
            <li key={m.id} className="friend-chip">
              <span className="activity-stamp" aria-hidden>{getStamp(m.avatarStamp).label}</span>
              <span className="activity-name">{m.nickname}</span>
              {m.id === myTeam.captainId && <span className="captain-tag">C</span>}
            </li>
          ))}
        </ul>
      </section>

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
              const sender = users.get(c.userId)
              const liked = c.likeUserIds?.includes(me.id)
              const likeCount = c.likeUserIds?.length || 0
              const isMine = c.userId === me.id
              return (
                <div key={c.id} className={`chat-row ${isMine ? 'mine' : ''}`}>
                  <span className="activity-stamp small" aria-hidden>{getStamp(sender?.avatarStamp).label}</span>
                  <div className="chat-body">
                    <div className="chat-head">
                      <span className="activity-name small">{sender?.nickname}</span>
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
        adding={addingMatch}
        onStartAdd={() => setAddingMatch(true)}
        onCancelAdd={() => setAddingMatch(false)}
        onAdd={(match) => {
          teams.addMatch(myTeam.id, match)
          setAddingMatch(false)
        }}
      />
    </div>
  )
}

function TeamInfoCard({ team, canEdit, editing, onStartEdit, onCancelEdit, onSave, members }) {
  const [name, setName] = useState(team.name)
  const [description, setDescription] = useState(team.description)
  const [captainId, setCaptainId] = useState(team.captainId)
  const [nm, setNm] = useState(team.nextMatch || { tournament: '', date: '', opponent: '' })

  const save = () => {
    onSave({
      name: name.trim() || team.name,
      description: description.trim(),
      captainId,
      nextMatch: nm.tournament || nm.opponent || nm.date ? nm : null,
    })
  }

  if (!editing) {
    return (
      <section className="info-card">
        <div className="card-title card-title-row">
          <span>{team.name}</span>
          {canEdit && (
            <button type="button" className="small-btn card-edit-btn" onClick={onStartEdit}>編集</button>
          )}
        </div>
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
        <span className="field-label">チーム紹介文</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={80} />
      </label>
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

function TeamMatchesCard({ team, members, canEdit, adding, onStartAdd, onCancelAdd, onAdd }) {
  const [opponent, setOpponent] = useState('')
  const [score, setScore] = useState('')
  const [result, setResult] = useState('win')
  const [mvpPlayerId, setMvpPlayerId] = useState(members[0]?.id || '')
  const [mvpReason, setMvpReason] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  const resetForm = () => {
    setOpponent(''); setScore(''); setResult('win'); setMvpReason(''); setDate(new Date().toISOString().slice(0, 10))
  }

  const submit = () => {
    if (!opponent.trim() || !score.trim()) return
    onAdd({
      opponent: opponent.trim(),
      score: score.trim(),
      result,
      mvpPlayerId,
      mvpReason: mvpReason.trim().slice(0, 15),
      date,
    })
    resetForm()
  }

  const matches = [...(team.matches || [])].sort((a, b) => (a.date < b.date ? 1 : -1))

  return (
    <section className="info-card">
      <div className="card-title card-title-row">
        <span>試合結果</span>
        {canEdit && !adding && (
          <button type="button" className="small-btn card-edit-btn" onClick={onStartAdd}>編集</button>
        )}
      </div>

      {adding && (
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
            <button className="outline-btn" onClick={() => { resetForm(); onCancelAdd() }}>キャンセル</button>
            <button className="submit" onClick={submit}>登録</button>
          </div>
        </div>
      )}

      {matches.length === 0 ? (
        <div className="empty-txt">まだ試合結果がありません</div>
      ) : (
        <ul className="match-list">
          {matches.map((m) => {
            const mvp = members.find((x) => x.id === m.mvpPlayerId) || null
            const resultLabel = m.result === 'win' ? '勝利' : m.result === 'lose' ? '敗北' : '引分'
            return (
              <li key={m.id} className={`match-row ${m.result}`}>
                <div className="match-main">
                  <div className="match-line">vs {m.opponent} <b>{m.score}</b> {resultLabel}</div>
                  <div className="match-date">{m.date}</div>
                </div>
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
  )
}
