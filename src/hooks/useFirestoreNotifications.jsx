/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'
import { authReady } from '../lib/firebase.js'
import { subscribeMyFsNotifications } from '../lib/firestoreNotifications.js'

const Ctx = createContext({ items: [], unread: 0, myUid: null })

export function FirestoreNotificationsProvider({ children }) {
  const [items, setItems] = useState([])
  const [myUid, setMyUid] = useState(null)

  useEffect(() => {
    let unsub = null
    let cancelled = false
    authReady.then((uid) => {
      if (cancelled || !uid) return
      setMyUid(uid)
      unsub = subscribeMyFsNotifications(uid, (it) => {
        if (cancelled) return
        setItems(it)
      })
    })
    return () => {
      cancelled = true
      if (unsub) unsub()
    }
  }, [])

  const unread = items.filter((n) => !n.read).length

  return <Ctx.Provider value={{ items, unread, myUid }}>{children}</Ctx.Provider>
}

export function useFirestoreNotifications() {
  return useContext(Ctx)
}
