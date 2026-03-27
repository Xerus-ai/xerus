'use client'

import { ErrorBoundaryPage } from '@/components/common/ErrorBoundaryPage'

export default function WorkspaceError({
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
      title="Workspace error"
      message="Something went wrong loading your workspace. Try refreshing to reconnect."
    />
  )
}
