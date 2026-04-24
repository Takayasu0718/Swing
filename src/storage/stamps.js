// Profile stamps — lightweight glyphs for MVP. Replace with SVG/PNG assets later
// by changing `render` per stamp without touching call sites.

export const STAMPS = [
  { id: 'baseball', label: '⚾', name: 'ボール' },
  { id: 'bat', label: '🏏', name: 'バット' },
  { id: 'dragon', label: '🐉', name: 'ドラゴン' },
  { id: 'star', label: '⭐', name: 'スター' },
  { id: 'fire', label: '🔥', name: 'ファイヤー' },
  { id: 'muscle', label: '💪', name: 'マッスル' },
  { id: 'target', label: '🎯', name: 'ターゲット' },
  { id: 'crown', label: '👑', name: 'クラウン' },
]

export function getStamp(id) {
  return STAMPS.find((s) => s.id === id) || STAMPS[0]
}
