'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from '@/utils/firebase'
import { toast } from 'sonner'

export function LoginOverlay() {
  const [isSigningIn, setIsSigningIn] = useState(false)
  const router = useRouter()

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider()
    setIsSigningIn(true)

    try {
      const result = await signInWithPopup(auth, provider)
      if (result.user) {
        router.push('/')
      }
    } catch (error) {
      console.error('Google login failed:', error)
      const firebaseError = error as { code?: string }
      if (firebaseError.code !== 'auth/popup-closed-by-user') {
        toast.error('An error occurred during login. Please try again.')
      }
    } finally {
      setIsSigningIn(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-alt">
      {/* Animated Gradient Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#FF6600]/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#FFB800]/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000" />
        <div className="absolute top-40 left-40 w-96 h-96 bg-[#FF8533]/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-4000" />

        {/* Noise Texture Overlay */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
          }}
        />
      </div>

      {/* Login Content */}
      <div className="relative z-10 w-full max-w-md px-4 flex flex-col items-center">
        {/* Logo and branding */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-6">
            <img src="/logo/xerus.svg" alt="Xerus" className="w-16 h-16" />
            <img src="/logo/logo-svg.svg" alt="Xerus Logo" className="h-10 mt-3" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-medium text-text mb-4 tracking-tight">
            Welcome back
          </h1>
          <p className="text-text-secondary text-lg font-sans">
            Sign in to access your AI assistants
          </p>
        </div>

        {/* Card for Actions */}
        <div className="w-full bg-surface p-8 rounded-[32px] shadow-sm border border-[#FFE4D6]">
          <p className="text-text-secondary text-[15px] leading-relaxed mb-6 text-center">
            Sign in with Google to access your personalized AI assistants and synchronize your workspace.
          </p>

          {/* Google Sign In Button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={isSigningIn}
            className="group w-full flex items-center justify-center gap-3 py-4 px-6 bg-surface-hover border border-surface-active rounded-xl text-text font-medium hover:border-[#FF6600]/40 hover:shadow-[0_4px_20px_rgba(255,102,0,0.1)] transition-all duration-300 transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isSigningIn ? (
              <div className="w-5 h-5 border-2 border-[#FF6600] border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="h-5 w-5 transition-transform group-hover:scale-110 duration-300" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            <span className="font-sans text-[15px]">{isSigningIn ? 'Signing in...' : 'Continue with Google'}</span>
          </button>
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs text-[#9CA3AF] font-sans">
            By signing in, you agree to our{' '}
            <a href="https://www.xerus.ai/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-[#FF6600] hover:text-[#E65C00] transition-colors hover:underline">
              Terms of Service
            </a>
            {' '}and{' '}
            <a href="https://www.xerus.ai/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-[#FF6600] hover:text-[#E65C00] transition-colors hover:underline">
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
