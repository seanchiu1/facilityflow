import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext()

// Flatten auth user + profile row into the shape the rest of the app expects
function buildUser(authUser, profile) {
  if (!authUser || !profile) return null
  return {
    id:          authUser.id,
    email:       authUser.email,
    name:        profile.display_name,
    role:        profile.role,
    // Vendor-specific fields
    vendorName:  profile.vendor_name  || null,
    contactName: profile.contact_name || null,
    // Settings page reads department || company
    department:  profile.role !== 'vendor' ? (profile.role === 'manager' ? 'Facilities Management' : 'Facilities Operations') : undefined,
    company:     profile.role === 'vendor'  ? (profile.vendor_name || '') : undefined,
    phone:       '',
  }
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // onAuthStateChange fires immediately with INITIAL_SESSION, handling startup too
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        fetchProfile(session.user)
      } else {
        setUser(null)
        setLoading(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(authUser) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single()

    if (error || !data) {
      console.error('Profile fetch error:', error)
      setUser(null)
    } else {
      setUser(buildUser(authUser, data))
    }
    setLoading(false)
  }

  const login = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const logout = async () => {
    await supabase.auth.signOut()
    // onAuthStateChange SIGNED_OUT will clear user state
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
