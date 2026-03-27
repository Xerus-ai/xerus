'use client'

import { ErrorBoundaryPage } from '@/components/common/ErrorBoundaryPage'

export default function GlobalError({
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
      title="Something went wrong"
      message="An unexpected error occurred. Try refreshing or come back in a moment."
    />
  )
}
