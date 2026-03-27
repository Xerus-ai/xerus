'use client'

import { ErrorBoundaryPage } from '@/components/common/ErrorBoundaryPage'

export default function SkillsError({
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
      title="Skills error"
      message="Something went wrong loading skills. Try refreshing to reconnect."
    />
  )
}
