'use client'

import { createContext, useContext, useEffect, useState, useRef, useCallback, useMemo, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { UserProfile } from '@/lib/api/types'
import { setUserInfo, findOrCreateUser } from '@/lib/api/user'
import { auth as firebaseAuth } from './firebase'
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth'

interface AuthContextType {
  user: UserProfile | null
  isLoading: boolean
  isAuthReady: boolean
  hasWorkspace: boolean
  markWorkspaceReady: () => void
  mode: 'firebase' | null
  inviteRequired: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthReady: false,
  hasWorkspace: false,
  markWorkspaceReady: () => {},
  mode: null,
  inviteRequired: false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthReady, setIsAuthReady] = useState(false)
  const [hasWorkspace, setHasWorkspace] = useState(false)
  const [mode, setMode] = useState<'firebase' | null>(null)
  const [inviteRequired, setInviteRequired] = useState(false)
  const processingRef = useRef(false)
  const isMountedRef = useRef(true)

  const markWorkspaceReady = useCallback(() => {
    setHasWorkspace(true)
  }, [])

  useEffect(() => {
    isMountedRef.current = true

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser: FirebaseUser | null) => {
      // Prevent duplicate processing and check if still mounted
      if (processingRef.current || !isMountedRef.current) return
      processingRef.current = true

      try {
        if (firebaseUser) {
          if (isMountedRef.current) {
            setMode('firebase')
          }

          const profile = await findOrCreateUser({
            uid: firebaseUser.uid,
            display_name: firebaseUser.displayName || 'User',
            email: firebaseUser.email || '',
            has_workspace: false,
          })

          if (isMountedRef.current) {
            setUser(profile)
            setHasWorkspace(profile.has_workspace)
            setUserInfo(profile)
          }

          // Check if invite code is required
          if (profile.invite_required) {
            if (isMountedRef.current) {
              setInviteRequired(true)
            }
          } else if (profile.has_workspace) {
            // Ensure sandbox is running (non-blocking, only if workspace exists and user active)
            try {
              const { ensureSandbox } = await import('@/lib/api/workspace')
              await ensureSandbox()
            } catch (err) {
              console.warn('[AuthContext] ensureSandbox failed (non-blocking):', err)
            }
          }
        } else {
          if (isMountedRef.current) {
            setUser(null)
            setHasWorkspace(false)
            setMode(null)
          }
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false)
          setIsAuthReady(true)
        }
        processingRef.current = false
      }
    })

    return () => {
      isMountedRef.current = false
      unsubscribe()
    }
  }, [])

  const contextValue = useMemo(
    () => ({ user, isLoading, isAuthReady, hasWorkspace, markWorkspaceReady, mode, inviteRequired }),
    [user, isLoading, isAuthReady, hasWorkspace, markWorkspaceReady, mode, inviteRequired]
  )

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  return useContext(AuthContext)
}

export const useRedirectIfNotAuth = () => {
  const { user, isAuthReady } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (isAuthReady && !user) {
      router.push('/login')
    }
  }, [user, isAuthReady, router])

  return user
}
