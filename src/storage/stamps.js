// Profile stamps — lightweight glyphs for MVP. Replace with SVG/PNG assets later
// by changing `render` per stamp without touching call sites.

export const STAMPS = [
  { id: 'smile', label: '☺️', name: 'スマイル' },
  { id: 'wink', label: '😉', name: 'ウインク' },
  { id: 'love', label: '😍', name: 'ラブ' },
  { id: 'kiss', label: '😘', name: 'キス' },
  { id: 'shy', label: '🤭', name: 'てへ' },
  { id: 'tear', label: '🥹', name: 'うるうる' },
  { id: 'think', label: '🤔', name: 'かんがえ' },
  { id: 'side', label: '🙄', name: 'よそ見' },
]

export function getStamp(id) {
  return STAMPS.find((s) => s.id === id) || STAMPS[0]
}
