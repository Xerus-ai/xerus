'use client'

import { useEffect, useCallback } from 'react'
import { toast } from 'sonner'

/**
 * Warns the user before leaving the page when there are unsaved changes.
 * Uses the `beforeunload` event to trigger browser's native confirmation dialog.
 */
export function useUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  /**
   * Call this before programmatic navigation (tab switch, route change).
   * Shows a warning toast if there are unsaved changes and returns true
   * to allow navigation (the beforeunload handler covers browser-level guards).
   */
  const confirmNavigation = useCallback((): boolean => {
    if (!isDirty) return true
    toast.warning('You have unsaved changes. Save before leaving.')
    return false
  }, [isDirty])

  return { confirmNavigation }
}
