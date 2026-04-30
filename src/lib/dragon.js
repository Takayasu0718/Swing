// Dragon level / evolution spec.
// Lv 1-20: 累積達成日数で進捗（連続でなくてOK）。1Lv あたり 3 日。
// Lv 21+:  最長連続達成（longest streak）で進捗。1Lv あたり 3 日。
//          → ストリークが途切れても進化レベルは下がらない。
// 進化段階・属性は DRAGON_LEVEL_TABLE で定義。

import stage1 from '../assets/dragon/stage1.png'
import stage2 from '../assets/dragon/stage2.svg'
import stage3 from '../assets/dragon/stage3.svg'

export const DRAGON_LEVEL_TABLE = [
  { min: 1, max: 10, stage: 'ベビー', element: null, condition: '3日達成' },
  { min: 11, max: 20, stage: 'チャイルド', element: null, condition: '3日達成' },
  { min: 21, max: 30, stage: 'ティーン', element: null, condition: '3日連続達成' },

  { min: 31, max: 40, stage: 'アダルト', element: '火', condition: '3日連続達成' },
  { min: 41, max: 50, stage: 'アダルト', element: '雷', condition: '3日連続達成' },
  { min: 51, max: 60, stage: 'アダルト', element: '氷', condition: '3日連続達成' },
  { min: 61, max: 70, stage: 'アダルト', element: '光', condition: '3日連続達成' },
  { min: 71, max: 80, stage: 'アダルト', element: '闇', condition: '3日連続達成' },
  { min: 81, max: 90, stage: 'アダルト', element: 'レジェンド', condition: '3日連続達成' },

  { min: 91, max: 100, stage: 'エルダー', element: '火', condition: '3日連続達成' },
  { min: 101, max: 110, stage: 'エルダー', element: '雷', condition: '3日連続達成' },
  { min: 111, max: 120, stage: 'エルダー', element: '氷', condition: '3日連続達成' },
  { min: 121, max: 130, stage: 'エルダー', element: '光', condition: '3日連続達成' },
  { min: 131, max: 140, stage: 'エルダー', element: '闇', condition: '3日連続達成' },
  { min: 141, max: 150, stage: 'エルダー', element: 'レジェンド', condition: '3日連続達成' },

  { min: 151, max: 160, stage: 'エンシェント', element: '火', condition: '3日連続達成' },
  { min: 161, max: 170, stage: 'エンシェント', element: '雷', condition: '3日連続達成' },
  { min: 171, max: 180, stage: 'エンシェント', element: '氷', condition: '3日連続達成' },
  { min: 181, max: 190, stage: 'エンシェント', element: '光', condition: '3日連続達成' },
  { min: 191, max: 200, stage: 'エンシェント', element: '闇', condition: '3日連続達成' },
  { min: 201, max: 210, stage: 'エンシェント', element: 'レジェンド', condition: '3日連続達成' },
]

export const MAX_DRAGON_LEVEL = 210
const LV20_DAYS_THRESHOLD = 57 // 3 * 19 = Lv20 到達に必要な累積達成日数
const STREAK_PER_LEVEL = 3

export function getDragonState(level) {
  return DRAGON_LEVEL_TABLE.find((r) => level >= r.min && level <= r.max) || null
}

// achievementDays: 累積達成日数 / longestStreak: 過去の最長連続達成日数
export function levelFromProgress(achievementDays, longestStreak = 0) {
  const days = Math.max(0, achievementDays | 0)
  const ls = Math.max(0, longestStreak | 0)
  if (days < 3) return 1
  if (days < LV20_DAYS_THRESHOLD) return Math.min(20, 1 + Math.floor(days / 3))
  // Lv20 到達後は最長連続達成 3 日ごとに +1
  const streakLevels = Math.floor(ls / STREAK_PER_LEVEL)
  return Math.min(MAX_DRAGON_LEVEL, 20 + streakLevels)
}

// 次のレベルまで残り何日（達成日数 or 連続達成日数）
export function daysUntilNextLevel(achievementDays, longestStreak = 0) {
  const days = Math.max(0, achievementDays | 0)
  const ls = Math.max(0, longestStreak | 0)
  const level = levelFromProgress(days, ls)
  if (level >= MAX_DRAGON_LEVEL) return 0
  if (level < 20) {
    // Lv N+1 に必要な累積達成日数 = 3 * N
    return Math.max(0, 3 * level - days)
  }
  // Lv 21+: 必要な最長連続達成日数 = 3 * (level - 20 + 1)
  const need = STREAK_PER_LEVEL * (level - 20 + 1)
  return Math.max(0, need - ls)
}

// 既存3画像 + アダルト以降は当面 stage3 を流用（後で属性別画像に差し替え）
const STAGE_IMAGES = {
  'ベビー': stage1,
  'チャイルド': stage2,
  'ティーン': stage3,
}

export function stageImage(level) {
  const st = getDragonState(level)
  return STAGE_IMAGES[st?.stage] || stage3
}

// stageIndex は events.js が「進化（ステージが切り替わったか）」判定に使っていた。
// 新しい段階一覧をインデックス化して同じ用途で使える形にする。
const STAGE_ORDER = ['ベビー', 'チャイルド', 'ティーン', 'アダルト', 'エルダー', 'エンシェント']
export function stageIndex(level) {
  const st = getDragonState(level)
  return st ? STAGE_ORDER.indexOf(st.stage) : 0
}
