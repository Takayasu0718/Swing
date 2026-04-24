// Level progression: days required to advance to level N from N-1.
//   N 2..10 -> 3 days   (27 cumulative to reach 10)
//   N 11..20 -> 4 days  (67 cumulative to reach 20)
//   N 21+   -> 5 days
// Evolution image changes every 10 levels.

import stage1 from '../assets/dragon/stage1.svg'
import stage2 from '../assets/dragon/stage2.svg'
import stage3 from '../assets/dragon/stage3.svg'

const STAGE_IMAGES = [stage1, stage2, stage3]
const STAGE_LABELS = ['ベビー', 'チャイルド', 'ティーン']

export function daysRequiredToLevel(level) {
  if (level <= 1) return 0
  if (level <= 10) return 3
  if (level <= 20) return 4
  return 5
}

export function totalDaysToReach(level) {
  if (level <= 1) return 0
  if (level <= 10) return 3 * (level - 1)
  if (level <= 20) return 27 + 4 * (level - 10)
  return 67 + 5 * (level - 20)
}

export function levelFromDays(days) {
  if (days < 3) return 1
  if (days < 27) return 1 + Math.floor(days / 3)
  if (days < 67) return 10 + Math.floor((days - 27) / 4)
  return 20 + Math.floor((days - 67) / 5)
}

export function daysUntilNextLevel(days) {
  const level = levelFromDays(days)
  return Math.max(0, totalDaysToReach(level + 1) - days)
}

export function stageIndex(level) {
  if (level <= 10) return 0
  if (level <= 20) return 1
  return 2
}

export function stageImage(level) {
  return STAGE_IMAGES[Math.min(stageIndex(level), STAGE_IMAGES.length - 1)]
}

export function stageLabel(level) {
  return STAGE_LABELS[stageIndex(level)] || 'エルダー'
}
