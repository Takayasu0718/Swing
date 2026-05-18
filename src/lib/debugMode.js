// デバッグモード: スクリーンショット用に数値を URL パラメータで自由に上書きできる。
// 例（全部いっぺんに）:
//   /?debug=1&lv=12&streak=15&days=85&longest=18&next=1
//      &todayswing=120&totalswing=2400&claim=1&approve=1&bs=80,60,75,70,40
//
// 個別:
//   - lv          : ユーザーレベル
//   - streak      : 現在の連続達成日数（〇日連続達成中！）
//   - days        : 累計達成日数
//   - longest     : 最長連続達成日数
//   - next        : 次のレベルまで残り日数（EXPバーの進捗計算）
//   - todayswing  : 今日の素振り回数
//   - totalswing  : 累計の素振り回数
//   - claim       : デイリーミッションを 1=達成済, 0=未達成
//   - approve     : 保護者承認 1=済, 0=未
//   - bs          : バッティングステータス 5値 "speed,lowerBody,course,timing,custom"
//
// 解除: /?debug=0 にアクセス（localStorage が空になる）

const KEY = 'swing-app:v1:debugMode'

export function syncDebugFromUrl() {
  if (typeof window === 'undefined') return
  try {
    const params = new URLSearchParams(window.location.search)
    const flag = params.get('debug')
    if (flag === '0') {
      localStorage.removeItem(KEY)
      return
    }
    if (flag !== '1') return
    const cfg = {}
    for (const k of [
      'lv', 'streak', 'days', 'longest', 'next',
      'todayswing', 'totalswing', 'claim', 'approve', 'bs',
    ]) {
      const v = params.get(k)
      if (v !== null) cfg[k] = v
    }
    localStorage.setItem(KEY, JSON.stringify(cfg))
  } catch {
    // ignore
  }
}

function getRaw() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function isDebugMode() {
  return getRaw() !== null
}

// 設定画面のフォームから呼び出す保存/取得/クリア。
export function setDebug(config) {
  if (typeof window === 'undefined') return
  try {
    const cleaned = {}
    for (const [k, v] of Object.entries(config || {})) {
      if (v === null || v === undefined || v === '') continue
      cleaned[k] = String(v)
    }
    if (Object.keys(cleaned).length === 0) {
      localStorage.removeItem(KEY)
    } else {
      localStorage.setItem(KEY, JSON.stringify(cleaned))
    }
  } catch {
    // ignore
  }
}

export function clearDebug() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

export function getCurrentDebug() {
  return getRaw()
}

// HomeScreen から呼び出す。各引数は通常時の計算結果。debug が無ければそのまま返す。
export function applyDebugOverrides(values) {
  const d = getRaw()
  if (!d) return values
  const out = { ...values }
  if (d.streak !== undefined) out.streak = Number(d.streak)
  if (d.days !== undefined) out.achievementDays = Number(d.days)
  if (d.longest !== undefined) out.longestStreak = Number(d.longest)
  if (d.lv !== undefined) out.level = Number(d.lv)
  if (d.next !== undefined) out.daysToNext = Number(d.next)
  if (d.todayswing !== undefined) out.todaySwingCount = Number(d.todayswing)
  if (d.totalswing !== undefined) out.totalSwingCount = Number(d.totalswing)
  if (d.claim !== undefined) out.childClaimed = d.claim === '1'
  if (d.approve !== undefined) {
    out.completed = d.approve === '1'
    if (out.completed) out.childClaimed = true
  }
  if (d.bs !== undefined) {
    const parts = String(d.bs).split(',').map((s) => Number(s) || 0)
    const [speed = 0, lowerBody = 0, course = 0, timing = 0, custom = 0] = parts
    out.battingStatus = { speed, lowerBody, course, timing, custom }
  }
  return out
}
