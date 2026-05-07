// プロフィールスタンプ。各エントリは画像（image）と名前（name）を持つ。
// 旧仕様の絵文字 label は後方互換のためフォールバックとして残置。

import boyCheer from '../assets/avatars/boy_cheer.png'
import boyWink from '../assets/avatars/boy_wink.png'
import boyFire from '../assets/avatars/boy_fire.png'
import girlCheer from '../assets/avatars/girl_cheer.png'
import girlWink from '../assets/avatars/girl_wink.png'
import girlFire from '../assets/avatars/girl_fire.png'

export const STAMPS = [
  { id: 'boy_cheer', image: boyCheer, label: '🙌', name: '男の子・ガッツポーズ' },
  { id: 'boy_wink', image: boyWink, label: '👍', name: '男の子・ウインク' },
  { id: 'boy_fire', image: boyFire, label: '🔥', name: '男の子・気合' },
  { id: 'girl_cheer', image: girlCheer, label: '🙌', name: '女の子・ガッツポーズ' },
  { id: 'girl_wink', image: girlWink, label: '👍', name: '女の子・ウインク' },
  { id: 'girl_fire', image: girlFire, label: '🔥', name: '女の子・気合' },
]

export function getStamp(id) {
  return STAMPS.find((s) => s.id === id) || STAMPS[0]
}
