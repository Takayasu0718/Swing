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

export function seedIfNeeded() {
  const me = users.getCurrent()
  if (!me) return
  if (users.list().some((u) => u.mock)) return

  // --- Mock users (friends + teammates) ---
  const taro = users.create({
    ...MOCK_FLAG,
    nickname: 'たろう',
    avatarStamp: 'fire',
    role: 'player',
    dailyGoal: 100,
    email: 'taro@example.com',
  })
  const hana = users.create({
    ...MOCK_FLAG,
    nickname: 'はな',
    avatarStamp: 'star',
    role: 'player',
    dailyGoal: 75,
    email: 'hana@example.com',
  })
  const ken = users.create({
    ...MOCK_FLAG,
    nickname: 'けん',
    avatarStamp: 'muscle',
    role: 'player',
    dailyGoal: 150,
    email: 'ken@example.com',
  })
  const sara = users.create({
    ...MOCK_FLAG,
    nickname: 'さら',
    avatarStamp: 'target',
    role: 'player',
    dailyGoal: 50,
    email: 'sara@example.com',
  })
  const phoenixCaptain = users.create({
    ...MOCK_FLAG,
    nickname: 'れん',
    avatarStamp: 'crown',
    role: 'player',
    dailyGoal: 125,
  })

  // --- Teams ---
  const phoenixTeam = teams.create({
    mock: true,
    name: 'ブルーフェニックス',
    description: '青い炎のチーム',
    captainId: phoenixCaptain.id,
    memberIds: [phoenixCaptain.id, sara.id],
    friendTeamIds: [],
    nextMatch: null,
    matches: [],
  })

  const myTeam = teams.create({
    mock: true,
    name: 'スイングドラゴンズ',
    description: '毎日コツコツ素振りで強くなるチーム！',
    captainId: me.id,
    memberIds: [me.id, taro.id, hana.id],
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
        mvpPlayerId: taro.id,
        mvpReason: '決勝タイムリーの一発',
        date: daysAgo(14).slice(0, 10),
        createdAt: daysAgo(14),
      },
    ],
  })

  // --- Friendships ---
  friendships.create({ fromUserId: me.id, toUserId: taro.id, status: 'accepted' })
  friendships.create({ fromUserId: me.id, toUserId: hana.id, status: 'accepted' })
  friendships.create({ fromUserId: sara.id, toUserId: me.id, status: 'accepted' })
  friendships.create({ fromUserId: ken.id, toUserId: me.id, status: 'pending' })

  // --- Activities ---
  activities.create({
    userId: taro.id,
    type: ACTIVITY_TYPES.SWING_ACHIEVED,
    content: '今日も100回の素振り達成！',
    teamId: myTeam.id,
    likeUserIds: [me.id],
    createdAt: hoursAgo(2),
  })
  activities.create({
    userId: hana.id,
    type: ACTIVITY_TYPES.LEVEL_UP,
    content: 'スイングドラゴンが Lv.5 になった！',
    teamId: myTeam.id,
    likeUserIds: [],
    createdAt: hoursAgo(5),
  })
  activities.create({
    userId: sara.id,
    type: ACTIVITY_TYPES.GOAL_RAISED,
    content: '目標回数を50回にアップ！',
    teamId: null,
    likeUserIds: [me.id, taro.id],
    createdAt: hoursAgo(9),
  })
  activities.create({
    userId: taro.id,
    type: ACTIVITY_TYPES.SWING_ACHIEVED,
    content: '連続10日達成！！',
    teamId: myTeam.id,
    likeUserIds: [hana.id, me.id],
    createdAt: daysAgo(1),
  })
  activities.create({
    userId: hana.id,
    type: ACTIVITY_TYPES.POST,
    content: '今日は雨だから素振りはお休み。明日がんばる！',
    teamId: null,
    likeUserIds: [],
    createdAt: daysAgo(2),
  })

  // --- Team chat ---
  chats.post({ teamId: myTeam.id, userId: taro.id, content: 'おはよう！今日も素振りしよう' })
  chats.post({ teamId: myTeam.id, userId: hana.id, content: '行ってきます💪' })
  chats.post({ teamId: myTeam.id, userId: taro.id, content: '今週末の試合、頑張ろう！' })

  // --- Notifications to current user (mix unread/read) ---
  notifications.create({
    userId: me.id,
    type: 'friend_request',
    fromUserId: ken.id,
    content: `${ken.nickname}さんからフレンド申請が届きました`,
    read: false,
    createdAt: hoursAgo(1),
  })
  notifications.create({
    userId: me.id,
    type: 'like',
    fromUserId: taro.id,
    content: `${taro.nickname}さんがあなたのアクティビティにいいねしました`,
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
    fromUserId: sara.id,
    content: `${sara.nickname}さんが目標回数を50回にアップしました`,
    read: true,
    createdAt: daysAgo(1),
  })
  notifications.create({
    userId: me.id,
    type: 'streak_10',
    fromUserId: taro.id,
    content: `${taro.nickname}さんが連続10日達成！おめでとう！`,
    read: true,
    createdAt: daysAgo(2),
  })
}
