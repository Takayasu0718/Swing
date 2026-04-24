// Storage adapter. Screens MUST import from here rather than touching localStorage.
// API is shaped like Firestore collections so swap-in is a mechanical change later.

import { useSyncExternalStore } from 'react'
import { DEFAULT_NOTIFICATION_SETTINGS } from './schema.js'

const VERSION = 'v1'
const PREFIX = `swing-app:${VERSION}:`
const KEYS = {
  users: PREFIX + 'users',
  swings: PREFIX + 'swings',
  missions: PREFIX + 'missions',
  teams: PREFIX + 'teams',
  friendships: PREFIX + 'friendships',
  notifications: PREFIX + 'notifications',
  activities: PREFIX + 'activities',
  chats: PREFIX + 'chats',
  settings: PREFIX + 'settings',
  session: PREFIX + 'session',
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

const listeners = new Set()
let version = 0
function bump() {
  version++
  listeners.forEach((fn) => fn())
}
function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useStoreVersion() {
  return useSyncExternalStore(subscribe, () => version)
}

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function now() {
  return new Date().toISOString()
}

// ============ session ============
export const session = {
  getCurrentUserId() {
    return read(KEYS.session, { currentUserId: null }).currentUserId
  },
  setCurrentUser(userId) {
    write(KEYS.session, { currentUserId: userId })
    bump()
  },
  clear() {
    write(KEYS.session, { currentUserId: null })
    bump()
  },
}

// ============ users ============
function loadUsers() {
  return read(KEYS.users, [])
}
function saveUsers(arr) {
  write(KEYS.users, arr)
}

export const users = {
  list() {
    return loadUsers()
  },
  get(id) {
    return loadUsers().find((u) => u.id === id) || null
  },
  getCurrent() {
    const id = session.getCurrentUserId()
    return id ? users.get(id) : null
  },
  create(data) {
    const u = {
      id: newId(),
      email: '',
      nickname: '',
      avatarStamp: '',
      role: 'player',
      dailyGoal: null,
      advice: '',
      childIds: [],
      guardianId: null,
      ...data,
      createdAt: now(),
      updatedAt: now(),
    }
    const arr = loadUsers()
    arr.push(u)
    saveUsers(arr)
    bump()
    return u
  },
  update(id, patch) {
    const arr = loadUsers()
    const idx = arr.findIndex((u) => u.id === id)
    if (idx === -1) return null
    const next = { ...arr[idx], ...patch, updatedAt: now() }
    arr[idx] = next
    saveUsers(arr)
    bump()
    return next
  },
  remove(id) {
    saveUsers(loadUsers().filter((u) => u.id !== id))
    bump()
  },
}

// ============ swings ============
function loadSwings() {
  return read(KEYS.swings, [])
}
function saveSwings(arr) {
  write(KEYS.swings, arr)
}

export const swings = {
  listByUser(userId) {
    return loadSwings().filter((s) => s.userId === userId)
  },
  listByUserAndDate(userId, date) {
    return loadSwings().filter((s) => s.userId === userId && s.date === date)
  },
  totalForDate(userId, date) {
    return swings.listByUserAndDate(userId, date).reduce((a, s) => a + s.count, 0)
  },
  create({ userId, date, count }) {
    const rec = { id: newId(), userId, date, count, createdAt: now() }
    const arr = loadSwings()
    arr.push(rec)
    saveSwings(arr)
    bump()
    return rec
  },
}

// ============ missions ============
function loadMissions() {
  return read(KEYS.missions, [])
}
function saveMissions(arr) {
  write(KEYS.missions, arr)
}
function missionId(userId, date) {
  return `${userId}_${date}`
}

export const missions = {
  get(userId, date) {
    return loadMissions().find((m) => m.id === missionId(userId, date)) || null
  },
  listByUser(userId) {
    return loadMissions().filter((m) => m.userId === userId)
  },
  listCompleted(userId) {
    return loadMissions().filter((m) => m.userId === userId && m.completed)
  },
  upsert({ userId, date, goal, childClaimed, claimedAt, completed, approvedAt }) {
    const arr = loadMissions()
    const id = missionId(userId, date)
    const idx = arr.findIndex((m) => m.id === id)
    const prev = idx === -1 ? null : arr[idx]
    const next = {
      id,
      userId,
      date,
      goal: goal ?? prev?.goal ?? 0,
      childClaimed: childClaimed ?? prev?.childClaimed ?? false,
      claimedAt: claimedAt ?? prev?.claimedAt ?? null,
      completed: completed ?? prev?.completed ?? false,
      approvedAt: approvedAt ?? prev?.approvedAt ?? null,
    }
    if (idx === -1) arr.push(next)
    else arr[idx] = next
    saveMissions(arr)
    bump()
    return next
  },
  claim(userId, date, goal) {
    return missions.upsert({ userId, date, goal, childClaimed: true, claimedAt: now() })
  },
  approve(userId, date) {
    return missions.upsert({ userId, date, completed: true, approvedAt: now() })
  },
}

// ============ generic collections for later phases ============
function makeCollection(key) {
  const load = () => read(key, [])
  const save = (arr) => write(key, arr)
  return {
    list: () => load(),
    get: (id) => load().find((x) => x.id === id) || null,
    create: (data) => {
      const rec = { id: newId(), createdAt: now(), ...data }
      const arr = load()
      arr.push(rec)
      save(arr)
      bump()
      return rec
    },
    update: (id, patch) => {
      const arr = load()
      const idx = arr.findIndex((x) => x.id === id)
      if (idx === -1) return null
      const next = { ...arr[idx], ...patch }
      arr[idx] = next
      save(arr)
      bump()
      return next
    },
    remove: (id) => {
      save(load().filter((x) => x.id !== id))
      bump()
    },
  }
}

// ============ teams ============
const _teams = makeCollection(KEYS.teams)
export const teams = {
  ..._teams,
  findByMember(userId) {
    return _teams.list().find((t) => t.memberIds?.includes(userId)) || null
  },
  addMember(teamId, userId) {
    const t = _teams.get(teamId)
    if (!t) return null
    if (t.memberIds.includes(userId)) return t
    return _teams.update(teamId, { memberIds: [...t.memberIds, userId] })
  },
  addMatch(teamId, match) {
    const t = _teams.get(teamId)
    if (!t) return null
    const matches = [...(t.matches || []), { id: newId(), createdAt: now(), ...match }]
    return _teams.update(teamId, { matches })
  },
  updateMatch(teamId, matchId, patch) {
    const t = _teams.get(teamId)
    if (!t) return null
    const matches = (t.matches || []).map((m) => (m.id === matchId ? { ...m, ...patch } : m))
    return _teams.update(teamId, { matches })
  },
}

// ============ friendships ============
const _friendships = makeCollection(KEYS.friendships)
export const friendships = {
  ..._friendships,
  listForUser(userId) {
    return _friendships.list().filter((f) => f.fromUserId === userId || f.toUserId === userId)
  },
  acceptedFriendIds(userId) {
    return _friendships
      .list()
      .filter((f) => f.status === 'accepted' && (f.fromUserId === userId || f.toUserId === userId))
      .map((f) => (f.fromUserId === userId ? f.toUserId : f.fromUserId))
  },
  pendingIncoming(userId) {
    return _friendships.list().filter((f) => f.status === 'pending' && f.toUserId === userId)
  },
  accept(id) {
    return _friendships.update(id, { status: 'accepted' })
  },
}

// ============ activities ============
function loadActivities() {
  return read(KEYS.activities, [])
}
function saveActivities(arr) {
  write(KEYS.activities, arr)
}

const byCreatedDesc = (a, b) => (a.createdAt < b.createdAt ? 1 : -1)

export const activities = {
  list() {
    return loadActivities()
  },
  get(id) {
    return loadActivities().find((a) => a.id === id) || null
  },
  listLatest(limit = 50) {
    return [...loadActivities()].sort(byCreatedDesc).slice(0, limit)
  },
  listByUsers(userIds) {
    const set = new Set(userIds)
    return loadActivities().filter((a) => set.has(a.userId)).sort(byCreatedDesc)
  },
  listByTeam(teamId) {
    return loadActivities().filter((a) => a.teamId === teamId).sort(byCreatedDesc)
  },
  create(data) {
    const rec = {
      id: newId(),
      userId: '',
      type: 'post',
      content: '',
      teamId: null,
      likeUserIds: [],
      createdAt: now(),
      ...data,
    }
    const arr = loadActivities()
    arr.push(rec)
    saveActivities(arr)
    bump()
    return rec
  },
  toggleLike(id, userId) {
    const arr = loadActivities()
    const idx = arr.findIndex((a) => a.id === id)
    if (idx === -1) return null
    const likes = arr[idx].likeUserIds || []
    const next = likes.includes(userId) ? likes.filter((x) => x !== userId) : [...likes, userId]
    arr[idx] = { ...arr[idx], likeUserIds: next }
    saveActivities(arr)
    bump()
    return arr[idx]
  },
}

// ============ chat messages (team-scoped) ============
function loadChats() {
  return read(KEYS.chats, [])
}
function saveChats(arr) {
  write(KEYS.chats, arr)
}

export const chats = {
  listByTeam(teamId) {
    return loadChats().filter((c) => c.teamId === teamId).sort(byCreatedDesc)
  },
  post({ teamId, userId, content }) {
    const rec = {
      id: newId(),
      teamId,
      userId,
      content,
      likeUserIds: [],
      createdAt: now(),
    }
    const arr = loadChats()
    arr.push(rec)
    saveChats(arr)
    bump()
    return rec
  },
  toggleLike(id, userId) {
    const arr = loadChats()
    const idx = arr.findIndex((c) => c.id === id)
    if (idx === -1) return null
    const likes = arr[idx].likeUserIds || []
    const next = likes.includes(userId) ? likes.filter((x) => x !== userId) : [...likes, userId]
    arr[idx] = { ...arr[idx], likeUserIds: next }
    saveChats(arr)
    bump()
    return arr[idx]
  },
}

// ============ notifications ============
function loadNotifications() {
  return read(KEYS.notifications, [])
}
function saveNotifications(arr) {
  write(KEYS.notifications, arr)
}

export const notifications = {
  list() {
    return loadNotifications()
  },
  get(id) {
    return loadNotifications().find((n) => n.id === id) || null
  },
  listByUser(userId) {
    return loadNotifications().filter((n) => n.userId === userId).sort(byCreatedDesc)
  },
  unreadCount(userId) {
    return loadNotifications().filter((n) => n.userId === userId && !n.read).length
  },
  create(data) {
    const rec = {
      id: newId(),
      userId: '',
      type: 'like',
      fromUserId: null,
      content: '',
      activityId: null,
      likeUserIds: [],
      read: false,
      createdAt: now(),
      ...data,
    }
    const arr = loadNotifications()
    arr.push(rec)
    saveNotifications(arr)
    bump()
    return rec
  },
  markRead(id) {
    const arr = loadNotifications()
    const idx = arr.findIndex((n) => n.id === id)
    if (idx === -1) return
    if (arr[idx].read) return
    arr[idx] = { ...arr[idx], read: true }
    saveNotifications(arr)
    bump()
  },
  markAllRead(userId) {
    const arr = loadNotifications().map((n) => (n.userId === userId && !n.read ? { ...n, read: true } : n))
    saveNotifications(arr)
    bump()
  },
  toggleLike(id, userId) {
    const arr = loadNotifications()
    const idx = arr.findIndex((n) => n.id === id)
    if (idx === -1) return null
    const likes = arr[idx].likeUserIds || []
    const next = likes.includes(userId) ? likes.filter((x) => x !== userId) : [...likes, userId]
    arr[idx] = { ...arr[idx], likeUserIds: next }
    saveNotifications(arr)
    bump()
    return arr[idx]
  },
  remove(id) {
    saveNotifications(loadNotifications().filter((n) => n.id !== id))
    bump()
  },
}

// ============ settings (per user, Firestore: users/{uid}/settings) ============
function loadSettingsAll() {
  return read(KEYS.settings, [])
}
function saveSettingsAll(arr) {
  write(KEYS.settings, arr)
}

export const settings = {
  get(userId) {
    const existing = loadSettingsAll().find((s) => s.userId === userId)
    return existing || { userId, notifications: { ...DEFAULT_NOTIFICATION_SETTINGS } }
  },
  setNotification(userId, key, value) {
    const arr = loadSettingsAll()
    const idx = arr.findIndex((s) => s.userId === userId)
    const current = idx === -1
      ? { userId, notifications: { ...DEFAULT_NOTIFICATION_SETTINGS } }
      : arr[idx]
    const next = {
      ...current,
      notifications: { ...current.notifications, [key]: value },
    }
    if (idx === -1) arr.push(next)
    else arr[idx] = next
    saveSettingsAll(arr)
    bump()
    return next
  },
}

// For dev: fully wipe (used by future reset button).
export function __resetAll() {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k))
  bump()
}
