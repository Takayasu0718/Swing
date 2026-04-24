// Rough relative-time formatter for Japanese UI.
export function relativeTime(iso) {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'たった今'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}分前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}時間前`
  const d = Math.floor(hr / 24)
  if (d < 30) return `${d}日前`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}ヶ月前`
  return `${Math.floor(mo / 12)}年前`
}
