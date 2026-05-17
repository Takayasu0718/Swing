/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'
import { authReady } from '../lib/firebase.js'
import { listAllFsTeams, subscribeMyFsTeams } from '../lib/firestoreTeams.js'
import { subscribeMyOutgoingTeamRequests } from '../lib/firestoreTeamRequests.js'
import { isDemoMode } from '../lib/demoMode.js'
import { buildDemoTeam } from '../storage/demoMockData.js'

const Ctx = createContext({
  myUid: null,
  myFsTeams: [],
  myFsTeam: null,
  allFsTeams: [],
  outgoingRequests: [],
  refreshAllTeams: async () => {},
})

export function FirestoreTeamsProvider({ children }) {
  const [myUid, setMyUid] = useState(null)
  const [myFsTeams, setMyFsTeams] = useState([])
  const [allFsTeams, setAllFsTeams] = useState([])
  const [outgoingRequests, setOutgoingRequests] = useState([])

  useEffect(() => {
    let unsubTeams = null
    let unsubOutgoing = null
    let cancelled = false
    authReady.then(async (uid) => {
      if (cancelled || !uid) return
      setMyUid(uid)

      // デモモード: Firestore 購読をスキップしモックチームを 1 件返す
      if (isDemoMode()) {
        const demoTeam = buildDemoTeam(uid)
        setMyFsTeams([demoTeam])
        setAllFsTeams([demoTeam])
        setOutgoingRequests([])
        return
      }

      const teams = await listAllFsTeams()
      if (!cancelled) setAllFsTeams(teams)

      unsubTeams = subscribeMyFsTeams(uid, (items) => {
        if (cancelled) return
        setMyFsTeams(items)
      })

      unsubOutgoing = subscribeMyOutgoingTeamRequests(uid, (items) => {
        if (cancelled) return
        setOutgoingRequests(items)
      })
    })
    return () => {
      cancelled = true
      if (unsubTeams) unsubTeams()
      if (unsubOutgoing) unsubOutgoing()
    }
  }, [])

  const myFsTeam = myFsTeams[0] || null

  const refreshAllTeams = async () => {
    const teams = await listAllFsTeams()
    setAllFsTeams(teams)
  }

  return (
    <Ctx.Provider
      value={{
        myUid,
        myFsTeams,
        myFsTeam,
        allFsTeams,
        outgoingRequests,
        refreshAllTeams,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useFirestoreTeams() {
  return useContext(Ctx)
}
