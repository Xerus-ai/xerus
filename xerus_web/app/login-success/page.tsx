'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export default function LoginSuccessPage() {
  const [isLocalMode, setIsLocalMode] = useState(false)
  const searchParams = useSearchParams()

  useEffect(() => {
    // Check if this was triggered by local mode (no authentication)
    const mode = searchParams?.get('mode')
    const referrer = document.referrer

    // Detect if this came from local mode flow
    if (mode === 'local' || referrer.includes('login') || !mode) {
      // Check if user actually authenticated vs local mode
      // This is a simple heuristic - in local mode, there's no auth token
      const hasAuth = localStorage.getItem('authToken') || sessionStorage.getItem('authToken')
      setIsLocalMode(!hasAuth)
    }
  }, [searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="text-center max-w-md mx-auto p-8">
        <div className="mb-6">
          <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {isLocalMode ? 'Local Mode Activated!' : 'Login Successful!'}
          </h1>
          <p className="text-gray-600 mb-4">
            {isLocalMode
              ? 'You are now using Xerus in local mode without authentication.'
              : 'You have successfully signed in to Xerus.'
            }
          </p>
          <p className="text-sm text-blue-600 bg-blue-50 px-4 py-2 rounded-lg">
            You can now close this browser window.<br />
            The Xerus desktop app will automatically {isLocalMode ? 'continue in local mode' : 'detect your login'}.
          </p>
        </div>

        <div className="text-xs text-gray-500 mt-8">
          If the Xerus app doesn't update within a few seconds, please restart it.
        </div>
      </div>
    </div>
  )
}