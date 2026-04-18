'use client'

import { useState, useEffect } from 'react'
import { useRedirectIfNotAuth } from '@/utils/AuthContext'
import { getUserProfile, updateUserProfile, deleteAccount } from '@/lib/api/user'
import { useRouter } from 'next/navigation'
import { Mail, Crown, Trash2, AlertTriangle } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from '@/lib/toast'
import Link from 'next/link'

interface ProfileData {
  uid: string
  email: string
  display_name: string
  avatar_url?: string
  plan_type?: string
  created_at?: string
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  advanced: 'Advanced',
  prodigy: 'Prodigy',
}

export default function ProfilePage() {
  const user = useRedirectIfNotAuth()
  const router = useRouter()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [profileError, setProfileError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [displayNameInput, setDisplayNameInput] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    if (!user) return
    const fetchProfile = async () => {
      try {
        const data = await getUserProfile()
        setProfile({
          uid: data.uid,
          email: data.email,
          display_name: data.display_name,
          plan_type: data.plan_type,
          created_at: data.created_at,
        })
        setDisplayNameInput(data.display_name)
      } catch (error) {
        console.error('Failed to load profile:', error)
        toast.error("Couldn't load your profile", { description: 'Please refresh the page and try again.' })
        setProfileError(true)
        // Don't silently fall back to stale data
      } finally {
        setIsLoading(false)
      }
    }
    fetchProfile()
  }, [user])

  const handleUpdateDisplayName = async () => {
    if (!profile || displayNameInput === profile.display_name) return
    setIsSaving(true)
    try {
      await updateUserProfile({ display_name: displayNameInput })
      setProfile((prev) => (prev ? { ...prev, display_name: displayNameInput } : null))
      toast.success('Display name updated', { description: 'Your new name will appear across the platform.' })
    } catch {
      toast.error("Couldn't save your changes", { description: 'Please try again.' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteAccount = async () => {
    try {
      await deleteAccount()
      toast.success('Account deleted', { description: 'Your account and all data have been removed.' })
      router.push('/login')
    } catch {
      toast.error("Couldn't delete your account", { description: 'Please contact support if this persists.' })
    }
  }

  const planType = profile?.plan_type || 'free'
  const planLabel = PLAN_LABELS[planType] || 'Free'
  const initials = profile?.display_name?.charAt(0)?.toUpperCase() || 'U'

  if (isLoading) {
    return (
      <div className="max-w-[680px]">
        <div className="h-7 w-32 rounded-lg animate-shimmer mb-2" />
        <div className="h-4 w-56 rounded-lg animate-shimmer mb-10" />
        <div className="bg-surface rounded-2xl border border-surface-active p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full animate-shimmer" />
            <div className="space-y-2">
              <div className="h-5 w-40 rounded-lg animate-shimmer" />
              <div className="h-4 w-56 rounded-lg animate-shimmer" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (profileError && !profile) {
    return (
      <div className="max-w-[680px]">
        <h1 className="font-serif text-[22px] text-text tracking-tight mb-1">Profile</h1>
        <p className="text-sm text-text-secondary mb-8">Manage your personal information</p>
        <div className="bg-destructive/5 rounded-2xl border border-destructive/20 p-6">
          <p className="text-sm text-destructive font-medium">Failed to load profile</p>
          <p className="text-xs text-destructive/80 mt-1">
            We couldn&apos;t load your profile data. Please refresh the page or try again later.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[680px]">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="font-serif text-[22px] text-text tracking-tight mb-1">Profile</h1>
        <p className="text-sm text-text-secondary mb-8">Manage your personal information</p>
      </motion.div>

      {/* Identity card */}
      <motion.div
        className="bg-surface/60 rounded-2xl border border-border p-6 mb-8"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-surface-hover flex items-center justify-center text-lg font-semibold text-text select-none">
              {initials}
            </div>
            <div>
              <p className="font-medium text-text text-[15px]">{profile?.display_name || 'User'}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Mail className="w-3 h-3 text-text-secondary" />
                <p data-testid="email-display" className="text-sm text-text-secondary">{profile?.email}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span data-testid="plan-badge" className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-surface-hover text-text border border-border">
              <Crown className="w-3 h-3 text-text-secondary" />
              {planLabel}
            </span>
            {planType === 'free' && (
              <Link
                href="/settings/billing"
                className="text-xs font-medium text-primary hover:text-primary/90 transition-colors"
              >
                Upgrade
              </Link>
            )}
          </div>
        </div>
      </motion.div>

      {/* Display Name */}
      <motion.div
        className="mb-8"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <label className="block text-sm font-medium text-text mb-2">Display Name</label>
        <div className="flex gap-3">
          <input
            type="text"
            value={displayNameInput}
            onChange={(e) => setDisplayNameInput(e.target.value)}
            data-testid="display-name-input"
            className="flex-1 max-w-sm px-4 py-2.5 bg-card border border-border rounded-xl text-sm text-text placeholder:text-text-muted focus:outline-none transition-colors"
            maxLength={32}
            placeholder="Enter your display name"
          />
          <button
            onClick={handleUpdateDisplayName}
            disabled={isSaving || !displayNameInput || displayNameInput === profile?.display_name}
            data-testid="save-profile-button"
            className="px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
        <p className="text-xs text-text-secondary mt-2">Up to 32 characters</p>
      </motion.div>

      {/* Separator */}
      <div className="border-t border-border my-8" />

      {/* Danger Zone */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <h3 className="text-sm font-medium text-red-500">Danger zone</h3>
        </div>
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text">Delete account</p>
              <p className="text-xs text-text-secondary mt-1">
                Permanently remove your account and all data. This cannot be undone.
              </p>
            </div>
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-xs font-medium text-text-secondary rounded-lg hover:bg-surface-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  className="px-4 py-2 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors"
                >
                  Confirm delete
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                data-testid="delete-account-button"
                className="px-4 py-2 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors shrink-0 ml-4"
              >
                Delete account
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
