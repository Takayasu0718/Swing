// デモモード用のモックデータ。SNS 用スクリーンショットの populated 画面を
// 作るためにのみ使用。Firestore には書き込まれない。
//
// 関数は myUid（現ログインユーザー）を受け取り、その人を中心とした
// もっともらしいチーム・通知・ランキングを返す。

import { getStampsForRole } from './stamps.js'

const PLAYER_STAMP_IDS = getStampsForRole('player').map((s) => s.id)

const NAMES = [
  'たくみ',
  'りんたろう',
  'みゆ',
  'こうた',
  'さき',
  'はると',
  'あかり',
  'ゆうま',
  'のあ',
  'すずか',
]

export const DEMO_TEAM_ID = 'demo-team-1'

// 10名のチームメイト
export const DEMO_USERS = NAMES.map((nickname, i) => ({
  uid: `demo-uid-${i + 1}`,
  nickname,
  userId: `demo${i + 1}`,
  avatarStamp: PLAYER_STAMP_IDS[i % PLAYER_STAMP_IDS.length],
  role: 'player',
  dailyGoal: 50 + (i % 3) * 25,
  teamName: 'スイングドラゴンズ',
}))

export function buildDemoUsersByUid() {
  const map = {}
  for (const u of DEMO_USERS) map[u.uid] = u
  return map
}

export function buildDemoFriendships(myUid) {
  return DEMO_USERS.map((u, i) => ({
    id: `demo-friendship-${i + 1}`,
    fromUid: myUid,
    toUid: u.uid,
    participants: [myUid, u.uid].sort(),
    status: 'accepted',
  }))
}

export function buildDemoTeam(myUid) {
  return {
    id: DEMO_TEAM_ID,
    name: 'スイングドラゴンズ',
    description: '毎日コツコツ素振り続けてます！',
    prefecture: '東京都',
    municipality: '渋谷区',
    handle: 'swing_dragons',
    handleLower: 'swing_dragons',
    captainId: myUid,
    memberIds: [myUid, ...DEMO_USERS.map((u) => u.uid)],
    friendTeamIds: [],
    nextMatch: {
      tournament: '春季大会予選',
      opponent: 'ライバルズ',
      date: '2026-06-01',
      location: '〇〇グラウンド',
    },
    matches: [
      {
        id: 'demo-match-1',
        opponent: 'ビートルズ',
        score: '7-2',
        result: 'win',
        mvpPlayerId: DEMO_USERS[2].uid,
        mvpReason: '逆転打',
        date: '2026-05-10',
        createdAt: '2026-05-10T12:00:00.000Z',
      },
    ],
  }
}

// 通知 8件（種類バラエティ豊か、新着→古い順）
export function buildDemoNotifications(myUid) {
  const now = Date.now()
  return [
    {
      id: 'demo-n-1',
      source: 'fs',
      userId: myUid,
      type: 'like',
      fromUserId: DEMO_USERS[0].uid,
      content: `${DEMO_USERS[0].nickname}さん他4名がいいねをくれました`,
      likeTargetKey: 'activity:demo-1',
      fromUserNickname: DEMO_USERS[0].nickname,
      activityId: null,
      requestId: null,
      likeUserIds: [],
      read: false,
      processed: false,
      createdAt: new Date(now - 4 * 60 * 1000).toISOString(),
    },
    {
      id: 'demo-n-2',
      source: 'fs',
      userId: myUid,
      type: 'mvp_selected',
      fromUserId: DEMO_USERS[2].uid,
      content: `${DEMO_USERS[2].nickname}さんがビートルズ戦のMVPに選ばれました！おめでとうございます！`,
      likeTargetKey: null,
      fromUserNickname: DEMO_USERS[2].nickname,
      activityId: null,
      requestId: null,
      likeUserIds: [],
      read: false,
      processed: false,
      createdAt: new Date(now - 35 * 60 * 1000).toISOString(),
    },
    {
      id: 'demo-n-3',
      source: 'fs',
      userId: myUid,
      type: 'streak_milestone',
      fromUserId: DEMO_USERS[4].uid,
      content: `${DEMO_USERS[4].nickname}さんが連続10日達成！おめでとう！`,
      likeTargetKey: null,
      fromUserNickname: DEMO_USERS[4].nickname,
      activityId: null,
      requestId: null,
      likeUserIds: [],
      read: false,
      processed: false,
      createdAt: new Date(now - 2 * 3600 * 1000).toISOString(),
    },
    {
      id: 'demo-n-4',
      source: 'fs',
      userId: myUid,
      type: 'friend_request',
      fromUserId: 'demo-extra-uid',
      content: '新人レフトさんからフレンド申請が届きました',
      requestId: 'demo-req-1',
      likeTargetKey: null,
      fromUserNickname: '新人レフト',
      activityId: null,
      likeUserIds: [],
      read: false,
      processed: false,
      createdAt: new Date(now - 4 * 3600 * 1000).toISOString(),
    },
    {
      id: 'demo-n-5',
      source: 'fs',
      userId: myUid,
      type: 'swing_complete',
      fromUserId: DEMO_USERS[6].uid,
      content: `${DEMO_USERS[6].nickname}さんが今日の素振りミッションを達成しました！`,
      likeTargetKey: null,
      fromUserNickname: DEMO_USERS[6].nickname,
      activityId: null,
      requestId: null,
      likeUserIds: [],
      read: true,
      processed: false,
      createdAt: new Date(now - 8 * 3600 * 1000).toISOString(),
    },
    {
      id: 'demo-n-6',
      source: 'fs',
      userId: myUid,
      type: 'like',
      fromUserId: DEMO_USERS[3].uid,
      content: `${DEMO_USERS[3].nickname}さんがいいねをくれました`,
      likeTargetKey: 'chat:demo:demo-c-4',
      fromUserNickname: DEMO_USERS[3].nickname,
      activityId: null,
      requestId: null,
      likeUserIds: [],
      read: false,
      processed: false,
      createdAt: new Date(now - 10 * 3600 * 1000).toISOString(),
    },
    {
      id: 'demo-n-7',
      source: 'fs',
      userId: myUid,
      type: 'goal_raised',
      fromUserId: DEMO_USERS[1].uid,
      content: `${DEMO_USERS[1].nickname}さんが目標回数を100回にアップしました`,
      likeTargetKey: null,
      fromUserNickname: DEMO_USERS[1].nickname,
      activityId: null,
      requestId: null,
      likeUserIds: [],
      read: true,
      processed: false,
      createdAt: new Date(now - 22 * 3600 * 1000).toISOString(),
    },
    {
      id: 'demo-n-8',
      source: 'fs',
      userId: myUid,
      type: 'trial_request',
      fromUserId: null,
      content: '「ライバルズ」の体験会・助っ人参加のお願いが受付開始されました',
      likeTargetKey: null,
      fromUserNickname: null,
      activityId: null,
      requestId: null,
      likeUserIds: [],
      read: true,
      processed: false,
      createdAt: new Date(now - 36 * 3600 * 1000).toISOString(),
    },
  ]
}

// チームチャット 5件
export function buildDemoTeamChat(myUid) {
  const now = Date.now()
  return [
    {
      id: 'demo-c-1',
      teamId: DEMO_TEAM_ID,
      userId: DEMO_USERS[0].uid,
      content: '今日も練習頑張ろう！',
      likeUserIds: [DEMO_USERS[1].uid, myUid],
      createdAt: new Date(now - 2 * 3600 * 1000).toISOString(),
    },
    {
      id: 'demo-c-2',
      teamId: DEMO_TEAM_ID,
      userId: DEMO_USERS[1].uid,
      content: '昨日の試合勝てた！全員ナイスバッティング🔥',
      likeUserIds: [DEMO_USERS[2].uid, DEMO_USERS[3].uid, myUid, DEMO_USERS[5].uid],
      createdAt: new Date(now - 90 * 60 * 1000).toISOString(),
    },
    {
      id: 'demo-c-3',
      teamId: DEMO_TEAM_ID,
      userId: DEMO_USERS[4].uid,
      content: '今日100回素振り達成しました！',
      likeUserIds: [myUid, DEMO_USERS[0].uid, DEMO_USERS[7].uid],
      createdAt: new Date(now - 50 * 60 * 1000).toISOString(),
    },
    {
      id: 'demo-c-4',
      teamId: DEMO_TEAM_ID,
      userId: myUid,
      content: 'みんなナイス！明日も頑張ろう',
      likeUserIds: [DEMO_USERS[5].uid, DEMO_USERS[6].uid, DEMO_USERS[7].uid, DEMO_USERS[8].uid],
      createdAt: new Date(now - 20 * 60 * 1000).toISOString(),
    },
    {
      id: 'demo-c-5',
      teamId: DEMO_TEAM_ID,
      userId: DEMO_USERS[7].uid,
      content: '今週末練習試合あるよ〜！集合場所あとで連絡します',
      likeUserIds: [],
      createdAt: new Date(now - 5 * 60 * 1000).toISOString(),
    },
  ]
}

// チームメイトのアクティビティ feed
export function buildDemoTeamActivities() {
  const now = Date.now()
  return DEMO_USERS.slice(0, 8).map((u, i) => ({
    id: `demo-a-${i + 1}`,
    source: 'fs',
    userId: u.uid,
    type: i % 4 === 1 ? 'swing_achieved' : 'swing_achieved',
    content:
      i % 5 === 1
        ? `連続${5 + i}日達成！！`
        : i % 5 === 2
          ? `ドラゴンが進化！ Lv.${4 + i} になった！`
          : '今日の素振りミッションを達成！',
    teamId: DEMO_TEAM_ID,
    likeUserIds:
      i % 2 === 0
        ? [DEMO_USERS[(i + 1) % 10].uid, DEMO_USERS[(i + 3) % 10].uid]
        : [],
    createdAt: new Date(now - (i + 1) * 1800 * 1000).toISOString(),
  }))
}

// チームランキング（直近7日 / 素振り合計）
export function buildDemoTeamRanking(myUid, myProfile) {
  const base = DEMO_USERS.map((u, i) => ({
    uid: u.uid,
    nickname: u.nickname,
    avatarStamp: u.avatarStamp,
    totalSwing: 1320 - i * 75 - (i % 3) * 12,
  }))
  base.push({
    uid: myUid,
    nickname: myProfile?.nickname || 'あなた',
    avatarStamp: myProfile?.avatarStamp || PLAYER_STAMP_IDS[0],
    totalSwing: 1180,
  })
  return base.sort((a, b) => b.totalSwing - a.totalSwing)
}

// 全ユーザーランキング（HomeScreen 用、チームメイト + 数名）
export function buildDemoAllUsersRanking(myUid, myProfile) {
  return buildDemoTeamRanking(myUid, myProfile).slice(0, 10)
}

// チーム達成率（本日90% / 7日78% で盛り上がり感）
export const DEMO_TEAM_STATS = {
  todayRate: 0.9,
  weekRate: 0.78,
}
