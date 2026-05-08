/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'
import { authReady } from '../lib/firebase.js'
import { listAllFsTeams, subscribeMyFsTeams } from '../lib/firestoreTeams.js'
import { subscribeMyOutgoingTeamRequests } from '../lib/firestoreTeamRequests.js'

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
