'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  FolderClosed,
  MessageSquare,
  Inbox,
  LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface MobileNavItem {
  name: string
  href: string
  icon: LucideIcon
}

const MOBILE_NAV_ITEMS: MobileNavItem[] = [
  { name: 'Workspace', href: '/workspace', icon: FolderClosed },
  { name: 'Chat', href: '/chat', icon: MessageSquare },
  { name: 'Inbox', href: '/inbox', icon: Inbox },
]

export function MobileBottomBar() {
  const pathname = usePathname()

  const isRouteActive = (href: string): boolean => {
    if (href === '/') {
      return pathname === '/'
    }
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-surface-active pb-[env(safe-area-inset-bottom)]"
      role="navigation"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around h-14">
        {MOBILE_NAV_ITEMS.map((item) => {
          const isActive = isRouteActive(item.href)
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 px-3 py-1 min-w-[56px]',
                'transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600] focus-visible:ring-offset-2 rounded-lg',
                isActive
                  ? 'text-[#FF6600]'
                  : 'text-text-muted hover:text-text-secondary'
              )}
              aria-label={item.name}
              aria-current={isActive ? 'page' : undefined}
            >
              <item.icon className="w-5 h-5" aria-hidden="true" />
              <span className="text-[10px] font-medium">{item.name}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
