'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { LoginOverlay } from '@/components/LoginOverlay'
import { AuthProvider } from '@/utils/AuthContext'
import { SWRProvider } from '@/lib/swr-config'
import { LayoutProvider, useLayout } from '@/components/layout/LayoutContext'
import { WorkspaceSectionProvider } from '@/components/layout/WorkspaceSectionContext'
import { SidebarSlotProvider } from '@/components/layout/SidebarSlotContext'
import { AppSidebar } from '@/components/navigation/AppSidebar'
// SubSidebar content is now integrated into AppSidebar
import { MobileBottomBar } from '@/components/navigation/MobileBottomBar'
import { MotionConfig } from 'framer-motion'
import { cn } from '@/lib/utils'

function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const {
    isRightPanelOpen,
    rightPanelContent,
    isMobile,
  } = useLayout()

  const isLoginPage = pathname === '/login'

  // Login page: no sidebar, overlay
  if (isLoginPage) {
    return (
      <div className="flex h-screen overflow-hidden bg-surface-alt relative">
        <main className="flex-1 relative h-screen overflow-y-auto filter blur-sm">
          <div className="h-full flex items-center justify-center p-8">
            <div className="text-center text-text-secondary">
              <h2 className="text-xl font-semibold mb-2">AI Agents Dashboard</h2>
              <p>Sign in to access your personalized AI assistants</p>
            </div>
          </div>
        </main>
        <LoginOverlay />
      </div>
    )
  }

  // Mobile layout: content only + bottom bar
  if (isMobile) {
    return (
      <div className="flex flex-col h-screen bg-surface-alt">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-[#FF6600] focus:text-white focus:rounded-xl focus:text-sm focus:font-medium"
        >
          Skip to main content
        </a>
        <main id="main-content" className="flex-1 relative overflow-y-auto pb-14">
          {children}
        </main>
        <MobileBottomBar />
      </div>
    )
  }

  // Desktop and Tablet layout
  return (
    <div className="flex h-screen overflow-hidden bg-surface-alt relative">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-[#FF6600] focus:text-white focus:rounded-xl focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      {/* App Sidebar — always visible on desktop/tablet */}
      <div className="shrink-0 hidden md:block">
        <AppSidebar />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex min-w-0">
        <main
          id="main-content"
          className="flex-1 relative h-screen min-w-0 overflow-y-auto"
        >
          {children}
        </main>

        {/* Right Panel */}
        {isRightPanelOpen && rightPanelContent && (
          <aside
            className="shrink-0 w-[var(--right-panel-width)] h-screen border-l border-surface-active bg-surface overflow-y-auto"
            role="complementary"
            aria-label="Detail panel"
          >
            {rightPanelContent}
          </aside>
        )}
      </div>
    </div>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => { setIsMounted(true) }, [])

  if (!isMounted) {
    return (
      <div className="flex h-screen overflow-hidden bg-surface-alt relative">
        <div className="flex-none w-[280px] h-full bg-surface border-r border-surface-active" />
        <main className="flex-1 relative h-screen overflow-y-auto">{children}</main>
      </div>
    )
  }

  return (
    <AuthProvider>
      <SWRProvider>
        <MotionConfig reducedMotion="user">
          <LayoutProvider>
            <WorkspaceSectionProvider>
              <SidebarSlotProvider>
                <LayoutShell>{children}</LayoutShell>
              </SidebarSlotProvider>
            </WorkspaceSectionProvider>
          </LayoutProvider>
        </MotionConfig>
      </SWRProvider>
    </AuthProvider>
  )
}
