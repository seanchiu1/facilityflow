import React, { createContext, useContext, useState } from 'react'

const AuthContext = createContext()
const STORAGE_KEY = 'facilityflow_user'

const roleProfiles = {
  manager: {
    id: 'u1',
    name: 'Manager Liu',
    nameZh: '劉主管',
    role: 'manager',
    email: 'manager.liu@qualcomm.com',
    department: 'Facilities Management',
    phone: '+886-2-2792-0888 x3201',
  },
  staff: {
    id: 'u2',
    name: 'Chen Wei-Ming',
    nameZh: '陳威明',
    role: 'staff',
    email: 'wm.chen@qualcomm.com',
    department: 'Facilities Operations',
    phone: '+886-2-2792-0888 x3405',
  },
  vendor: {
    id: 'u3',
    name: 'David Lin',
    nameZh: '林大衛',
    role: 'vendor',
    email: 'dlin@tes.com.tw',
    company: 'Taiwan Elevator Services',
    phone: '+886-2-2345-6789',
  },
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  const login = (role) => {
    const u = roleProfiles[role]
    setUser(u)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
