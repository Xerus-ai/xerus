'use client'

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { UserProfile, setUserInfo, findOrCreateUser } from '@/lib/api'
import { auth as firebaseAuth } from './firebase'
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth'

interface AuthContextType {
  user: UserProfile | null
  isLoading: boolean
  isAuthReady: boolean
  mode: 'firebase' | null
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthReady: false,
  mode: null,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthReady, setIsAuthReady] = useState(false)
  const [mode, setMode] = useState<'firebase' | null>(null)
  const processingRef = useRef(false)
  const isMountedRef = useRef(true)

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

          let profile: UserProfile = {
            uid: firebaseUser.uid,
            display_name: firebaseUser.displayName || 'User',
            email: firebaseUser.email || '',
          }

          try {
            profile = await findOrCreateUser(profile)

            // Ensure sandbox is running (non-blocking)
            try {
              const { ensureSandbox } = await import('@/lib/api/workspace')
              await ensureSandbox()
            } catch (err) {
              console.warn('[AuthContext] ensureSandbox failed (non-blocking):', err)
            }
          } catch {
            // Continue with Firebase data even if backend fails
          }

          if (isMountedRef.current) {
            setUser(profile)
            setUserInfo(profile)
          }
        } else {
          if (isMountedRef.current) {
            setUser(null)
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

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthReady, mode }}>
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
