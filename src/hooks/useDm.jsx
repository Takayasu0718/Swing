/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react'

const DmContext = createContext({
  partnerUid: null,
  openDm: () => {},
  closeDm: () => {},
})

export function DmProvider({ children }) {
  const [partnerUid, setPartnerUid] = useState(null)
  const value = {
    partnerUid,
    openDm: (uid) => setPartnerUid(uid),
    closeDm: () => setPartnerUid(null),
  }
  return <DmContext.Provider value={value}>{children}</DmContext.Provider>
}

export function useDm() {
  return useContext(DmContext)
}
