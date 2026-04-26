import { users, missions, teams } from '../storage/storage.js'
import { ROLES } from '../storage/schema.js'
import { getStamp } from '../storage/stamps.js'
import { todayKey, computeStreak, countAchievementDays } from '../lib/date.js'
import { levelFromDays, daysUntilNextLevel, stageImage, stageLabel } from '../lib/dragon.js'
import { onMissionApproved } from '../lib/events.js'
import { useProfile } from '../hooks/useProfile.jsx'
import { auth } from '../lib/firebase.js'

export default function HomeScreen() {
  const user = users.getCurrent()
  const { openProfile } = useProfile()
  if (!user) return null

  const isPlayer = user.role === ROLES.PLAYER
  const today = todayKey()

  const myMissions = missions.listByUser(user.id)
  const streak = computeStreak(myMissions)
  const achievementDays = countAchievementDays(myMissions)
  const level = levelFromDays(achievementDays)
  const daysToNext = daysUntilNextLevel(achievementDays)

  const coachAdvice = users
    .list()
    .filter((u) => u.role === ROLES.COACH && u.advice)
    .map((u) => ({
      id: u.id,
      userId: u.id,
      nickname: u.nickname,
      advice: u.advice,
      stamp: getStamp(u.avatarStamp),
    }))

  const todayMission = isPlayer ? missions.get(user.id, today) : null
  const childClaimed = !!todayMission?.childClaimed
  const completed = !!todayMission?.completed

  const claimMission = () => {
    console.log('[swing] button clicked', {
      action: 'claim',
      swingCount: user.dailyGoal,
      uid: auth?.currentUser?.uid,
    })
    missions.claim(user.id, today, user.dailyGoal)
  }
  const approveMission = () => {
    if (todayMission?.completed) return
    console.log('[swing] button clicked', {
      action: 'approve',
      swingCount: user.dailyGoal,
      uid: auth?.currentUser?.uid,
    })
    missions.approve(user.id, today)
    onMissionApproved(user.id)
  }

  return (
    <div className="screen home">
      <header className="home-header">
        <span className="avatar-big" aria-hidden>{getStamp(user.avatarStamp).label}</span>
        <div>
          <div className="greet">こんにちは</div>
          <div className="nickname">{user.nickname}</div>
        </div>
      </header>

      {isPlayer && (
        <section className="streak-card">
          <div className="streak-num">{streak}</div>
          <div className="streak-txt">日連続達成中！！</div>
        </section>
      )}

      {isPlayer && (
        <section className="dragon-card">
          <img
            src={stageImage(level)}
            alt={`スイングドラゴン Lv${level}`}
            className="dragon-img"
            width={140}
            height={140}
          />
          <div className="dragon-info">
            <div className="dragon-name">スイングドラゴン</div>
            <div className="dragon-level">
              Lv.{level} <span className="dragon-stage">{stageLabel(level)}</span>
            </div>
            <div className="dragon-next">次のレベルまで あと <b>{daysToNext}</b> 日</div>
          </div>
        </section>
      )}

      {isPlayer && (
        <section className={`mission-card ${completed ? 'done' : ''}`}>
          <div className="mission-head">
            <span className="mission-title">デイリーミッション</span>
            <span className={`mission-badge ${completed ? 'done' : ''}`}>
              {completed ? '達成' : '未達成'}
            </span>
          </div>
          {completed ? (
            <div className="mission-text success">
              <span className="celebrate" aria-hidden>🎉</span>
              達成！！素晴らしい！
              <span className="celebrate" aria-hidden>🎉</span>
            </div>
          ) : (
            <>
              <div className="mission-text">{user.dailyGoal}回の素振りを達成しよう！</div>
              {childClaimed ? (
                <button className="claim-btn claimed" disabled>
                  達成済み（保護者の承認待ち）
                </button>
              ) : (
                <button className="claim-btn" onClick={claimMission}>
                  達成
                </button>
              )}
            </>
          )}
        </section>
      )}

      {isPlayer && (
        <section className="approval-card">
          <div className="card-title">保護者承認</div>
          {completed ? (
            <div className="empty-txt">本日のミッションは承認済みです</div>
          ) : childClaimed ? (
            <>
              <div className="empty-txt">子供の達成を確認したら承認してください</div>
              <button className="approve-btn ready" onClick={approveMission}>
                保護者承認
              </button>
            </>
          ) : (
            <>
              <div className="empty-txt">子供が「達成」ボタンを押すと承認できます</div>
              <button className="approve-btn" disabled>
                保護者承認
              </button>
            </>
          )}
        </section>
      )}

      <NextMatchCard userId={user.id} />

      <section className="advice-card">
        <div className="card-title">監督・コーチからの一言アドバイス</div>
        {coachAdvice.length === 0 ? (
          <div className="empty-txt">まだアドバイスが届いていません</div>
        ) : (
          coachAdvice.map((c) => (
            <button
              key={c.id}
              type="button"
              className="advice-item advice-item-btn"
              onClick={() => openProfile(c.userId)}
            >
              <span className="advice-stamp" aria-hidden>{c.stamp.label}</span>
              <div>
                <div className="advice-name">{c.nickname}</div>
                <div className="advice-text">{c.advice}</div>
              </div>
            </button>
          ))
        )}
      </section>

      {!isPlayer && (
        <section className="info-card">
          <div className="card-title">監督・コーチモード</div>
          <div className="empty-txt">
            ドラゴン育成・デイリーミッションは選手アカウントの機能です。登録画面からアドバイスを編集するとホームに反映されます。
          </div>
        </section>
      )}
    </div>
  )
}

function NextMatchCard({ userId }) {
  const team = teams.findByMember(userId)
  const nm = team?.nextMatch
  return (
    <section className="info-card">
      <div className="card-title">次の試合予定</div>
      {nm ? (
        <div className="next-match-body">
          <div className="next-match-tournament">{nm.tournament}</div>
          <div className="next-match-detail">
            {nm.date} vs {nm.opponent}
          </div>
        </div>
      ) : (
        <div className="empty-txt">未設定（チーム画面で設定できます）</div>
      )}
    </section>
  )
}
