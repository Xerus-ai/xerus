'use client'

import Image from 'next/image'

interface ErrorBoundaryPageProps {
  error: Error & { digest?: string }
  reset: () => void
  title?: string
  message?: string
}

export function ErrorBoundaryPage({
  error,
  reset,
  title = 'Something went wrong',
  message = 'An unexpected error occurred. Check your connection and try again.',
}: ErrorBoundaryPageProps) {
  return (
    <div className="min-h-screen bg-surface-alt flex flex-col items-center justify-center gap-6 px-4">
      <Image
        src="/logo/xerus.svg"
        alt="Xerus"
        width={48}
        height={48}
        className="opacity-40"
      />
      <div className="text-center space-y-2">
        <h1 className="text-xl font-serif text-text">{title}</h1>
        <p className="text-sm text-text-secondary max-w-sm">{message}</p>
      </div>
      <button
        onClick={reset}
        className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white font-medium rounded-xl transition-colors"
      >
        Try Again
      </button>
    </div>
  )
}
