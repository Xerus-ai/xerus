'use client'

import { ErrorBoundaryPage } from '@/components/common/ErrorBoundaryPage'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorBoundaryPage
      error={error}
      reset={reset}
      title="Chat session error"
      message="Something went wrong with the chat session. Try refreshing to reconnect."
    />
  )
}
