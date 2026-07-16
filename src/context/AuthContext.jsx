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
    isConductor: profile.is_conductor || false,
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
  const [user,             setUser]             = useState(null)
  const [loading,          setLoading]          = useState(true)
  // Set when an existing session gets signed out because its profile is
  // inactive — lets Login.jsx show the deactivation message even when the
  // user didn't just submit the login form (e.g., deactivated mid-session,
  // discovered on next page load / token refresh).
  const [deactivated,      setDeactivated]      = useState(false)
  // Set true while the app is handling a Supabase password-recovery link
  // (the user clicked "reset password" in their email). While true, the
  // router shows the reset-password form instead of the normal app/login.
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  useEffect(() => {
    // onAuthStateChange fires immediately with INITIAL_SESSION, handling startup too
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // Don't treat this as a normal login — the session is a temporary
        // recovery session, not a real sign-in. Let ResetPassword.jsx own it.
        setPasswordRecovery(true)
        setLoading(false)
        return
      }

      if (session?.user) {
        fetchProfile(session.user)
      } else {
        setUser(null)
        setPasswordRecovery(false)
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
    } else if (data.is_active === false) {
      // Covers the case where an already-logged-in user gets deactivated
      // mid-session — caught on next profile fetch (page load / token
      // refresh), not just at the login form.
      setDeactivated(true)
      setUser(null)
      await supabase.auth.signOut()
    } else {
      setUser(buildUser(authUser, data))
    }
    setLoading(false)
  }

  const login = async (email, password) => {
    setDeactivated(false)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error }

    // Check is_active immediately so the login form can show a clear,
    // deterministic message rather than waiting on the auth-state-change
    // listener (which also runs fetchProfile and will independently reach
    // the same conclusion — the two checks are intentionally redundant for
    // reliability, see AuthContext design notes).
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_active')
      .eq('id', data.user.id)
      .single()

    if (profile && profile.is_active === false) {
      await supabase.auth.signOut()
      return { error: { deactivated: true } }
    }

    return { error: null }
  }

  const logout = async () => {
    await supabase.auth.signOut()
    // onAuthStateChange SIGNED_OUT will clear user state
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, deactivated, passwordRecovery }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
