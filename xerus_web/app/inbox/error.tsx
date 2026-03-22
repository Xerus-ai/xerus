'use client'

import Image from 'next/image'

export default function InboxError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
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
        <h1 className="text-xl font-serif text-text">Failed to load inbox</h1>
        <p className="text-sm text-text-secondary max-w-sm">
          We couldn&apos;t load your inbox. Check your connection and try again.
        </p>
      </div>
      <button
        onClick={reset}
        className="px-5 py-2.5 bg-[#FF6600] hover:bg-[#E65C00] text-white font-medium rounded-xl transition-colors"
      >
        Try Again
      </button>
    </div>
  )
}
