'use client'

import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { SettingsSidebar } from '@/components/settings/SettingsSidebar'
import { X } from 'lucide-react'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  const handleClose = useCallback(() => {
    router.push('/')
  }, [router])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [handleClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 lg:p-8 animate-in fade-in duration-200">
      {/* Dimmed + blurred backdrop */}
      <div
        className="absolute inset-0 bg-text/20 backdrop-blur-[3px]"
        onClick={handleClose}
      />

      {/* Settings modal */}
      <div className="relative flex flex-col lg:flex-row w-full h-full lg:max-w-[1140px] lg:max-h-[88vh] lg:rounded-2xl bg-surface-alt shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <SettingsSidebar />

        <main className="flex-1 overflow-y-auto relative scrollbar-thin">
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-5 right-5 z-10 w-8 h-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-text hover:bg-surface-hover/60 transition-all"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="px-6 py-7 lg:px-10 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
