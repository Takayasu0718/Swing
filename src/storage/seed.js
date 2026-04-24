// Seeds mock data once per device so friends / team / notification screens
// have something to display in B-mode (no backend). Idempotent: re-running is a no-op.

import { users, teams, friendships, activities, chats, notifications } from './storage.js'
import { ACTIVITY_TYPES } from './schema.js'

const MOCK_FLAG = { mock: true }

function hoursAgo(h) {
  return new Date(Date.now() - h * 3600 * 1000).toISOString()
}

function daysAgo(d) {
  return new Date(Date.now() - d * 24 * 3600 * 1000).toISOString()
}

// Sakuradai Sunbird roster — all 16 are friends of the current user AND teammates.
const SUNBIRD_ROSTER = [
  { nickname: 'りくた', avatarStamp: 'fire', dailyGoal: 100 },
  { nickname: 'けい', avatarStamp: 'star', dailyGoal: 75 },
  { nickname: 'みもり', avatarStamp: 'muscle', dailyGoal: 125 },
  { nickname: 'ほくと', avatarStamp: 'target', dailyGoal: 50 },
  { nickname: 'えいた', avatarStamp: 'crown', dailyGoal: 150 },
  { nickname: 'りんたろう', avatarStamp: 'dragon', dailyGoal: 100 },
  { nickname: 'そうた', avatarStamp: 'baseball', dailyGoal: 75 },
  { nickname: 'はじめ', avatarStamp: 'bat', dailyGoal: 100 },
  { nickname: 'ちなつ', avatarStamp: 'fire', dailyGoal: 50 },
  { nickname: 'ゆう', avatarStamp: 'star', dailyGoal: 75 },
  { nickname: 'こう', avatarStamp: 'muscle', dailyGoal: 150 },
  { nickname: 'そら', avatarStamp: 'target', dailyGoal: 100 },
  { nickname: 'いつき', avatarStamp: 'crown', dailyGoal: 125 },
  { nickname: 'かい', avatarStamp: 'dragon', dailyGoal: 75 },
  { nickname: 'そう', avatarStamp: 'baseball', dailyGoal: 100 },
  { nickname: 'けんた', avatarStamp: 'bat', dailyGoal: 100 },
]

export function seedIfNeeded() {
  const me = users.getCurrent()
  if (!me) return
  if (users.list().some((u) => u.mock)) return

  // --- Sakuradai Sunbird roster ---
  const roster = SUNBIRD_ROSTER.map((p) =>
    users.create({ ...MOCK_FLAG, role: 'player', ...p }),
  )
  const byName = Object.fromEntries(roster.map((u) => [u.nickname, u]))

  // --- Demo team captains ---
  const phoenixCaptain = users.create({
    ...MOCK_FLAG,
    nickname: 'れん',
    avatarStamp: 'crown',
    role: 'player',
    dailyGoal: 125,
  })
  const easternCaptain = users.create({
    ...MOCK_FLAG,
    nickname: 'だいき',
    avatarStamp: 'fire',
    role: 'player',
    dailyGoal: 150,
  })
  const hazawaCaptain = users.create({
    ...MOCK_FLAG,
    nickname: 'そうご',
    avatarStamp: 'star',
    role: 'player',
    dailyGoal: 100,
  })

  // --- Demo teams (searchable/applyable) ---
  teams.create({
    mock: true,
    name: 'イースタンボーイズ',
    description: '東エリアの強豪チーム',
    captainId: easternCaptain.id,
    memberIds: [easternCaptain.id],
    friendTeamIds: [],
    nextMatch: null,
    matches: [],
  })
  teams.create({
    mock: true,
    name: '羽沢フォースターズ',
    description: '四つ星の意志で勝つ！',
    captainId: hazawaCaptain.id,
    memberIds: [hazawaCaptain.id],
    friendTeamIds: [],
    nextMatch: null,
    matches: [],
  })
  const phoenixTeam = teams.create({
    mock: true,
    name: 'ブルーフェニックス',
    description: '青い炎のチーム',
    captainId: phoenixCaptain.id,
    memberIds: [phoenixCaptain.id],
    friendTeamIds: [],
    nextMatch: null,
    matches: [],
  })

  const myTeam = teams.create({
    mock: true,
    name: '桜台さんバード',
    description: '毎日コツコツ素振りで強くなるチーム！',
    captainId: me.id,
    memberIds: [me.id, ...roster.map((u) => u.id)],
    friendTeamIds: [phoenixTeam.id],
    nextMatch: {
      tournament: '市民大会 予選',
      date: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      opponent: 'レッドファイヤーズ',
    },
    matches: [
      {
        id: 'seed-match-1',
        opponent: 'ブルーフェニックス',
        score: '7-2',
        result: 'win',
        mvpPlayerId: byName['りくた'].id,
        mvpReason: '決勝タイムリーの一発',
        date: daysAgo(14).slice(0, 10),
        createdAt: daysAgo(14),
      },
    ],
  })

  // --- Friendships: all accepted except けんた (pending, to demo friend request UI) ---
  let kentaFriendshipId = null
  roster.forEach((u) => {
    if (u.nickname === 'けんた') {
      const f = friendships.create({ fromUserId: u.id, toUserId: me.id, status: 'pending' })
      kentaFriendshipId = f.id
    } else {
      friendships.create({ fromUserId: me.id, toUserId: u.id, status: 'accepted' })
    }
  })

  // --- Activities ---
  activities.create({
    userId: byName['りくた'].id,
    type: ACTIVITY_TYPES.SWING_ACHIEVED,
    content: '今日も100回の素振り達成！',
    teamId: myTeam.id,
    likeUserIds: [me.id],
    createdAt: hoursAgo(2),
  })
  activities.create({
    userId: byName['けい'].id,
    type: ACTIVITY_TYPES.LEVEL_UP,
    content: 'スイングドラゴンが Lv.5 になった！',
    teamId: myTeam.id,
    likeUserIds: [],
    createdAt: hoursAgo(5),
  })
  activities.create({
    userId: byName['そら'].id,
    type: ACTIVITY_TYPES.GOAL_RAISED,
    content: '目標回数を100回にアップ！',
    teamId: myTeam.id,
    likeUserIds: [me.id, byName['りくた'].id],
    createdAt: hoursAgo(9),
  })
  activities.create({
    userId: byName['ほくと'].id,
    type: ACTIVITY_TYPES.SWING_ACHIEVED,
    content: '連続10日達成！！',
    teamId: myTeam.id,
    likeUserIds: [byName['けい'].id, me.id],
    createdAt: daysAgo(1),
  })
  activities.create({
    userId: byName['はじめ'].id,
    type: ACTIVITY_TYPES.POST,
    content: '今日は雨だから素振りはお休み。明日がんばる！',
    teamId: myTeam.id,
    likeUserIds: [],
    createdAt: daysAgo(2),
  })

  // --- Team chat ---
  chats.post({ teamId: myTeam.id, userId: byName['りくた'].id, content: 'おはよう！今日も素振りしよう' })
  chats.post({ teamId: myTeam.id, userId: byName['けい'].id, content: '行ってきます💪' })
  chats.post({ teamId: myTeam.id, userId: byName['そう'].id, content: '今週末の試合、頑張ろう！' })

  // --- Notifications to current user (mix unread/read) ---
  notifications.create({
    userId: me.id,
    type: 'friend_request',
    fromUserId: byName['けんた'].id,
    content: `${byName['けんた'].nickname}さんからフレンド申請が届きました`,
    requestId: kentaFriendshipId,
    read: false,
    createdAt: hoursAgo(1),
  })
  notifications.create({
    userId: me.id,
    type: 'like',
    fromUserId: byName['りくた'].id,
    content: `${byName['りくた'].nickname}さんがあなたの今日の素振り達成にいいねしました`,
    read: false,
    createdAt: hoursAgo(3),
  })
  notifications.create({
    userId: me.id,
    type: 'team_invite',
    fromUserId: phoenixCaptain.id,
    content: 'ブルーフェニックスからチーム招待が届きました',
    read: false,
    createdAt: hoursAgo(8),
  })
  notifications.create({
    userId: me.id,
    type: 'goal_raised',
    fromUserId: byName['そら'].id,
    content: `${byName['そら'].nickname}さんが目標回数を100回にアップしました`,
    read: true,
    createdAt: daysAgo(1),
  })
  notifications.create({
    userId: me.id,
    type: 'streak_milestone',
    fromUserId: byName['ほくと'].id,
    content: `${byName['ほくと'].nickname}さんが連続10日達成！おめでとう！`,
    read: true,
    createdAt: daysAgo(2),
  })
}
