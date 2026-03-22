'use client'

import { ErrorBoundaryPage } from '@/components/common/ErrorBoundaryPage'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorBoundaryPage
      error={error}
      reset={reset}
      title="Settings error"
      message="We couldn't load your settings. Check your connection and try again."
    />
  )
}
