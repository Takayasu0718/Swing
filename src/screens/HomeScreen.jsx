import { useEffect, useState } from 'react'
import { users, missions, teams, settings } from '../storage/storage.js'
import { ROLES, BATTING_STATUS_KEYS, BATTING_STATUS_MAX } from '../storage/schema.js'
import { getStamp } from '../storage/stamps.js'
import { todayKey, computeStreak, countAchievementDays, computeLongestStreak } from '../lib/date.js'
import { levelFromProgress, daysUntilNextLevel, MAX_DRAGON_LEVEL } from '../lib/dragon.js'
import { onMissionApproved } from '../lib/events.js'
import { useProfile } from '../hooks/useProfile.jsx'
import { auth } from '../lib/firebase.js'
import { useFirestoreFriends } from '../hooks/useFirestoreFriends.jsx'
import { useFirestoreTeams } from '../hooks/useFirestoreTeams.jsx'
import { loadFriendRanking } from '../lib/firestoreRanking.js'
import { isDemoMode } from '../lib/demoMode.js'
import { buildDemoAllUsersRanking } from '../storage/demoMockData.js'
import { applyDebugOverrides } from '../lib/debugMode.js'
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

export default function HomeScreen() {
  const user = users.getCurrent()
  const { openProfile } = useProfile()
  const { myUid, allUsers, friendships: fsFriendships } = useFirestoreFriends()
  const { myFsTeam } = useFirestoreTeams()
  const [ranking, setRanking] = useState([])
  // 達成ボタン押下時のエフェクト用パーティクル
  const [burst, setBurst] = useState({ seed: 0, particles: [] })
  // バッティングステータスの選択（claim 前に1〜2個）
  const [selectedStatusKeys, setSelectedStatusKeys] = useState(() => new Set())
  // バー伸び時の「+N」フローティング演出（key ごとに { points, seed } を保持）
  const [bumps, setBumps] = useState({})
  // カスタムラベル編集
  const [editingCustomLabel, setEditingCustomLabel] = useState(false)
  const [customLabelDraft, setCustomLabelDraft] = useState('')

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
    if (!myUid) return undefined
    if (isDemoMode()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRanking(buildDemoAllUsersRanking(myUid, user))
      return undefined
    }
    if (allUserUids.length === 0) return undefined
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
  const completedMissions = myMissions.filter((m) => m.completed)
  const weeklyData = computeWeeklyData(completedMissions)
  const weeklyMax = Math.max(...weeklyData.map((d) => d.count), 0)
  const weeklyHasData = weeklyMax > 0
  const todayMissionReal = isPlayer ? missions.get(user.id, today) : null

  // ?debug=1&... による表示値上書き（HomeScreen の数値・ボタン状態のみ）
  const dbg = applyDebugOverrides({
    streak: computeStreak(myMissions),
    achievementDays: countAchievementDays(myMissions),
    longestStreak: computeLongestStreak(myMissions),
    level: levelFromProgress(
      countAchievementDays(myMissions),
      computeLongestStreak(myMissions),
    ),
    daysToNext: daysUntilNextLevel(
      countAchievementDays(myMissions),
      computeLongestStreak(myMissions),
    ),
    todaySwingCount: completedMissions.find((m) => m.date === todayKey())?.goal ?? 0,
    totalSwingCount: completedMissions.reduce((sum, m) => sum + (m.goal ?? 0), 0),
    battingStatus: user.battingStatus || {},
    childClaimed: !!todayMissionReal?.childClaimed,
    completed: !!todayMissionReal?.completed,
  })
  const {
    streak, achievementDays, longestStreak, level, daysToNext,
    todaySwingCount, totalSwingCount, battingStatus,
  } = dbg
  const customLabel = user.customStatusLabel || ''

  const toggleStatusKey = (k) => {
    setSelectedStatusKeys((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else if (next.size >= 2) {
        // 既に2つ選択中なら、最も古い1つを削除して新しいのを追加
        const first = next.values().next().value
        next.delete(first)
        next.add(k)
      } else {
        next.add(k)
      }
      return next
    })
  }

  const startEditCustomLabel = () => {
    setCustomLabelDraft(customLabel)
    setEditingCustomLabel(true)
  }
  const saveCustomLabel = () => {
    users.update(user.id, { customStatusLabel: customLabelDraft.trim().slice(0, 12) })
    setEditingCustomLabel(false)
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

  const todayMission = todayMissionReal
  const childClaimed = dbg.childClaimed
  const completed = dbg.completed

  const claimMission = () => {
    if (selectedStatusKeys.size < 1 || selectedStatusKeys.size > 2) return
    console.log('[swing] button clicked', {
      action: 'claim',
      swingCount: user.dailyGoal,
      uid: auth?.currentUser?.uid,
    })
    // 紙吹雪パーティクル生成（イベントハンドラ内なので Math.random は OK）。
    // 配色はアプリの世界観に合わせて青系メインに金・ピンク・緑をアクセント。
    const palette = ['#fbbf24', '#3b82f6', '#ec4899', '#10b981', '#f97316', '#a855f7']
    const N = 28
    const particles = Array.from({ length: N }).map((_, i) => {
      const angle = (Math.PI * 2 * i) / N + Math.random() * 0.35
      const dist = 110 + Math.random() * 100
      return {
        tx: Math.cos(angle) * dist,
        ty: Math.sin(angle) * dist - 30,
        color: palette[i % palette.length],
        delay: Math.random() * 0.12,
        rot: Math.random() * 720 - 360,
        w: 8 + Math.random() * 6,
        h: 12 + Math.random() * 8,
      }
    })
    setBurst({ seed: Date.now(), particles })

    // バッティングステータス加点: Lv up 予測で 2x 倍率
    const futureDays = achievementDays + 1
    const futureStreak = streak + 1
    const futureLongest = Math.max(longestStreak, futureStreak)
    const levelBefore = level
    const levelAfter = levelFromProgress(futureDays, futureLongest)
    const multiplier = levelAfter > levelBefore ? 2 : 1
    const basePerSelection = selectedStatusKeys.size === 1 ? 4 : 2
    const points = basePerSelection * multiplier
    const deltas = {}
    const seed = Date.now()
    const newBumps = {}
    for (const k of selectedStatusKeys) {
      deltas[k] = points
      newBumps[k] = { points, seed }
    }
    users.addBattingPoints(user.id, deltas)
    setBumps(newBumps)
    setSelectedStatusKeys(new Set())
    // ペナルティカウンタをリセット（連続未達成が止まったので）
    if (user.battingStatusPenaltyCount) {
      users.setBattingPenaltyCount(user.id, 0)
    }

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
          <span className="dragon-img dragon-avatar" aria-hidden>
            <img src={getStamp(user.avatarStamp).image} alt="" />
          </span>
          <div className="dragon-info">
            <div className="dragon-name">{user.nickname}</div>
            <div className="dragon-level-row">
              <span className="dragon-level-label">LEVEL</span>
              <span className="dragon-level-num">{level}</span>
              {level >= MAX_DRAGON_LEVEL && <span className="dragon-level-max">MAX</span>}
            </div>
            <div className="dragon-exp">
              <div
                className="dragon-exp-bar"
                role="progressbar"
                aria-valuenow={level >= MAX_DRAGON_LEVEL ? 100 : Math.round(((3 - daysToNext) / 3) * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="dragon-exp-fill"
                  style={{
                    width:
                      level >= MAX_DRAGON_LEVEL
                        ? '100%'
                        : `${Math.max(0, Math.min(100, ((3 - daysToNext) / 3) * 100))}%`,
                  }}
                />
              </div>
              <div className="dragon-exp-text">
                {level >= MAX_DRAGON_LEVEL ? (
                  '最大レベル到達！'
                ) : (
                  <>あと <b>{daysToNext}</b> 日でレベルアップ</>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {isPlayer && (
        <section className="streak-card">
          <span className="streak-wreath streak-wreath-l" aria-hidden>
            <svg viewBox="0 0 80 140" xmlns="http://www.w3.org/2000/svg">
              <path d="M 66 14 Q 14 70 66 126" stroke="#c7d5ec" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.9" />
              <ellipse cx="58" cy="20" rx="10" ry="3" fill="#b8c9e6" transform="rotate(-50 58 20)" opacity="0.9" />
              <ellipse cx="50" cy="16" rx="8" ry="2.6" fill="#a6bbdc" transform="rotate(-75 50 16)" opacity="0.85" />
              <ellipse cx="45" cy="36" rx="12" ry="3.4" fill="#b8c9e6" transform="rotate(-30 45 36)" opacity="0.9" />
              <ellipse cx="36" cy="34" rx="10" ry="2.8" fill="#a6bbdc" transform="rotate(-55 36 34)" opacity="0.85" />
              <ellipse cx="30" cy="58" rx="13" ry="3.6" fill="#b8c9e6" transform="rotate(-8 30 58)" opacity="0.9" />
              <ellipse cx="22" cy="60" rx="11" ry="3" fill="#a6bbdc" transform="rotate(-32 22 60)" opacity="0.85" />
              <ellipse cx="30" cy="82" rx="13" ry="3.6" fill="#b8c9e6" transform="rotate(12 30 82)" opacity="0.9" />
              <ellipse cx="22" cy="80" rx="11" ry="3" fill="#a6bbdc" transform="rotate(36 22 80)" opacity="0.85" />
              <ellipse cx="45" cy="104" rx="12" ry="3.4" fill="#b8c9e6" transform="rotate(32 45 104)" opacity="0.9" />
              <ellipse cx="36" cy="106" rx="10" ry="2.8" fill="#a6bbdc" transform="rotate(58 36 106)" opacity="0.85" />
              <ellipse cx="58" cy="120" rx="10" ry="3" fill="#b8c9e6" transform="rotate(54 58 120)" opacity="0.9" />
              <ellipse cx="50" cy="124" rx="8" ry="2.6" fill="#a6bbdc" transform="rotate(78 50 124)" opacity="0.85" />
            </svg>
          </span>
          <span className="streak-wreath streak-wreath-r" aria-hidden>
            <svg viewBox="0 0 80 140" xmlns="http://www.w3.org/2000/svg">
              <path d="M 66 14 Q 14 70 66 126" stroke="#c7d5ec" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.9" />
              <ellipse cx="58" cy="20" rx="10" ry="3" fill="#b8c9e6" transform="rotate(-50 58 20)" opacity="0.9" />
              <ellipse cx="50" cy="16" rx="8" ry="2.6" fill="#a6bbdc" transform="rotate(-75 50 16)" opacity="0.85" />
              <ellipse cx="45" cy="36" rx="12" ry="3.4" fill="#b8c9e6" transform="rotate(-30 45 36)" opacity="0.9" />
              <ellipse cx="36" cy="34" rx="10" ry="2.8" fill="#a6bbdc" transform="rotate(-55 36 34)" opacity="0.85" />
              <ellipse cx="30" cy="58" rx="13" ry="3.6" fill="#b8c9e6" transform="rotate(-8 30 58)" opacity="0.9" />
              <ellipse cx="22" cy="60" rx="11" ry="3" fill="#a6bbdc" transform="rotate(-32 22 60)" opacity="0.85" />
              <ellipse cx="30" cy="82" rx="13" ry="3.6" fill="#b8c9e6" transform="rotate(12 30 82)" opacity="0.9" />
              <ellipse cx="22" cy="80" rx="11" ry="3" fill="#a6bbdc" transform="rotate(36 22 80)" opacity="0.85" />
              <ellipse cx="45" cy="104" rx="12" ry="3.4" fill="#b8c9e6" transform="rotate(32 45 104)" opacity="0.9" />
              <ellipse cx="36" cy="106" rx="10" ry="2.8" fill="#a6bbdc" transform="rotate(58 36 106)" opacity="0.85" />
              <ellipse cx="58" cy="120" rx="10" ry="3" fill="#b8c9e6" transform="rotate(54 58 120)" opacity="0.9" />
              <ellipse cx="50" cy="124" rx="8" ry="2.6" fill="#a6bbdc" transform="rotate(78 50 124)" opacity="0.85" />
            </svg>
          </span>
          <span className="streak-sparkle streak-sparkle-1" aria-hidden>
            <svg viewBox="-10 -10 20 20" xmlns="http://www.w3.org/2000/svg">
              <path d="M 0 -9 L 2 -2 L 9 0 L 2 2 L 0 9 L -2 2 L -9 0 L -2 -2 Z" fill="#fde047" />
            </svg>
          </span>
          <span className="streak-sparkle streak-sparkle-2" aria-hidden>
            <svg viewBox="-10 -10 20 20" xmlns="http://www.w3.org/2000/svg">
              <path d="M 0 -9 L 2 -2 L 9 0 L 2 2 L 0 9 L -2 2 L -9 0 L -2 -2 Z" fill="#fde047" />
            </svg>
          </span>
          <span className="streak-sparkle streak-sparkle-3" aria-hidden>
            <svg viewBox="-10 -10 20 20" xmlns="http://www.w3.org/2000/svg">
              <path d="M 0 -9 L 2 -2 L 9 0 L 2 2 L 0 9 L -2 2 L -9 0 L -2 -2 Z" fill="#fcd34d" />
            </svg>
          </span>
          <div className="streak-num">{streak}</div>
          <div className="streak-txt">日連続達成中！！</div>
        </section>
      )}

      {isPlayer && (
        <section className="info-card">
          <div className="card-title">
            バッティングステータス
            <span className="meta-tag">意識する項目を1〜2個選択（{selectedStatusKeys.size}/2）</span>
          </div>
          <div className="batting-status-list">
            {BATTING_STATUS_KEYS.map((item) => {
              const value = battingStatus[item.key] || 0
              const widthPct = Math.min(100, (value / BATTING_STATUS_MAX) * 100)
              const selected = selectedStatusKeys.has(item.key)
              const bump = bumps[item.key]
              const isCustom = item.key === 'custom'
              const labelText = isCustom ? (customLabel || '（項目を入力）') : item.label
              const canSelect = !isCustom || (!!customLabel && !editingCustomLabel)
              const handleRowClick = () => {
                if (editingCustomLabel) return
                if (!canSelect) return
                toggleStatusKey(item.key)
              }
              return (
                <div
                  key={item.key}
                  className={`batting-row ${selected ? 'selected' : ''} ${!canSelect ? 'disabled' : ''}`}
                >
                  <div className="batting-row-head">
                    <span className="batting-row-check" aria-hidden>
                      {selected ? '☑' : '☐'}
                    </span>
                    {isCustom && editingCustomLabel ? (
                      <input
                        type="text"
                        className="batting-custom-input"
                        value={customLabelDraft}
                        onChange={(e) => setCustomLabelDraft(e.target.value.slice(0, 12))}
                        autoFocus
                        maxLength={12}
                        placeholder="意識する項目"
                      />
                    ) : (
                      <span
                        className="batting-row-label"
                        role={canSelect ? 'button' : undefined}
                        tabIndex={canSelect ? 0 : -1}
                        onClick={handleRowClick}
                        onKeyDown={(e) => {
                          if (canSelect && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault()
                            handleRowClick()
                          }
                        }}
                      >
                        {labelText}
                      </span>
                    )}
                    {isCustom && !editingCustomLabel && (
                      <button
                        type="button"
                        className="small-btn batting-edit-btn"
                        onClick={startEditCustomLabel}
                      >
                        {customLabel ? '編集' : '入力'}
                      </button>
                    )}
                    {isCustom && editingCustomLabel && (
                      <button
                        type="button"
                        className="small-btn filled batting-edit-btn"
                        onClick={saveCustomLabel}
                      >
                        保存
                      </button>
                    )}
                    <span className="batting-row-value">{value}</span>
                  </div>
                  <div
                    className="batting-bar-track"
                    role={canSelect ? 'button' : undefined}
                    tabIndex={canSelect ? 0 : -1}
                    onClick={handleRowClick}
                    onKeyDown={(e) => {
                      if (canSelect && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault()
                        handleRowClick()
                      }
                    }}
                    aria-pressed={selected}
                  >
                    <div
                      className="batting-bar-fill"
                      style={{ width: `${widthPct}%` }}
                    />
                    {bump && (
                      <span
                        key={`${item.key}-${bump.seed}`}
                        className="batting-bump-pop"
                      >
                        +{bump.points}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
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
                <button
                  className="claim-btn"
                  onClick={claimMission}
                  disabled={selectedStatusKeys.size < 1 || selectedStatusKeys.size > 2}
                >
                  {selectedStatusKeys.size === 0
                    ? '意識する項目を選んでね'
                    : `達成（${selectedStatusKeys.size === 1 ? '+4pt' : '+2pt × 2'}）`}
                </button>
              )}
            </>
          )}
          {burst.seed > 0 && (
            <div className="burst-overlay" aria-hidden>
              <div className="burst-rays" />
              <div className="burst-flash" />
              {burst.particles.map((p, i) => (
                <span
                  key={`${burst.seed}-${i}`}
                  className="burst-confetti"
                  style={{
                    '--tx': `${p.tx}px`,
                    '--ty': `${p.ty}px`,
                    '--rot': `${p.rot}deg`,
                    background: p.color,
                    width: `${p.w}px`,
                    height: `${p.h}px`,
                    animationDelay: `${p.delay}s`,
                  }}
                />
              ))}
              <div className="burst-banner">MISSION CLEAR!</div>
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
                    <img src={getStamp(r.avatarStamp).image} alt="" />
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

      <NextMatchCard userId={user.id} fsTeam={myFsTeam} />

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
              <span className="advice-stamp" aria-hidden><img src={c.stamp.image} alt="" /></span>
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

function NextMatchCard({ userId, fsTeam }) {
  // Firestore チームの次試合を優先、なければ localStorage チームにフォールバック
  const localTeam = teams.findByMember(userId)
  const nm = fsTeam?.nextMatch || localTeam?.nextMatch
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
