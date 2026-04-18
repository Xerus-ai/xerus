'use client'

import { useState, FormEvent } from 'react'
import { redeemInviteCode } from '@/lib/api/user'
import { auth as firebaseAuth } from '@/utils/firebase'
import { signOut } from 'firebase/auth'
import { GradientBackground } from './GradientBackground'
import type { ApiError } from '@/lib/api/client'

// Hoisted regex — avoid re-creation on every keystroke (js-hoist-regexp)
const NON_ALPHANUMERIC = /[^A-Za-z0-9]/g
const HYPHEN = /-/g

interface InviteCodeGateProps {
  email: string
}

export function InviteCodeGate({ email }: InviteCodeGateProps) {
  const [code, setCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRequestAccess, setShowRequestAccess] = useState(false)
  const [requestEmail, setRequestEmail] = useState(email)
  const [requestSent, setRequestSent] = useState(false)

  const handleCodeChange = (value: string) => {
    const cleaned = value.replace(NON_ALPHANUMERIC, '').toUpperCase().slice(0, 8)
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
      window.location.reload()
    } catch (err) {
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

  const handleRequestAccess = (e: FormEvent) => {
    e.preventDefault()
    // Open mailto or external form — for now, redirect to landing page waitlist
    window.open(`https://www.xerus.ai?waitlist=${encodeURIComponent(requestEmail)}`, '_blank')
    setRequestSent(true)
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

      <div className="relative z-10 w-full max-w-md px-4 flex flex-col items-center">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-6 animate-[fadeInScale_600ms_cubic-bezier(0.23,1,0.32,1)_forwards]" style={{ opacity: 0 }}>
            <img src="/logo/xerus.svg" alt="Xerus" className="w-16 h-16" />
            <img src="/logo/logo-svg.svg" alt="Xerus Logo" className="h-10 mt-3" />
          </div>

          <h1 className="text-2xl font-serif font-medium text-text mb-3 tracking-tight">
            You're almost in
          </h1>
          <p className="text-text-secondary text-lg font-sans max-w-sm mx-auto">
            Enter your invite code to get started, or join the waitlist for early access.
          </p>
        </div>

        {/* Card */}
        <div className="w-full bg-card p-8 rounded-4xl shadow-md border border-secondary/15 ring-1 ring-secondary/5">
          {showRequestAccess ? (
            // Request access form
            <div>
              <p className="text-text-secondary text-[15px] leading-relaxed mb-6 text-center">
                {requestSent
                  ? "Thanks! We'll notify you when a spot opens up."
                  : "Don't have a code? Join the waitlist and we'll send you one."}
              </p>

              {!requestSent ? (
                <form onSubmit={handleRequestAccess}>
                  <label htmlFor="waitlistEmail" className="sr-only">Email</label>
                  <input
                    id="waitlistEmail"
                    type="email"
                    value={requestEmail}
                    onChange={(e) => setRequestEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    aria-label="Email address"
                    className="w-full py-3.5 px-5 text-[15px] text-center border border-surface-active rounded-xl bg-surface-hover transition-all duration-300 outline-none focus:border-primary/40 focus:shadow-[0_4px_20px_rgba(255,102,0,0.1)]"
                  />

                  <button
                    type="submit"
                    className="w-full flex items-center justify-center py-3.5 px-6 mt-4 bg-text text-white rounded-xl font-medium text-[15px] hover:bg-text/90 transition-all duration-300 transform hover:-translate-y-0.5"
                  >
                    Join waitlist
                  </button>
                </form>
              ) : (
                <div className="flex items-center justify-center gap-2 py-2">
                  <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="text-text-secondary text-[15px]">Check your inbox</span>
                </div>
              )}

              <button
                onClick={() => setShowRequestAccess(false)}
                className="w-full text-center mt-4 text-[13px] text-primary hover:text-primary/90 transition-colors hover:underline"
              >
                I have an invite code
              </button>
            </div>
          ) : (
            // Invite code form
            <form onSubmit={handleSubmit}>
              <p className="text-text-secondary text-[15px] leading-relaxed mb-1 text-center">
                Signed in as <span className="font-medium text-text">{email}</span>
              </p>
              <p className="text-text/[0.33] text-[13px] mb-6 text-center">
                Invite codes are shared on our Discord and social channels.
              </p>

              <label htmlFor="inviteCode" className="block text-[13px] font-medium text-text-secondary mb-2 ml-1">
                Your invite code
              </label>
              <input
                id="inviteCode"
                type="text"
                value={displayCode}
                onChange={(e) => {
                  const raw = e.target.value.replace(HYPHEN, '')
                  handleCodeChange(raw)
                }}
                placeholder="XXXX-XXXX"
                maxLength={9}
                autoFocus
                disabled={isSubmitting}
                aria-label="Invite code"
                className={`w-full py-4 px-5 font-mono text-3xl font-bold tracking-[0.3em] text-center uppercase border rounded-xl bg-surface-hover transition-all duration-300 outline-none ${
                  error
                    ? 'border-red-400 focus:border-red-400 focus:shadow-[0_4px_20px_rgba(239,68,68,0.1)]'
                    : 'border-surface-active focus:border-primary/40 focus:shadow-[0_4px_20px_rgba(255,102,0,0.1)]'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              />

              {error && (
                <p className="text-red-500 text-[13px] mt-2 text-center" role="alert">{error}</p>
              )}

              {/* Primary CTA — solid black */}
              <button
                type="submit"
                disabled={code.length < 8 || isSubmitting}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 px-6 mt-4 bg-text text-white rounded-xl font-medium text-[15px] hover:bg-text/90 transition-all duration-300 transform hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                )}
                <span>{isSubmitting ? 'Verifying...' : 'Verify & continue'}</span>
              </button>

              {/* Secondary — request access */}
              <button
                type="button"
                onClick={() => setShowRequestAccess(true)}
                className="w-full text-center mt-4 text-[13px] text-text-secondary hover:text-text transition-colors"
              >
                Don't have a code? <span className="text-primary hover:underline">Request access</span>
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-text-muted font-sans">
            Not you?{' '}
            <button
              onClick={handleLogout}
              className="text-secondary hover:text-secondary/90 transition-colors hover:underline"
            >
              Sign out
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
