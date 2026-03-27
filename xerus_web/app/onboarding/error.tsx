'use client'

import { ErrorBoundaryPage } from '@/components/common/ErrorBoundaryPage'

export default function OnboardingError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorBoundaryPage
      error={error}
      reset={reset}
      title="Onboarding error"
      message="Something went wrong during onboarding. Try refreshing to continue."
    />
  )
}
