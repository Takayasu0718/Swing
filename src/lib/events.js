// Domain events: screens call these after mutations to fan out
// timeline activities and notifications. Respects recipient's
// notification settings. No storage coupling — screens decide when to fire.

import {
  users,
  activities,
  notifications,
  teams,
  teamRequests,
  friendships,
  missions,
  settings,
} from '../storage/storage.js'
import { ACTIVITY_TYPES } from '../storage/schema.js'
import { levelFromDays, stageIndex } from './dragon.js'
import { countAchievementDays, computeStreak, todayKey } from './date.js'
import { syncSwingActivity } from './firestoreSync.js'
import { createFsNotification } from './firestoreNotifications.js'

function notify(recipientId, data) {
  const s = settings.get(recipientId)
  if (s.notifications?.[data.type] === false) return null
  return notifications.create({ userId: recipientId, read: false, ...data })
}

function socialRecipients(userId) {
  const team = teams.findByMember(userId)
  const ids = new Set([
    ...friendships.acceptedFriendIds(userId),
    ...((team?.memberIds ?? []).filter((id) => id !== userId)),
  ])
  return Array.from(ids)
}

// Called after missions.approve() succeeds for the given user on today.
// fsRecipientUids: 実ユーザー（Firestore）の通知先 uid のリスト
export function onMissionApproved(userId, fsRecipientUids = []) {
  const user = users.get(userId)
  if (!user) return
  const team = teams.findByMember(userId)
  const ms = missions.listByUser(userId)
  const days = countAchievementDays(ms)
  const streak = computeStreak(ms)
  const levelAfter = levelFromDays(days)
  const levelBefore = levelFromDays(Math.max(0, days - 1))

  const activity = activities.create({
    userId,
    type: ACTIVITY_TYPES.SWING_ACHIEVED,
    content: '今日の素振りミッションを達成！',
    teamId: team?.id ?? null,
  })

  // Firestore: users/{uid}/activities に素振り達成を1件追記（best-effort、失敗してもUIには影響なし）
  syncSwingActivity({ swingCount: user.dailyGoal ?? 0, date: todayKey() })

  // Self-notification は出さず、フレンド+チームメンバー(localStorage)に通知。
  for (const rid of socialRecipients(userId)) {
    notify(rid, {
      type: 'swing_complete',
      fromUserId: userId,
      content: `${user.nickname}さんが今日の素振りミッションを達成しました！`,
      activityId: activity.id,
    })
  }

  // Firestore 実ユーザー宛に通知書き込み
  for (const fsUid of fsRecipientUids) {
    createFsNotification({
      userId: fsUid,
      type: 'swing_complete',
      content: `${user.nickname}さんが今日の素振りミッションを達成しました！`,
    })
  }

  // Streak milestone every 5 days (5/10/15/...) — notify self + friends + teammates.
  if (streak > 0 && streak % 5 === 0) {
    const streakActivity = activities.create({
      userId,
      type: ACTIVITY_TYPES.SWING_ACHIEVED,
      content: `連続${streak}日達成！！`,
      teamId: team?.id ?? null,
    })
    notify(userId, {
      type: 'streak_milestone',
      fromUserId: null,
      content: `連続${streak}日達成！おめでとう！`,
      activityId: streakActivity.id,
    })
    for (const rid of socialRecipients(userId)) {
      notify(rid, {
        type: 'streak_milestone',
        fromUserId: userId,
        content: `${user.nickname}さんが連続${streak}日達成！おめでとう！`,
        activityId: streakActivity.id,
      })
    }
    for (const fsUid of fsRecipientUids) {
      createFsNotification({
        userId: fsUid,
        type: 'streak_milestone',
        content: `${user.nickname}さんが連続${streak}日達成！おめでとう！`,
      })
    }
  }

  // Level up — タイムラインへのアクティビティ投稿のみ（自分宛通知は出さない）
  if (levelAfter > levelBefore) {
    activities.create({
      userId,
      type: ACTIVITY_TYPES.LEVEL_UP,
      content: stageIndex(levelAfter) > stageIndex(levelBefore)
        ? `ドラゴンが進化！ Lv.${levelAfter} になった！`
        : `スイングドラゴンが Lv.${levelAfter} になった！`,
      teamId: team?.id ?? null,
    })
  }
}

// Only fires when goal was increased (old -> new). First registration has no oldGoal -> no-op.
export function onGoalRaised(userId, oldGoal, newGoal) {
  if (!newGoal || !oldGoal || newGoal <= oldGoal) return
  const user = users.get(userId)
  if (!user) return
  const team = teams.findByMember(userId)

  const activity = activities.create({
    userId,
    type: ACTIVITY_TYPES.GOAL_RAISED,
    content: `目標を${newGoal}回にアップ！`,
    teamId: team?.id ?? null,
  })

  for (const rid of socialRecipients(userId)) {
    notify(rid, {
      type: 'goal_raised',
      fromUserId: userId,
      content: `${user.nickname}さんが目標回数を${newGoal}回にアップしました`,
      activityId: activity.id,
    })
  }
}

export function onMatchAdded(teamId, match) {
  const team = teams.get(teamId)
  if (!team) return
  const resultLabel = match.result === 'win' ? '勝利' : match.result === 'lose' ? '敗北' : '引分'
  activities.create({
    userId: team.captainId,
    type: ACTIVITY_TYPES.MATCH_RESULT,
    content: `vs ${match.opponent} ${match.score} ${resultLabel}`,
    teamId,
  })

  if (match.mvpPlayerId) {
    const mvp = users.get(match.mvpPlayerId)
    if (mvp) {
      for (const rid of team.memberIds || []) {
        notify(rid, {
          type: 'mvp_selected',
          fromUserId: match.mvpPlayerId,
          content: `${mvp.nickname}さんが${match.opponent}戦のMVPに選ばれました！おめでとうございます！`,
        })
      }
    }
  }
}

// --- Friend request flow ---

export function sendFriendRequest(fromUserId, toUserId) {
  if (fromUserId === toUserId) return null
  const existing = friendships
    .list()
    .find(
      (f) =>
        (f.fromUserId === fromUserId && f.toUserId === toUserId) ||
        (f.fromUserId === toUserId && f.toUserId === fromUserId),
    )
  if (existing) return existing
  const f = friendships.create({ fromUserId, toUserId, status: 'pending' })
  const from = users.get(fromUserId)
  notify(toUserId, {
    type: 'friend_request',
    fromUserId,
    content: `${from?.nickname ?? '誰か'}さんからフレンド申請が届きました`,
    requestId: f.id,
  })
  return f
}

export function acceptFriendRequest(friendshipId) {
  const f = friendships.get(friendshipId)
  if (!f || f.status !== 'pending') return null
  friendships.accept(friendshipId)
  const accepter = users.get(f.toUserId)
  notify(f.fromUserId, {
    type: 'friend_accepted',
    fromUserId: f.toUserId,
    content: `${accepter?.nickname ?? '相手'}さんがフレンド申請を承認しました`,
  })
  return f
}

export function declineFriendRequest(friendshipId) {
  const f = friendships.get(friendshipId)
  if (!f || f.status !== 'pending') return null
  friendships.remove(friendshipId)
  return f
}

// --- Team join flow ---

export function sendTeamJoinRequest(teamId, fromUserId) {
  const team = teams.get(teamId)
  if (!team) return null
  if (team.memberIds.includes(fromUserId)) return null
  const existing = teamRequests.findOutgoingJoin(fromUserId, teamId)
  if (existing) return existing
  const req = teamRequests.create({
    teamId,
    fromUserId,
    fromTeamId: null,
    kind: 'join',
    status: 'pending',
  })
  const from = users.get(fromUserId)
  notify(team.captainId, {
    type: 'team_join_request',
    fromUserId,
    content: `${from?.nickname ?? '誰か'}さんが「${team.name}」への加入を申請しています`,
    requestId: req.id,
  })
  return req
}

export function acceptTeamJoinRequest(requestId) {
  const req = teamRequests.get(requestId)
  if (!req || req.kind !== 'join' || req.status !== 'pending') return null
  const team = teams.get(req.teamId)
  if (!team) return null
  teams.addMember(req.teamId, req.fromUserId)
  teamRequests.accept(requestId)
  notify(req.fromUserId, {
    type: 'team_invite',
    fromUserId: team.captainId,
    content: `「${team.name}」への加入が承認されました`,
  })
  return req
}

export function declineTeamJoinRequest(requestId) {
  const req = teamRequests.get(requestId)
  if (!req || req.kind !== 'join' || req.status !== 'pending') return null
  teamRequests.decline(requestId)
  return req
}

// --- Friend team flow ---

export function sendFriendTeamRequest(fromTeamId, toTeamId) {
  if (fromTeamId === toTeamId) return null
  const fromTeam = teams.get(fromTeamId)
  const toTeam = teams.get(toTeamId)
  if (!fromTeam || !toTeam) return null
  if ((fromTeam.friendTeamIds || []).includes(toTeamId)) return null
  const existing = teamRequests.findOutgoingFriendTeam(fromTeamId, toTeamId)
  if (existing) return existing
  const req = teamRequests.create({
    teamId: toTeamId,
    fromUserId: fromTeam.captainId,
    fromTeamId,
    kind: 'friend_team',
    status: 'pending',
  })
  notify(toTeam.captainId, {
    type: 'friend_team_request',
    fromUserId: fromTeam.captainId,
    content: `「${fromTeam.name}」からフレンドチーム申請が届きました`,
    requestId: req.id,
  })
  return req
}

export function acceptFriendTeamRequest(requestId) {
  const req = teamRequests.get(requestId)
  if (!req || req.kind !== 'friend_team' || req.status !== 'pending') return null
  teams.addFriendTeam(req.fromTeamId, req.teamId)
  teamRequests.accept(requestId)
  const toTeam = teams.get(req.teamId)
  notify(req.fromUserId, {
    type: 'friend_team_request',
    fromUserId: toTeam?.captainId ?? null,
    content: `「${toTeam?.name ?? 'チーム'}」がフレンドチーム申請を承認しました`,
  })
  return req
}

export function declineFriendTeamRequest(requestId) {
  const req = teamRequests.get(requestId)
  if (!req || req.kind !== 'friend_team' || req.status !== 'pending') return null
  teamRequests.decline(requestId)
  return req
}
