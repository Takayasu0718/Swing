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
import coachSeniorStrict from '../assets/avatars/coach_senior_strict.png'
import coachSeniorFriendly from '../assets/avatars/coach_senior_friendly.png'
import coachYoung from '../assets/avatars/coach_young.png'
import coachFemale from '../assets/avatars/coach_female.png'

const PLAYER_ROLES = ['player', 'trial']
const COACH_ROLES = ['coach']

export const STAMPS = [
  { id: 'boy_cheer', image: boyCheer, label: '⚾', name: '男の子・茶髪', roles: PLAYER_ROLES },
  { id: 'boy_wink', image: boyWink, label: '⚾', name: '男の子・茶髪（強気）', roles: PLAYER_ROLES },
  { id: 'boy_fire', image: boyFire, label: '⚾', name: '男の子・青髪', roles: PLAYER_ROLES },
  { id: 'boy_focus', image: boyFocus, label: '⚾', name: '男の子・金髪', roles: PLAYER_ROLES },
  { id: 'girl_cheer', image: girlCheer, label: '⚾', name: '女の子・茶髪', roles: PLAYER_ROLES },
  { id: 'girl_wink', image: girlWink, label: '⚾', name: '女の子・黒髪', roles: PLAYER_ROLES },
  { id: 'girl_fire', image: girlFire, label: '⚾', name: '女の子・金髪', roles: PLAYER_ROLES },
  { id: 'girl_focus', image: girlFocus, label: '⚾', name: '女の子・青髪', roles: PLAYER_ROLES },
  { id: 'coach_senior_strict', image: coachSeniorStrict, label: '👴', name: 'ベテラン監督（厳格）', roles: COACH_ROLES },
  { id: 'coach_senior_friendly', image: coachSeniorFriendly, label: '👴', name: 'ベテラン監督（温和）', roles: COACH_ROLES },
  { id: 'coach_young', image: coachYoung, label: '🔥', name: '若手コーチ（熱血）', roles: COACH_ROLES },
  { id: 'coach_female', image: coachFemale, label: '💪', name: '女性コーチ', roles: COACH_ROLES },
]

export function getStamp(id) {
  return STAMPS.find((s) => s.id === id) || STAMPS[0]
}

// role に対応するスタンプ一覧。未知の role はプレイヤー扱いにフォールバック。
export function getStampsForRole(role) {
  return STAMPS.filter((s) => s.roles.includes(role || 'player'))
}
