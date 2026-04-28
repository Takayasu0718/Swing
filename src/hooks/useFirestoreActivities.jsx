/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { subscribeActivitiesByUids } from '../lib/firestoreActivities.js'
import { useFirestoreFriends } from './useFirestoreFriends.jsx'
import { useFirestoreTeams } from './useFirestoreTeams.jsx'

const Ctx = createContext({ activities: [] })

export function FirestoreActivitiesProvider({ children }) {
  const { myUid, friendships } = useFirestoreFriends()
  const { myFsTeam } = useFirestoreTeams()
  const [byUidActs, setByUidActs] = useState([])

  const friendUids = (friendships || [])
    .filter((f) => f.status === 'accepted')
    .map((f) => f.participants?.find((p) => p !== myUid))
    .filter(Boolean)
  const teamUids = myFsTeam?.memberIds ?? []
  const watchedUids = Array.from(new Set([myUid, ...friendUids, ...teamUids].filter(Boolean)))
  const watchedKey = watchedUids.sort().join(',')

  useEffect(() => {
    if (!myUid) return
    const unsub = subscribeActivitiesByUids(watchedUids, setByUidActs)
    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedKey, myUid])

  const activities = useMemo(() => byUidActs, [byUidActs])

  return <Ctx.Provider value={{ activities }}>{children}</Ctx.Provider>
}

export function useFirestoreActivities() {
  return useContext(Ctx)
}
