'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, User, Settings, LogOut, Users } from 'lucide-react'
import { toast } from '@/lib/toast'
import { useAuth } from '@/utils/AuthContext'
import { logout, getCreditBalance, type CreditBalance } from '@/lib/api/user'
import type { UserProfile } from '@/lib/api/types'

interface UserMenuProps {
  className?: string
}

// Plan credit limits (must match backend PLAN_CREDITS)
const PLAN_CREDITS: Record<string, number> = {
  free: 10,
  starter: 2500,
  advanced: 10000,
  prodigy: 100000
}

export function UserMenu({ className }: UserMenuProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [credits, setCredits] = useState<CreditBalance | null>(null)
  const [creditsLoading, setCreditsLoading] = useState(true)
  const router = useRouter()
  const { user, isLoading } = useAuth()

  // Only render user-dependent content after mount to avoid hydration mismatch
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Fetch credit balance when user is authenticated
  useEffect(() => {
    const fetchCredits = async () => {
      if (!user) {
        setCreditsLoading(false)
        return
      }
      try {
        const balance = await getCreditBalance()
        setCredits(balance)
      } catch (error) {
        console.error('Failed to fetch credits:', error)
      } finally {
        setCreditsLoading(false)
      }
    }

    if (isMounted && user) {
      fetchCredits()
    }
  }, [isMounted, user])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.user-dropdown')) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const getUserDisplayName = useCallback((): string => {
    if (isLoading) return 'Loading...'
    if (!user) return 'Not logged in'
    return user.display_name || 'Anonymous'
  }, [user, isLoading])

  const getUserInitial = useCallback((): string => {
    if (isLoading) return 'L'
    if (!user) return '?'
    const name = user.display_name
    return name ? name.charAt(0).toUpperCase() : '?'
  }, [user, isLoading])

  const isFirebaseUser = user && user.uid !== 'assistant@xerus'

  // Calculate days until reset
  const getDaysUntilReset = useCallback((): number => {
    if (!credits?.credits_reset_date) return 30 // Default to 30 days if not set
    const resetDate = new Date(credits.credits_reset_date)
    // Check for invalid date
    if (isNaN(resetDate.getTime())) return 30
    const now = new Date()
    const diffTime = resetDate.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return Math.max(1, diffDays) // At least 1 day
  }, [credits])

  // Get total credits for plan
  const getTotalCredits = useCallback((): number => {
    if (!credits?.plan_type) return 10
    return PLAN_CREDITS[credits.plan_type] || 10
  }, [credits])

  // Calculate progress percentage
  const getProgressPercentage = useCallback((): number => {
    if (!credits) return 0
    const total = getTotalCredits()
    return Math.min(100, (credits.credits_available / total) * 100)
  }, [credits, getTotalCredits])

  // Determine if low credits warning should show
  const isLowCredits = credits && credits.credits_available < getTotalCredits() * 0.3

  const handleLogout = async () => {
    try {
      await logout()
      router.push('/login')
    } catch (error) {
      console.error('Logout failed:', error)
      toast.error("Couldn't sign you out", { description: 'Please try again.' })
    }
  }

  // Don't render anything until mounted (prevents hydration mismatch)
  if (!isMounted) {
    return (
      <div className={`user-dropdown ${className || ''}`}>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-alt/90 backdrop-blur-sm shadow-sm border border-surface-active">
          <div className="w-7 h-7 rounded-full bg-surface-hover animate-pulse" />
          <span className="text-sm font-medium text-text-muted w-16 h-4 bg-surface-hover rounded animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className={`user-dropdown relative ${className || ''}`}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 w-full px-2 py-2 rounded-xl hover:bg-surface-hover/60 transition-all duration-200"
      >
        <div className="w-8 h-8 rounded-full bg-[#FF6600]/10 flex items-center justify-center text-sm font-semibold text-[#FF6600] shrink-0">
          {getUserInitial()}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[14px] font-medium text-text truncate leading-tight">{getUserDisplayName()}</p>
          <p className="text-[11px] text-text-secondary leading-tight">{credits?.plan_type ? credits.plan_type.charAt(0).toUpperCase() + credits.plan_type.slice(1) + ' plan' : 'Free plan'}</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {showDropdown && (
        <div className="absolute bottom-full left-0 mb-3 w-[280px] bg-surface-alt rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-surface-active py-2 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 z-50">
          {/* Credits Section */}
          <div className="px-5 py-4 border-b border-surface-active/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5 text-[13px] font-medium text-text-secondary">
                <div className="w-5 h-5 rounded-full border border-surface-active flex items-center justify-center bg-surface">
                  <span className="text-[10px] font-bold text-text-muted">C</span>
                </div>
                Credits
              </div>
              {creditsLoading ? (
                <span className="text-[13px] text-text-muted">Loading...</span>
              ) : credits ? (
                <span className="text-[13px] font-semibold text-text">
                  {credits.credits_available}
                  <span className="text-text-muted font-normal">/{getTotalCredits()}</span>
                </span>
              ) : (
                <span className="text-[13px] text-text-muted">--</span>
              )}
            </div>

            {/* Progress Bar */}
            <div className="h-1.5 w-full bg-surface-hover rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-[#FF6600] rounded-full shadow-sm transition-all duration-300"
                style={{ width: `${getProgressPercentage()}%` }}
              />
            </div>

            {isLowCredits && (
              <div className="flex items-center gap-2 text-[11px] text-amber-600 bg-amber-50 px-2 py-1 rounded-md mb-3 w-fit">
                <span className="font-medium">Low credits</span>
              </div>
            )}

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-muted">
                {credits?.plan_type === 'prodigy'
                  ? 'Prodigy plan'
                  : `Resets in ${getDaysUntilReset()} day${getDaysUntilReset() !== 1 ? 's' : ''}`
                }
              </span>
              {credits?.plan_type !== 'prodigy' && (
                <button
                  onClick={() => router.push('/settings/billing')}
                  className="text-[#FF6600] font-medium hover:text-[#e65c00] transition-colors hover:underline"
                >
                  Upgrade Plan
                </button>
              )}
            </div>
          </div>

          {/* Menu Items */}
          <div className="p-2 space-y-0.5">
            <a
              href="https://discord.gg/xerus"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2.5 text-[13px] font-medium text-text-secondary hover:text-text hover:bg-surface-hover rounded-xl transition-all duration-200 w-full text-left group"
            >
              <Users className="w-4 h-4 text-text-muted group-hover:text-text-secondary transition-colors" />
              Join Discord
            </a>

            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2.5 text-[13px] font-medium text-text-secondary hover:text-red-600 hover:bg-red-50 rounded-xl transition-all duration-200 w-full text-left group"
            >
              <LogOut className="w-4 h-4 text-text-muted group-hover:text-red-500 transition-colors" />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

