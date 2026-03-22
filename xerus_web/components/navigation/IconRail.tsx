'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  MessageSquare,
  Inbox,
  Unplug,
  HardDrive,
  Settings,
  LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { UserMenu } from '@/components/UserMenu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useUnreadCounts } from '@/hooks/useUnreadCounts'

interface NavItem {
  name: string
  href: string
  icon: LucideIcon
  badge?: number
}

const NAV_ITEMS_BASE: Omit<NavItem, 'badge'>[] = [
  { name: 'Chat', href: '/chat', icon: MessageSquare },
  { name: 'Inbox', href: '/inbox', icon: Inbox },
  { name: 'Workspace', href: '/workspace', icon: HardDrive },
  { name: 'Connectors', href: '/tools', icon: Unplug },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function IconRail() {
  const pathname = usePathname()
  const { totalUnread } = useUnreadCounts()

  const navItems: NavItem[] = useMemo(() => {
    return NAV_ITEMS_BASE.map((item) => ({
      ...item,
      badge: item.name === 'Inbox' ? totalUnread : undefined,
    }))
  }, [totalUnread])

  const isRouteActive = (href: string): boolean => {
    if (href === '/') {
      return pathname === '/'
    }
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className="flex h-full w-[var(--icon-rail-width)] flex-col bg-surface border-r border-surface-active"
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-center shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/"
                className="flex items-center justify-center w-10 h-10 rounded-2xl transition-colors duration-200 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600] focus-visible:ring-offset-2"
                aria-label="Go to home"
              >
                <Image
                  src="/logo/xerus.svg"
                  alt="Xerus"
                  width={34}
                  height={34}
                  className="shrink-0"
                />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Home</TooltipContent>
          </Tooltip>
        </div>

        {/* Navigation Icons */}
        <nav className="flex-1 flex flex-col items-center gap-1 py-2" aria-label="Primary navigation">
          {navItems.map((item) => {
            const isActive = isRouteActive(item.href)
            return (
              <Tooltip key={item.name}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      'relative flex items-center justify-center w-10 h-10 rounded-2xl transition-colors duration-200',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600] focus-visible:ring-offset-2',
                      isActive
                        ? 'bg-[#FF6600]/10 text-[#FF6600]'
                        : 'text-text-secondary hover:bg-surface-hover hover:text-text'
                    )}
                    aria-label={item.name}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {/* Active indicator: 3px left border accent */}
                    {isActive && (
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[#FF6600]"
                        aria-hidden="true"
                      />
                    )}
                    <item.icon className="w-5 h-5" aria-hidden="true" />
                    {/* Badge for Inbox */}
                    {item.name === 'Inbox' && item.badge !== undefined && item.badge > 0 && (
                      <span
                        className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-[#FF6600] text-white text-[10px] font-semibold"
                        aria-label={`${item.badge} unread`}
                      >
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                    <span className="sr-only">{item.name}</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{item.name}</TooltipContent>
              </Tooltip>
            )
          })}
        </nav>

        {/* User Menu */}
        <div className="p-2 border-t border-surface-active mt-auto shrink-0">
          <UserMenu className="w-full [&_button]:px-1 [&_button]:py-1.5 [&_button]:justify-center [&_span.text-sm]:hidden [&_svg.w-4]:hidden" />
        </div>
      </aside>
    </TooltipProvider>
  )
}
