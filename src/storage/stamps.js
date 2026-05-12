// プロフィールスタンプ。各エントリは画像（image）と名前（name）を持つ。
// 旧仕様の絵文字 label は後方互換のためフォールバックとして残置。
// roles: このスタンプを選択肢として出す対象ロール。'player' / 'coach' / 'trial'。

import boyCheer from '../assets/avatars/boy_cheer.png'
import boyWink from '../assets/avatars/boy_wink.png'
import boyFire from '../assets/avatars/boy_fire.png'
import boyFocus from '../assets/avatars/boy_focus.png'
import girlCheer from '../assets/avatars/girl_cheer.png'
import girlWink from '../assets/avatars/girl_wink.png'
import girlFire from '../assets/avatars/girl_fire.png'
import girlFocus from '../assets/avatars/girl_focus.png'
import coachMaleCheer from '../assets/avatars/coach_male_cheer.png'
import coachMaleCool from '../assets/avatars/coach_male_cool.png'
import coachMaleSenior from '../assets/avatars/coach_male_senior.png'
import coachFemaleCheer from '../assets/avatars/coach_female_cheer.png'
import coachFemaleSenior from '../assets/avatars/coach_female_senior.png'

const PLAYER_ROLES = ['player', 'trial']
const COACH_ROLES = ['coach']

export const STAMPS = [
  { id: 'boy_cheer', image: boyCheer, label: '🙌', name: '男の子・ガッツポーズ', roles: PLAYER_ROLES },
  { id: 'boy_wink', image: boyWink, label: '👍', name: '男の子・ウインク', roles: PLAYER_ROLES },
  { id: 'boy_fire', image: boyFire, label: '🔥', name: '男の子・気合', roles: PLAYER_ROLES },
  { id: 'boy_focus', image: boyFocus, label: '🙏', name: '男の子・集中', roles: PLAYER_ROLES },
  { id: 'girl_cheer', image: girlCheer, label: '🙌', name: '女の子・ガッツポーズ', roles: PLAYER_ROLES },
  { id: 'girl_wink', image: girlWink, label: '👍', name: '女の子・ウインク', roles: PLAYER_ROLES },
  { id: 'girl_fire', image: girlFire, label: '🔥', name: '女の子・気合', roles: PLAYER_ROLES },
  { id: 'girl_focus', image: girlFocus, label: '🙏', name: '女の子・集中', roles: PLAYER_ROLES },
  { id: 'coach_male_cheer', image: coachMaleCheer, label: '📣', name: 'コーチ・男性（元気）', roles: COACH_ROLES },
  { id: 'coach_male_cool', image: coachMaleCool, label: '😎', name: 'コーチ・男性（クール）', roles: COACH_ROLES },
  { id: 'coach_male_senior', image: coachMaleSenior, label: '👴', name: 'コーチ・男性（ベテラン）', roles: COACH_ROLES },
  { id: 'coach_female_cheer', image: coachFemaleCheer, label: '📣', name: 'コーチ・女性（元気）', roles: COACH_ROLES },
  { id: 'coach_female_senior', image: coachFemaleSenior, label: '😎', name: 'コーチ・女性（ベテラン）', roles: COACH_ROLES },
]

export function getStamp(id) {
  return STAMPS.find((s) => s.id === id) || STAMPS[0]
}

// role に対応するスタンプ一覧。未知の role はプレイヤー扱いにフォールバック。
export function getStampsForRole(role) {
  return STAMPS.filter((s) => s.roles.includes(role || 'player'))
}
