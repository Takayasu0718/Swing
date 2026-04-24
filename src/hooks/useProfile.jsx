/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react'

const ProfileContext = createContext({
  viewUserId: null,
  openProfile: () => {},
  closeProfile: () => {},
})

export function ProfileProvider({ children }) {
  const [viewUserId, setViewUserId] = useState(null)
  const value = {
    viewUserId,
    openProfile: (id) => setViewUserId(id),
    closeProfile: () => setViewUserId(null),
  }
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  return useContext(ProfileContext)
}
