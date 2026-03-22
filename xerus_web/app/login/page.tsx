'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/utils/AuthContext'

/**
 * Login page route.
 *
 * The actual login UI (LoginOverlay) is rendered by LayoutShell
 * when pathname === '/login'. This page component handles the
 * authenticated-user redirect: if already logged in, go home.
 */
export default function LoginPage() {
  const { user, isAuthReady } = useAuth()
  const router = useRouter()

  // Already authenticated — redirect to home
  useEffect(() => {
    if (isAuthReady && user) {
      router.push('/')
    }
  }, [isAuthReady, user, router])

  // Login UI is rendered by LayoutShell, not this component
  return null
}
