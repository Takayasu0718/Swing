import { useEffect, useState } from 'react'
import { users, missions, teams, settings } from '../storage/storage.js'
import { ROLES } from '../storage/schema.js'
import { getStamp } from '../storage/stamps.js'
import { todayKey, computeStreak, countAchievementDays, computeLongestStreak } from '../lib/date.js'
import { levelFromProgress, daysUntilNextLevel, stageImage } from '../lib/dragon.js'
import { onMissionApproved } from '../lib/events.js'
import { useProfile } from '../hooks/useProfile.jsx'
import { auth } from '../lib/firebase.js'
import { useFirestoreFriends } from '../hooks/useFirestoreFriends.jsx'
import { useFirestoreTeams } from '../hooks/useFirestoreTeams.jsx'
import { loadFriendRanking } from '../lib/firestoreRanking.js'
import EmptyState from '../components/EmptyState.jsx'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

function localDateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// createdAt（approvedAt 由来）を優先、無ければ date フィールドにフォールバック。
function missionDateKey(m) {
  if (m.approvedAt) {
    const d = new Date(m.approvedAt)
    if (!Number.isNaN(d.getTime())) return localDateKey(d)
  }
  return m.date
}

function computeWeeklyData(completedMissions) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // 直近7日分（左=6日前、右=今日）の slot を作成
  const slots = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    slots.push({
      date: localDateKey(d),
      label: WEEKDAYS[d.getDay()],
      day: d.getDate(),
      count: 0,
      isToday: i === 0,
    })
  }
  // 同じ日の記録は加算
  for (const m of completedMissions) {
    const k = missionDateKey(m)
    const slot = slots.find((s) => s.date === k)
    if (slot) slot.count += m.goal ?? 0
  }
  return slots
}

function computeAnalytics(completedMissions) {
  const nowMs = Date.now()
  const dayMs = 24 * 3600 * 1000
  const within = (m, days) => {
    const ts = m.approvedAt
      ? new Date(m.approvedAt).getTime()
      : m.date
        ? new Date(`${m.date}T00:00:00`).getTime()
        : 0
    return Number.isFinite(ts) && nowMs - ts <= days * dayMs
  }
  const sumGoal = (arr) => arr.reduce((s, m) => s + (m.goal || 0), 0)
  const last7Sum = sumGoal(completedMissions.filter((m) => within(m, 7)))
  const last30Sum = sumGoal(completedMissions.filter((m) => within(m, 30)))
  const totalSwings = sumGoal(completedMissions)
  const longestStreak = computeLongestStreak(completedMissions)
  return { last7Sum, last30Sum, totalSwings, longestStreak }
}

export default function HomeScreen() {
  const user = users.getCurrent()
  const { openProfile } = useProfile()
  const { myUid, allUsers, friendships: fsFriendships } = useFirestoreFriends()
  const { myFsTeam } = useFirestoreTeams()
  const [ranking, setRanking] = useState([])
  // 達成ボタン押下時のエフェクト用パーティクル
  const [burst, setBurst] = useState({ seed: 0, particles: [] })

  const fsFriendUids = (fsFriendships || [])
    .filter((f) => f.status === 'accepted')
    .map((f) => f.participants?.find((p) => p !== myUid))
    .filter(Boolean)
  const fsTeammateUids = (myFsTeam?.memberIds ?? []).filter((u) => u !== myUid)
  const fsRecipientUids = Array.from(new Set([...fsFriendUids, ...fsTeammateUids]))

  const showAllUserRanking = user
    ? settings.get(user.id).display?.showAllUserRanking !== false
    : false

  const allUserUids = (allUsers || []).map((u) => u.uid).filter(Boolean)
  const allUidsKey = allUserUids.sort().join(',')

  useEffect(() => {
    if (!myUid || allUserUids.length === 0) return
    let cancelled = false
    const profiles = {}
    for (const u of allUsers) profiles[u.uid] = { nickname: u.nickname, avatarStamp: u.avatarStamp }
    if (user) profiles[myUid] = { nickname: user.nickname, avatarStamp: user.avatarStamp }
    console.log('[ranking] all users', allUserUids)
    loadFriendRanking(allUserUids, profiles).then((result) => {
      if (cancelled) return
      const top10 = result.slice(0, 10)
      console.log('[ranking] result', top10)
      setRanking(top10)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myUid, allUidsKey])

  useEffect(() => {
    if (burst.seed === 0) return
    const t = setTimeout(() => setBurst({ seed: 0, particles: [] }), 1400)
    return () => clearTimeout(t)
  }, [burst.seed])

  if (!user) return null

  const isPlayer = user.role === ROLES.PLAYER
  const isTrial = user.role === ROLES.TRIAL
  // ドラゴン・ランキングは選手＋体験ユーザーで共通表示
  const showDragonAndRanking = isPlayer || isTrial
  const today = todayKey()

  const myMissions = missions.listByUser(user.id)
  const streak = computeStreak(myMissions)
  const achievementDays = countAchievementDays(myMissions)
  const longestStreak = computeLongestStreak(myMissions)
  const level = levelFromProgress(achievementDays, longestStreak)
  const daysToNext = daysUntilNextLevel(achievementDays, longestStreak)

  const completedMissions = myMissions.filter((m) => m.completed)
  const todaySwingCount = completedMissions.find((m) => m.date === todayKey())?.goal ?? 0
  const totalSwingCount = completedMissions.reduce((sum, m) => sum + (m.goal ?? 0), 0)

  if (isPlayer) {
    console.log('[analytics] source missions', completedMissions)
  }

  const analytics = computeAnalytics(completedMissions)
  const weeklyData = computeWeeklyData(completedMissions)
  const weeklyMax = Math.max(...weeklyData.map((d) => d.count), 0)
  const weeklyHasData = weeklyMax > 0

  if (isPlayer) {
    console.log('[chart] weekly data', weeklyData)
  }

  if (isPlayer) {
    console.log('[analytics]', {
      last7Sum: analytics.last7Sum,
      last30Sum: analytics.last30Sum,
      totalSwings: analytics.totalSwings,
      longestStreak: analytics.longestStreak,
    })
  }

  // コーチアドバイスは Firestore 側のユーザー（allUsers）と localStorage の両方から取得して結合
  const fsCoachAdvice = (allUsers || [])
    .filter((u) => u.role === ROLES.COACH && u.advice)
    .map((u) => ({
      id: u.uid,
      userId: u.uid,
      nickname: u.nickname,
      advice: u.advice,
      stamp: getStamp(u.avatarStamp),
    }))
  const localCoachAdvice = users
    .list()
    .filter((u) => u.role === ROLES.COACH && u.advice)
    .map((u) => ({
      id: u.id,
      userId: u.id,
      nickname: u.nickname,
      advice: u.advice,
      stamp: getStamp(u.avatarStamp),
    }))
  // 同じ nickname + advice の重複を除く（自分が両方に登録されているケース）
  const seen = new Set()
  const coachAdvice = [...fsCoachAdvice, ...localCoachAdvice].filter((c) => {
    const key = `${c.nickname}::${c.advice}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const todayMission = isPlayer ? missions.get(user.id, today) : null
  const childClaimed = !!todayMission?.childClaimed
  const completed = !!todayMission?.completed

  const claimMission = () => {
    console.log('[swing] button clicked', {
      action: 'claim',
      swingCount: user.dailyGoal,
      uid: auth?.currentUser?.uid,
    })
    // パーティクル生成（イベントハンドラ内なので Math.random は OK）
    const emojis = ['🔥', '✨', '⭐', '💥', '🌟', '⚾']
    const particles = Array.from({ length: 22 }).map((_, i) => {
      const angle = (Math.PI * 2 * i) / 22 + Math.random() * 0.5
      const dist = 90 + Math.random() * 80
      return {
        tx: Math.cos(angle) * dist,
        ty: Math.sin(angle) * dist - 20,
        emoji: emojis[i % emojis.length],
        delay: Math.random() * 0.12,
        size: 1.1 + Math.random() * 0.8,
        rot: Math.random() * 720 - 360,
      }
    })
    setBurst({ seed: Date.now(), particles })
    missions.claim(user.id, today, user.dailyGoal)
  }
  const approveMission = () => {
    if (todayMission?.completed) return
    console.log('[swing] button clicked', {
      action: 'approve',
      swingCount: user.dailyGoal,
      uid: auth?.currentUser?.uid,
      fsRecipients: fsRecipientUids.length,
    })
    missions.approve(user.id, today)
    onMissionApproved(user.id, fsRecipientUids, myFsTeam?.id ?? null)
  }

  return (
    <div className="screen home">
      {showDragonAndRanking && (
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
            <div className="dragon-level">Lv.{level}</div>
            <div className="dragon-next">次のレベルまで あと <b>{daysToNext}</b> 日</div>
          </div>
        </section>
      )}

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
        <section className="info-card stats-row">
          <div className="stat-cell">
            <div className="stat-label">今日</div>
            <div className="stat-value">
              {todaySwingCount.toLocaleString()}
              <span className="stat-unit">回</span>
            </div>
          </div>
          <div className="stat-cell">
            <div className="stat-label">累計</div>
            <div className="stat-value">
              {totalSwingCount.toLocaleString()}
              <span className="stat-unit">回</span>
            </div>
          </div>
          <div className="stat-cell">
            <div className="stat-label">連続達成</div>
            <div className="stat-value">
              {streak}
              <span className="stat-unit">日</span>
            </div>
          </div>
        </section>
      )}

      {isPlayer && (
        <section className="info-card">
          <div className="card-title">分析</div>
          <div className="analytics-grid">
            <div className="analytics-cell">
              <div className="analytics-label">直近7日</div>
              <div className="analytics-value">
                {analytics.last7Sum.toLocaleString()}
                <span className="stat-unit">回</span>
              </div>
            </div>
            <div className="analytics-cell">
              <div className="analytics-label">直近30日</div>
              <div className="analytics-value">
                {analytics.last30Sum.toLocaleString()}
                <span className="stat-unit">回</span>
              </div>
            </div>
            <div className="analytics-cell">
              <div className="analytics-label">過去累積</div>
              <div className="analytics-value">
                {analytics.totalSwings.toLocaleString()}
                <span className="stat-unit">回</span>
              </div>
            </div>
            <div className="analytics-cell">
              <div className="analytics-label">最長連続達成</div>
              <div className="analytics-value">
                {analytics.longestStreak}
                <span className="stat-unit">日</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {showDragonAndRanking && showAllUserRanking && (
        <section className="info-card">
          <div className="card-title">全ユーザーランキング（直近7日 / 上位10名）</div>
          {ranking.length === 0 || ranking.every((r) => r.totalSwing === 0) ? (
            <EmptyState
              icon="🏆"
              title="まだランキングデータがありません"
              description="ユーザーが素振りを達成するとここに反映されます"
            />
          ) : (
            <ol className="ranking-list">
              {ranking.map((r, i) => (
                <li
                  key={r.uid}
                  className={`ranking-row ${r.uid === myUid ? 'me' : ''} clickable`}
                  onClick={() => r.uid && openProfile(r.uid)}
                >
                  <span className={`ranking-rank rank-${i + 1}`}>{i + 1}</span>
                  <span className="activity-stamp small" aria-hidden>
                    {getStamp(r.avatarStamp).label}
                  </span>
                  <span className="ranking-name">
                    {r.nickname}
                    {r.uid === myUid && <span className="real-tag">あなた</span>}
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
      )}

      {isPlayer && (
        <section className="info-card">
          <div className="card-title">直近7日間の素振り</div>
          {!weeklyHasData ? (
            <div className="empty-txt">まだ記録がありません</div>
          ) : (
            <div className="chart-grid" role="img" aria-label="直近7日間の素振り回数">
              {weeklyData.map((d) => {
                const ratio = weeklyMax > 0 ? d.count / weeklyMax : 0
                return (
                  <div key={d.date} className={`chart-bar-cell ${d.isToday ? 'today' : ''}`}>
                    <div className="chart-bar-value">{d.count > 0 ? d.count : ''}</div>
                    <div className="chart-bar-track">
                      <div
                        className="chart-bar-fill"
                        style={{ height: `${Math.max(ratio * 100, d.count > 0 ? 6 : 0)}%` }}
                      />
                    </div>
                    <div className="chart-bar-label">
                      <div className="chart-bar-day">{d.day}</div>
                      <div className="chart-bar-wd">{d.label}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {isPlayer && (
        <section className={`mission-card ${completed ? 'done' : ''} ${burst.seed > 0 ? 'bursting' : ''}`}>
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
          {burst.seed > 0 && (
            <div className="burst-overlay" aria-hidden>
              <div className="burst-flash" />
              {burst.particles.map((p, i) => (
                <span
                  key={`${burst.seed}-${i}`}
                  className="burst-particle"
                  style={{
                    '--tx': `${p.tx}px`,
                    '--ty': `${p.ty}px`,
                    '--rot': `${p.rot}deg`,
                    fontSize: `${p.size}rem`,
                    animationDelay: `${p.delay}s`,
                  }}
                >
                  {p.emoji}
                </span>
              ))}
            </div>
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

      {!isPlayer && !isTrial && (
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
