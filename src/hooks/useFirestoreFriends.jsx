/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'
import { authReady } from '../lib/firebase.js'
import {
  subscribeFriendships,
  fetchUserProfile,
  searchAllUsers,
} from '../lib/firestoreFriends.js'

const Ctx = createContext({
  myUid: null,
  friendships: [],
  usersByUid: {},
  allUsers: [],
  refreshAllUsers: async () => {},
})

export function FirestoreFriendsProvider({ children }) {
  const [myUid, setMyUid] = useState(null)
  const [friendships, setFriendships] = useState([])
  const [usersByUid, setUsersByUid] = useState({})
  const [allUsers, setAllUsers] = useState([])

  useEffect(() => {
    let unsub = null
    let cancelled = false

    authReady.then(async (uid) => {
      if (cancelled || !uid) return
      setMyUid(uid)

      // Initial bulk load of users for searching.
      const users = await searchAllUsers()
      if (!cancelled) setAllUsers(users)

      // Subscribe to friendships involving me.
      unsub = subscribeFriendships(uid, async (items) => {
        if (cancelled) return
        setFriendships(items)
        const otherUids = new Set()
        for (const f of items) {
          for (const p of f.participants ?? []) {
            if (p !== uid) otherUids.add(p)
          }
        }
        const profiles = await Promise.all(
          Array.from(otherUids).map((u) => fetchUserProfile(u)),
        )
        if (cancelled) return
        const map = {}
        for (const p of profiles) {
          if (p) map[p.uid] = p
        }
        setUsersByUid(map)
      })
    })

    return () => {
      cancelled = true
      if (unsub) unsub()
    }
  }, [])

  const refreshAllUsers = async () => {
    const users = await searchAllUsers()
    setAllUsers(users)
  }

  return (
    <Ctx.Provider value={{ myUid, friendships, usersByUid, allUsers, refreshAllUsers }}>
      {children}
    </Ctx.Provider>
  )
}

export function useFirestoreFriends() {
  return useContext(Ctx)
}
