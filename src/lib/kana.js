// Normalizes a string for cross-kana matching:
//   - Katakana -> Hiragana (0x30A1–0x30F6 shifted by -0x60)
//   - ASCII lowercase
// Long-mark "ー", numbers, and punctuation pass through unchanged.
export function normalizeJa(s) {
  if (!s) return ''
  return s
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
}

export function matchesJa(haystack, needle) {
  if (!needle) return false
  return normalizeJa(haystack).includes(normalizeJa(needle))
}
