'use client'

import { useState, FormEvent } from 'react'
import { redeemInviteCode } from '@/lib/api/user'
import { auth as firebaseAuth } from '@/utils/firebase'
import { signOut } from 'firebase/auth'
import { GradientBackground } from './GradientBackground'
import type { ApiError } from '@/lib/api/client'

interface InviteCodeGateProps {
  email: string
}

export function InviteCodeGate({ email }: InviteCodeGateProps) {
  const [code, setCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleCodeChange = (value: string) => {
    const cleaned = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8)
    setCode(cleaned)
    setError(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (code.length < 8 || isSubmitting) return

    setIsSubmitting(true)
    setError(null)

    try {
      await redeemInviteCode(code)
      setSuccess(true)
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (err) {
      // apiCall throws ApiError with status and human-readable message from backend
      const apiError = err as ApiError
      if (apiError.status === 429) {
        setError('Too many attempts. Please wait and try again.')
      } else {
        setError(apiError.message || 'Invalid or expired invite code')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLogout = async () => {
    await signOut(firebaseAuth)
    localStorage.removeItem('xerus_user')
    window.location.href = '/login'
  }

  const displayCode = code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-alt">
      <GradientBackground />

      {/* Content */}
      <div className="relative z-10 w-full max-w-md px-4 flex flex-col items-center">
        {/* Logo and branding */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-6">
            <img src="/logo/xerus.svg" alt="Xerus" className="w-16 h-16" />
            <img src="/logo/logo-svg.svg" alt="Xerus Logo" className="h-10 mt-3" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-medium text-text mb-4 tracking-tight">
            {success ? 'Welcome!' : 'Almost there'}
          </h1>
          <p className="text-text-secondary text-lg font-sans">
            {success ? 'Setting up your workspace...' : 'Enter your invite code to get started'}
          </p>
        </div>

        {/* Card */}
        <div className="w-full bg-surface p-8 rounded-[32px] shadow-sm border border-[#FFE4D6]">
          {success ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-text font-medium text-[15px]">Account activated</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <p className="text-text-secondary text-[15px] leading-relaxed mb-6 text-center">
                Signed in as <span className="font-medium text-text">{email}</span>
              </p>

              <input
                type="text"
                value={displayCode}
                onChange={(e) => {
                  const raw = e.target.value.replace(/-/g, '')
                  handleCodeChange(raw)
                }}
                placeholder="XXXX-XXXX"
                maxLength={9}
                autoFocus
                disabled={isSubmitting}
                className={`w-full py-4 px-6 font-mono text-2xl tracking-[0.3em] text-center uppercase border rounded-xl bg-surface-hover transition-all duration-300 outline-none ${
                  error
                    ? 'border-red-400 focus:border-red-400 focus:shadow-[0_4px_20px_rgba(239,68,68,0.1)]'
                    : 'border-surface-active focus:border-[#FF6600]/40 focus:shadow-[0_4px_20px_rgba(255,102,0,0.1)]'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              />

              {error && (
                <p className="text-red-500 text-sm mt-2 text-center">{error}</p>
              )}

              <button
                type="submit"
                disabled={code.length < 8 || isSubmitting}
                className="group w-full flex items-center justify-center gap-3 py-4 px-6 mt-4 bg-surface-hover border border-surface-active rounded-xl text-text font-medium hover:border-[#FF6600]/40 hover:shadow-[0_4px_20px_rgba(255,102,0,0.1)] transition-all duration-300 transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-[#FF6600] border-t-transparent rounded-full animate-spin" />
                ) : null}
                <span className="font-sans text-[15px]">
                  {isSubmitting ? 'Activating...' : 'Activate Account'}
                </span>
              </button>
            </form>
          )}
        </div>

        {!success && (
          <div className="mt-8 text-center">
            <p className="text-xs text-[#9CA3AF] font-sans">
              Not you?{' '}
              <button
                onClick={handleLogout}
                className="text-[#FF6600] hover:text-[#E65C00] transition-colors hover:underline"
              >
                Sign out
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
