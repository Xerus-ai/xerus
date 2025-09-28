'use client'

import React from 'react'
import { cn } from '@/lib/utils'

type PageProps = {
  children: React.ReactNode
  className?: string
  /** If true, skips the centered container and lets content be full-bleed */
  bleed?: boolean
}

export function Page({ children, className, bleed = false }: PageProps) {
  return (
    <div className={cn('min-h-screen bg-background', className)}>
      <div className={cn(bleed ? undefined : 'max-w-7xl mx-auto px-6 lg:px-10 py-8 lg:py-12')}>{children}</div>
    </div>
  )
}

type PageHeaderProps = {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-8 lg:mb-10 flex flex-col gap-3 lg:gap-4', className)} suppressHydrationWarning>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-heading tracking-tight text-3xl md:text-4xl font-semibold text-foreground">
            {title}
          </h1>
          {description ? (
            <p className="text-description mt-2">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex-shrink-0" suppressHydrationWarning>{actions}</div> : null}
      </div>
    </div>
  )
}

type SectionProps = {
  title?: string
  description?: string
  className?: string
  children: React.ReactNode
}

export function Section({ title, description, className, children }: SectionProps) {
  return (
    <section className={cn('space-y-4', className)}>
      {(title || description) && (
        <div>
          {title ? (
            <h2 className="font-heading text-xl md:text-2xl font-semibold text-foreground">{title}</h2>
          ) : null}
          {description ? <p className="text-description mt-1">{description}</p> : null}
        </div>
      )}
      {children}
    </section>
  )
}

export default Page


