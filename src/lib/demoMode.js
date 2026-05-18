// デモモード: SNS 用スクリーンショット撮影のためのフラグ。
// URL ?demo=1 で ON、?demo=0 で OFF。localStorage に永続化するので
// タブ切替・リロード後も維持される。
//
// 使い方:
//   ON:  https://swing-ecru.vercel.app/?demo=1
//   OFF: https://swing-ecru.vercel.app/?demo=0
//
// ON 中は friendships / team / notifications / ranking 等にモックデータが
// 注入され、Firestore へのアクセスをスキップする。

const KEY = 'swing-app:v1:demoMode'

export function syncDemoFromUrl() {
  if (typeof window === 'undefined') return
  try {
    const params = new URLSearchParams(window.location.search)
    const v = params.get('demo')
    if (v === '1') {
      localStorage.setItem(KEY, '1')
    } else if (v === '0') {
      localStorage.removeItem(KEY)
    }
  } catch {
    // ignore
  }
}

export function isDemoMode() {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

// 設定画面のトグルから呼び出す。
export function setDemoMode(on) {
  if (typeof window === 'undefined') return
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
