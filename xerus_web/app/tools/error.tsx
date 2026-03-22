'use client'

import { ErrorBoundaryPage } from '@/components/common/ErrorBoundaryPage'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorBoundaryPage
      error={error}
      reset={reset}
      title="Failed to load tools"
      message="We couldn't load the tools marketplace. Check your connection and try again."
    />
  )
}
