'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { User, Key, Server, HardDrive, CreditCard, LogOut, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logout } from '@/lib/api'
import { toast } from 'sonner'

const NAV_SECTIONS = [
  {
    label: 'Account',
    items: [
      { href: '/settings', label: 'Profile', icon: User },
      { href: '/settings/api-keys', label: 'API Keys', icon: Key },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { href: '/settings/workspace', label: 'Overview', icon: Server },
      { href: '/settings/data', label: 'Data', icon: HardDrive },
      { href: '/settings/billing', label: 'Billing', icon: CreditCard },
    ],
  },
]

const ALL_ITEMS = NAV_SECTIONS.flatMap((s) => s.items)

export function SettingsSidebar() {
  const pathname = usePathname()

  const handleLogout = async () => {
    try {
      await logout()
      toast.success('Signed out')
    } catch {
      toast.error('Sign out failed')
    }
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-[260px] flex-shrink-0 border-r border-surface-active/50 bg-surface-alt/60 flex-col">
        <div className="px-6 pt-7 pb-2">
          <h2 className="font-serif text-[22px] text-text tracking-tight">Settings</h2>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-6">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary mb-1.5 px-3">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = pathname === item.href
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] transition-all duration-150',
                        isActive
                          ? 'bg-surface-hover/80 text-text font-medium'
                          : 'text-text-secondary hover:bg-surface-hover/40 hover:text-text'
                      )}
                    >
                      <Icon className={cn('w-[15px] h-[15px]', isActive ? 'text-text' : 'text-text-secondary')} />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-surface-active/50 px-3 py-4 space-y-1">
          <div className="flex gap-4 px-3 mb-2">
            <a
              href="https://www.xerus.ai/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-text-secondary hover:text-text-secondary transition-colors inline-flex items-center gap-1"
            >
              Privacy <ExternalLink className="w-2.5 h-2.5" />
            </a>
            <a
              href="https://www.xerus.ai/terms-of-service"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-text-secondary hover:text-text-secondary transition-colors inline-flex items-center gap-1"
            >
              Terms <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 px-3 py-[7px] text-[13px] text-text-secondary hover:text-text rounded-lg hover:bg-surface-hover/40 transition-all duration-150 w-full"
          >
            <LogOut className="w-[15px] h-[15px] text-text-secondary" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile horizontal nav */}
      <div className="lg:hidden border-b border-surface-active/50 bg-surface-alt/60 px-2 py-2 overflow-x-auto scrollbar-none shrink-0">
        <nav className="flex gap-1 min-w-max">
          {ALL_ITEMS.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0',
                  isActive
                    ? 'bg-surface-hover/80 text-text'
                    : 'text-text-secondary hover:bg-surface-hover/40'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </>
  )
}
