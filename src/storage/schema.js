// Data schemas — shaped to match Firestore/Supabase collection docs.
// Screens must never touch localStorage directly; go through storage.js.

/**
 * @typedef {'player' | 'coach' | 'guardian'} Role
 *   - player: 選手
 *   - coach: 監督・コーチ
 *   - guardian: 保護者
 */

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} email
 * @property {string} nickname
 * @property {string} avatarStamp     // stamp id (see STAMPS in stamps.js)
 * @property {Role}   role
 * @property {number|null} dailyGoal  // player only: 25/50/75/.../200
 * @property {string}      advice     // coach only
 * @property {string[]}    childIds   // guardian -> child user ids
 * @property {string|null} guardianId // player -> guardian user id
 * @property {string}  createdAt
 * @property {string}  updatedAt
 */

/**
 * @typedef {Object} SwingRecord
 * @property {string} id
 * @property {string} userId
 * @property {string} date       // 'YYYY-MM-DD'
 * @property {number} count
 * @property {string} createdAt
 */

/**
 * @typedef {Object} DailyMission
 * @property {string}  id           // `${userId}_${date}`
 * @property {string}  userId
 * @property {string}  date         // 'YYYY-MM-DD'
 * @property {number}  goal         // snapshot of user's dailyGoal at creation
 * @property {boolean} childClaimed // 子供の「達成」ボタンが押された
 * @property {string|null} claimedAt
 * @property {boolean} completed    // 保護者承認済み = 最終 達成
 * @property {string|null} approvedAt
 */

/**
 * @typedef {Object} Team
 * @property {string}   id
 * @property {string}   name
 * @property {string}   description
 * @property {string}   captainId
 * @property {string[]} memberIds
 * @property {string[]} friendTeamIds
 * @property {NextMatch|null} nextMatch
 * @property {MatchResult[]}  matches
 */

/**
 * @typedef {Object} NextMatch
 * @property {string} tournament
 * @property {string} date        // 'YYYY-MM-DD'
 * @property {string} opponent
 */

/**
 * @typedef {Object} MatchResult
 * @property {string} id
 * @property {string} opponent
 * @property {string} score        // '7-2'
 * @property {'win'|'lose'|'draw'} result
 * @property {string} mvpPlayerId
 * @property {string} mvpReason    // <= 15 chars
 * @property {string} date
 */

/**
 * @typedef {Object} Friendship
 * @property {string} id
 * @property {string} fromUserId
 * @property {string} toUserId
 * @property {'pending'|'accepted'} status
 * @property {string} createdAt
 */

/**
 * @typedef {Object} Notification
 * @property {string} id
 * @property {string} userId       // recipient
 * @property {'swing_complete'|'streak_milestone'|'like'|'friend_request'|'friend_accepted'|'team_invite'|'team_join_request'|'goal_raised'|'friend_team_request'} type
 * @property {string|null} requestId // friendshipId or teamRequestId (for actionable notifications)
 * @property {string|null} fromUserId
 * @property {string} content
 * @property {boolean} read
 * @property {string} createdAt
 */

export const ROLES = Object.freeze({
  PLAYER: 'player',
  COACH: 'coach',
  GUARDIAN: 'guardian',
})

export const ROLE_LABELS = Object.freeze({
  player: '選手',
  coach: '監督・コーチ',
  guardian: '保護者',
})

export const DAILY_GOAL_OPTIONS = Object.freeze([25, 50, 75, 100, 125, 150, 175, 200])

export const ACTIVITY_TYPES = Object.freeze({
  SWING_ACHIEVED: 'swing_achieved',
  LEVEL_UP: 'level_up',
  GOAL_RAISED: 'goal_raised',
  MATCH_RESULT: 'match_result',
  POST: 'post',
})

/**
 * @typedef {Object} Activity
 * @property {string} id
 * @property {string} userId          // actor
 * @property {'swing_achieved'|'level_up'|'goal_raised'|'match_result'|'post'} type
 * @property {string} content
 * @property {string|null} teamId     // team-scoped activities
 * @property {string[]} likeUserIds
 * @property {string} createdAt
 */

/**
 * @typedef {Object} TeamRequest
 * @property {string} id
 * @property {string} teamId                // target team receiving the request
 * @property {string} fromUserId            // applicant (join) or source team's captain (friend_team)
 * @property {string|null} fromTeamId       // for friend_team requests
 * @property {'join'|'friend_team'} kind
 * @property {'pending'|'accepted'|'declined'} status
 * @property {string} createdAt
 */

/**
 * @typedef {Object} ChatMessage
 * @property {string} id
 * @property {string} teamId
 * @property {string} userId
 * @property {string} content
 * @property {string[]} likeUserIds
 * @property {string} createdAt
 */

export const NOTIFICATION_TYPES = Object.freeze([
  { key: 'swing_complete', label: '素振り完了通知' },
  { key: 'streak_milestone', label: '連続達成通知（5日毎）' },
  { key: 'like', label: 'いいね通知' },
  { key: 'friend_request', label: 'フレンド申請通知' },
  { key: 'friend_accepted', label: 'フレンド承認通知' },
  { key: 'team_invite', label: 'チーム招待通知' },
  { key: 'team_join_request', label: 'チーム加入申請通知' },
  { key: 'friend_team_request', label: 'フレンドチーム申請通知' },
  { key: 'goal_raised', label: '目標回数アップ通知' },
  { key: 'mvp_selected', label: 'MVP選出通知' },
  { key: 'goal_reminder', label: '目標リマインダー（20時）' },
])

export const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze(
  NOTIFICATION_TYPES.reduce((acc, t) => {
    acc[t.key] = true
    return acc
  }, {}),
)

export const DISPLAY_SETTINGS = Object.freeze([
  { key: 'showAllUserRanking', label: '全ユーザーランキングを表示' },
])

export const DEFAULT_DISPLAY_SETTINGS = Object.freeze(
  DISPLAY_SETTINGS.reduce((acc, t) => {
    acc[t.key] = true
    return acc
  }, {}),
)
