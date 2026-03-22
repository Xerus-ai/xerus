'use client'

import { cn } from '@/lib/utils'

const TABS = [
  { href: '/settings', label: 'Personal Profile', key: 'profile' },
  { href: '/settings/privacy', label: 'Data & Privacy', key: 'privacy' },
  { href: '/settings/billing', label: 'Billing', key: 'billing' },
  { href: '/settings/models', label: 'AI Models', key: 'models' },
] as const

type TabKey = (typeof TABS)[number]['key']

interface SettingsTabNavProps {
  activeTab: TabKey
  className?: string
}

export function SettingsTabNav({ activeTab, className }: SettingsTabNavProps) {
  return (
    <div className={cn('w-full mb-12 border-b border-surface-active', className)}>
      <nav className="flex space-x-10 justify-center">
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab
          return (
            <a
              key={tab.key}
              href={tab.href}
              className={cn(
                'pb-4 px-2 border-b-2 font-medium text-sm transition-colors',
                isActive
                  ? 'border-text text-text'
                  : 'border-transparent text-text-secondary hover:text-text hover:border-surface-active'
              )}
            >
              {tab.label}
            </a>
          )
        })}
      </nav>
    </div>
  )
}
