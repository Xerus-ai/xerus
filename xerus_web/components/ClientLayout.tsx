'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
const Sidebar = dynamic(() => import('@/components/Sidebar'), { ssr: false })
import SearchPopup from '@/components/SearchPopup'
import { useAuth } from '@/utils/auth'
import { logout } from '@/utils/api'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from '@/utils/firebase'
import { ChevronDown, User, Settings, LogOut } from 'lucide-react'

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [isElectronMode, setIsElectronMode] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { user, isLoading } = useAuth()
  
  // Don't show user profile on login page
  const showUserProfile = pathname !== '/login'

  // Get display name from user
  const getUserDisplayName = useCallback(() => {
    if (isLoading) return 'Loading...';
    if (!user) return 'Guest';
    const name = 'display_name' in user ? user.display_name : 
                'displayName' in user ? user.displayName : 'Guest';
    return name;
  }, [user, isLoading]);
  
  // Get user initial for avatar
  const getUserInitial = useCallback(() => {
    if (isLoading) return 'L';
    if (!user) return 'G';
    const name = 'display_name' in user ? user.display_name : 
                'displayName' in user ? user.displayName : null;
    return name ? name.charAt(0).toUpperCase() : 'G';
  }, [user, isLoading]);
  
  const isFirebaseUser = user && 'uid' in user && user.uid !== 'assistant@xerus';
  
  const handleLogout = async () => {
    try {
      await logout()
      router.push('/login')
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsSearchOpen(true)
      }
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.user-dropdown')) {
        setShowUserDropdown(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Show login overlay when on login page
  const showLoginOverlay = pathname === '/login'

  // Check for Electron mode
  useEffect(() => {
    if (showLoginOverlay) {
      const urlParams = new URLSearchParams(window.location.search)
      const mode = urlParams.get('mode')
      const isInElectron = mode === 'electron' || 
                          (typeof window !== 'undefined' && window.navigator.userAgent.includes('Electron'))
      
      setIsElectronMode(isInElectron)
    }
  }, [showLoginOverlay])

  // Handle Google Sign In
  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider()
    setIsSigningIn(true)
    
    try {
      const result = await signInWithPopup(auth, provider)
      const user = result.user
      
      if (user) {
        console.log('Google login successful:', user.uid)

        console.log('Authentication flow - checking available methods:', {
          hasWindow: typeof window !== 'undefined',
          hasApi: !!(window as any).api,
          hasCommon: !!(window as any).api?.common,
          hasMethod: !!(window as any).api?.common?.sendFirebaseAuthSuccess,
          isElectronMode,
          windowApi: typeof window !== 'undefined' ? Object.keys((window as any).api || {}) : []
        })

        // Try IPC communication first (preferred method for Electron)
        if (typeof window !== 'undefined' && (window as any).api?.common?.sendFirebaseAuthSuccess) {
          console.log('Using IPC communication method')
          try {
            const idToken = await user.getIdToken()
            
            console.log('Attempting to send Firebase auth to Electron:', {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
              hasIdToken: !!idToken,
              idTokenLength: idToken ? idToken.length : 0
            })
            
            const result = await (window as any).api.common.sendFirebaseAuthSuccess({
              uid: user.uid,
              displayName: user.displayName,
              email: user.email,
              idToken
            })
            
            console.log('Auth info sent to electron successfully via IPC:', result)
          } catch (error) {
            console.error('Electron IPC communication failed:', error)
          }
        } 
        else if (isElectronMode) {
          console.log('Using direct communication with running Electron process (isElectronMode=true, no IPC)')
          // Since Electron is already running and opened this browser, send auth data directly via HTTP API
          try {
            const idToken = await user.getIdToken()
            
            console.log('Sending authentication directly to running Electron process via HTTP')
            
            // Send auth data to the Electron process via HTTP API call
            const authData = {
              uid: user.uid,
              displayName: user.displayName,
              email: user.email,
              idToken,
              timestamp: Date.now(),
              completed: true
            }
            
            // Try to communicate with the running Electron process
            // The web app is running inside Electron, so we can make a request to a local endpoint
            try {
              // Check if we're running inside Electron's web view by trying to access Electron's runtime config
              const response = await fetch('/runtime-config.json')
              const config = await response.json()
              console.log('Found Electron runtime config:', config)
              
              // Send auth success message via a simple HTTP POST to a local endpoint that Electron can serve
              const authResponse = await fetch('/electron-auth-callback', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(authData)
              })
              
              if (authResponse.ok) {
                console.log('Successfully sent auth data to Electron process')
                alert('Login successful! Authentication sent to Xerus app.')
                // Optionally redirect to a success page
                router.push('/login-success')
              } else {
                throw new Error(`HTTP ${authResponse.status}: ${authResponse.statusText}`)
              }
              
            } catch (httpError) {
              console.warn('HTTP communication failed, trying localStorage method:', httpError)
              
              // Fallback to localStorage method if HTTP fails
              localStorage.setItem('electron_auth_result', JSON.stringify(authData))
              console.log('Auth data saved to localStorage as fallback')
              
              alert('Login successful! The Xerus app will automatically detect your login.')
              router.push('/login-success')
            }
            
          } catch (tokenError) {
            console.error('Failed to get ID token:', tokenError)
            alert('Login successful but failed to get token. Please restart the Xerus app.')
          }
        } else {
          console.log('Electron API not available, checking window object:', {
            hasWindow: typeof window !== 'undefined',
            hasApi: !!(window as any).api,
            hasCommon: !!(window as any).api?.common,  
            hasMethod: !!(window as any).api?.common?.sendFirebaseAuthSuccess,
            windowApi: Object.keys((window as any).api || {})
          })
          router.push('/ai-agents')
        }
      }
    } catch (error: any) {
      console.error('Google login failed:', error)
      
      if (error.code !== 'auth/popup-closed-by-user') {
        alert('An error occurred during login. Please try again.')
      }
    } finally {
      setIsSigningIn(false)
    }
  }

  // Handle continue without signing in
  const handleContinueWithoutSignIn = () => {
    if (isElectronMode) {
      console.log('Local mode: Proceeding without authentication')

      // Since we're in Electron mode, redirect to success page instead of trying to close window
      // The Electron app is already running in local mode by default
      try {
        // Send local mode confirmation to Electron
        fetch('/electron-local-mode', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ mode: 'local', timestamp: Date.now() })
        }).then(response => {
          if (response.ok) {
            console.log('Local mode confirmation sent to Electron')
          }
        }).catch(error => {
          console.log('HTTP communication failed, Electron already in local mode:', error)
        })

        // Redirect to login success page like the Google sign-in flow
        router.push('/login-success')
      } catch (error) {
        console.error('Failed to communicate with Electron:', error)
        // Still redirect to success page even if communication fails
        router.push('/login-success')
      }
    } else {
      router.push('/ai-agents')
    }
  }

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-subtle-bg relative" suppressHydrationWarning>
        {/* Always show sidebar and content, but blur when login overlay is active */}
        <div className={`${showLoginOverlay ? 'filter blur-sm' : ''} flex-none`}>
          <Sidebar 
            isCollapsed={isSidebarCollapsed}
            onToggle={setIsSidebarCollapsed}
            onSearchClick={() => setIsSearchOpen(true)}
          />
        </div>
        <main className={`flex-1 relative h-screen overflow-y-auto ${showLoginOverlay ? 'filter blur-sm' : ''}`} suppressHydrationWarning>
          {/* Floating User Profile */}
          {showUserProfile && (
            <div className="absolute top-4 right-6 z-50 user-dropdown">
              <button
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/90 backdrop-blur-sm shadow-lg border border-gray-200 hover:bg-white transition-all duration-200"
                suppressHydrationWarning
              >
                <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-700">
                  {getUserInitial()}
                </div>
                <span className="text-sm font-medium text-gray-700 max-w-24 truncate">{getUserDisplayName()}</span>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showUserDropdown ? 'rotate-180' : ''}`} />
              </button>
              
              {/* Dropdown Menu */}
              {showUserDropdown && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
                  {isFirebaseUser ? (
                    <>
                      <button
                        onClick={() => {
                          router.push('/settings')
                          setShowUserDropdown(false)
                        }}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full text-left"
                      >
                        <User className="w-4 h-4" />
                        Profile Settings
                      </button>
                      <button
                        onClick={() => {
                          router.push('/settings/models')
                          setShowUserDropdown(false)
                        }}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full text-left"
                      >
                        <Settings className="w-4 h-4" />
                        AI Models
                      </button>
                      <hr className="my-1 border-gray-200" />
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full text-left"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          router.push('/login')
                          setShowUserDropdown(false)
                        }}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full text-left"
                      >
                        <User className="w-4 h-4" />
                        Sign In
                      </button>
                      <button
                        onClick={() => {
                          router.push('/settings/models')
                          setShowUserDropdown(false)
                        }}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full text-left"
                      >
                        <Settings className="w-4 h-4" />
                        AI Models
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          
          {showLoginOverlay ? (
            <div className="h-full flex items-center justify-center p-8">
              {/* This will show the default app content (like AI agents page) blurred in background */}
              <div className="text-center text-gray-400">
                <h2 className="text-xl font-semibold mb-2">AI Agents Dashboard</h2>
                <p>Sign in to access your personalized AI assistants</p>
              </div>
            </div>
          ) : (
            children
          )}
        </main>

        {/* Login Overlay */}
        {showLoginOverlay && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Gradient overlay on top of blur */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50/80 via-white/60 to-purple-50/80">
              {/* Decorative elements */}
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl opacity-50 animate-blob"></div>
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-50 animate-blob animation-delay-2000"></div>
                <div className="absolute top-40 left-40 w-80 h-80 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl opacity-50 animate-blob animation-delay-4000"></div>
              </div>
            </div>

            {/* Login Content */}
            <div className="relative z-10">
              {/* Logo and branding */}
              <div className="text-center mb-8">
                <div className="flex items-center justify-center gap-3 mb-6">
                  <img src="/logo/xerus.svg" alt="Xerus" className="w-16 h-16" />
                  <img src="/logo/logo-svg.svg" alt="Xerus Logo" className="h-10 mt-3" />
                </div>
                <h1 className="text-4xl font-bold text-gray-900 mb-3">Welcome back</h1>
                <p className="text-gray-600 text-lg max-w-md mx-auto">
                  Sign in to access and customise your AI assistants
                </p>
                {isElectronMode ? (
                  <p className="text-sm text-blue-600 mt-2 font-medium bg-blue-50 px-3 py-1 rounded-full inline-block">
                    🔗 Login requested from desktop app
                  </p>
                ) : (
                  <p className="text-sm text-gray-500 mt-2">Or continue without signing in</p>
                )}
              </div>
              
              <div className="w-full max-w-md">
                <div className="bg-white/80 backdrop-blur-sm p-8 rounded-2xl shadow-xl border border-gray-100">
                  {/* Google Sign In Button */}
                  <button
                    onClick={handleGoogleSignIn}
                    disabled={isSigningIn}
                    className="w-full flex items-center justify-center gap-3 py-3.5 px-6 bg-white border border-gray-300 rounded-lg shadow-sm text-base font-medium text-gray-700 hover:bg-gray-50 hover:shadow-md transform transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span>{isSigningIn ? 'Signing in...' : 'Continue with Google'}</span>
                  </button>
                  
                  {/* Divider */}
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-200"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="bg-white px-4 text-gray-500">or</span>
                    </div>
                  </div>
                  
                  {/* Local Mode Button */}
                  <button
                    onClick={handleContinueWithoutSignIn}
                    className="w-full py-3.5 px-6 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transform transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                  >
                    Continue without signing in
                  </button>
                </div>
                
                <p className="text-center text-sm text-gray-500 mt-8">
                  By signing in, you agree to our{' '}
                  <a href="/settings/privacy" className="text-blue-600 hover:underline">
                    Terms of Service
                  </a>
                  {' '}and{' '}
                  <a href="/settings/privacy" className="text-blue-600 hover:underline">
                    Privacy Policy
                  </a>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <SearchPopup 
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </>
  )
} 