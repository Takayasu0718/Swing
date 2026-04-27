/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { authReady } from '../lib/firebase.js'
import { listAllFsTeams, subscribeMyFsTeams } from '../lib/firestoreTeams.js'
import {
  subscribeIncomingTeamRequests,
  subscribeMyOutgoingTeamRequests,
} from '../lib/firestoreTeamRequests.js'
import { subscribeChats } from '../lib/firestoreChats.js'

const Ctx = createContext({
  myUid: null,
  myFsTeams: [],
  myFsTeam: null,
  allFsTeams: [],
  incomingRequests: [],
  outgoingRequests: [],
  teamChats: [],
  refreshAllTeams: async () => {},
})

export function FirestoreTeamsProvider({ children }) {
  const [myUid, setMyUid] = useState(null)
  const [myFsTeams, setMyFsTeams] = useState([])
  const [allFsTeams, setAllFsTeams] = useState([])
  const [incomingRequests, setIncomingRequests] = useState([])
  const [outgoingRequests, setOutgoingRequests] = useState([])
  const [teamChats, setTeamChats] = useState([])

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

  const captainTeamIds = useMemo(
    () => myFsTeams.filter((t) => t.captainId === myUid).map((t) => t.id),
    [myFsTeams, myUid],
  )
  const captainTeamIdsKey = captainTeamIds.join(',')

  useEffect(() => {
    const unsub = subscribeIncomingTeamRequests(captainTeamIds, (items) => {
      setIncomingRequests(items)
    })
    return () => {
      if (unsub) unsub()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captainTeamIdsKey])

  const myFsTeam = myFsTeams[0] || null
  const myFsTeamId = myFsTeam?.id || null

  useEffect(() => {
    const unsub = subscribeChats(myFsTeamId, (items) => {
      setTeamChats(items)
    })
    return () => {
      if (unsub) unsub()
    }
  }, [myFsTeamId])

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
        incomingRequests,
        outgoingRequests,
        teamChats,
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
