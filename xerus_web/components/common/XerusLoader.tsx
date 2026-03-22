'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'

interface XerusLoaderProps {
  /** Optional context line below the logo */
  message?: string
  /** full-page centered loader (default) or inline within a container */
  variant?: 'page' | 'inline'
  className?: string
}

/**
 * Branded Xerus loading screen.
 * Uses the squirrel logo with a gentle pulse — feels like Xerus, not a generic spinner.
 */
export function XerusLoader({ message, variant = 'page', className }: XerusLoaderProps) {
  if (variant === 'inline') {
    return (
      <div className={cn('flex flex-col items-center justify-center py-12 gap-4', className)}>
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-[#FF6600]/10 animate-ping" style={{ animationDuration: '2s' }} />
          <Image
            src="/logo/xerus.svg"
            alt="Loading"
            width={32}
            height={32}
            className="relative animate-pulse"
            style={{ animationDuration: '1.5s' }}
            priority
          />
        </div>
        {message && (
          <p className="text-sm text-text-muted animate-pulse" style={{ animationDuration: '2s' }}>
            {message}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className={cn('min-h-screen bg-surface-alt flex flex-col items-center justify-center gap-5', className)}>
      <div className="relative">
        <div className="absolute -inset-3 rounded-full bg-[#FF6600]/8 animate-ping" style={{ animationDuration: '2.5s' }} />
        <div className="absolute -inset-1.5 rounded-full bg-[#FF6600]/5 animate-pulse" style={{ animationDuration: '2s' }} />
        <Image
          src="/logo/xerus.svg"
          alt="Loading"
          width={48}
          height={48}
          className="relative animate-pulse"
          style={{ animationDuration: '1.5s' }}
          priority
        />
      </div>
      {message && (
        <p className="text-sm font-medium text-text-muted animate-pulse" style={{ animationDuration: '2s' }}>
          {message}
        </p>
      )}
    </div>
  )
}
