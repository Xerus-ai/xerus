'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { AuthProvider, useAuth } from '@/utils/AuthContext'
import { SWRProvider } from '@/lib/swr-config'
import { LayoutProvider, useLayout } from '@/components/layout/LayoutContext'
import { WorkspaceSectionProvider } from '@/components/layout/WorkspaceSectionContext'
import { SidebarSlotProvider } from '@/components/layout/SidebarSlotContext'
import { AppSidebar } from '@/components/navigation/AppSidebar'
import { MobileBottomBar } from '@/components/navigation/MobileBottomBar'
import { MobileHeader } from '@/components/navigation/MobileHeader'
import { MotionConfig } from 'framer-motion'

import { InviteCodeGate } from '@/components/InviteCodeGate'

// Code-split: only loaded on /login route
const LoginOverlay = dynamic(
  () => import('@/components/LoginOverlay').then(mod => ({ default: mod.LoginOverlay })),
  { ssr: false }
)

// Loading screen shown during auth check and initial hydration
function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-surface-alt">
      <div className="flex flex-col items-center gap-6">
        <img src="/logo/xerus.svg" alt="Xerus" className="w-14 h-14 animate-pulse" />
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm font-medium text-text">Getting your workspace ready</p>
          <div className="w-48 h-1 bg-surface-active rounded-full overflow-hidden">
            <div className="h-full bg-[#FF6600] rounded-full animate-[loading_1.5s_ease-in-out_infinite]" />
          </div>
        </div>
      </div>
    </div>
  )
}

function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, isAuthReady, hasWorkspace, inviteRequired } = useAuth()
  const {
    isRightPanelOpen,
    rightPanelContent,
    isMobile,
  } = useLayout()

  const isLoginPage = pathname === '/login'
  const isOnboardingPage = pathname === '/onboarding'

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (isAuthReady && !user && !isLoginPage) {
      router.push('/login')
    }
  }, [isAuthReady, user, isLoginPage, router])

  // Redirect users without a workspace to onboarding
  useEffect(() => {
    if (isAuthReady && user && !hasWorkspace && !isOnboardingPage && !isLoginPage) {
      router.push('/onboarding')
    }
  }, [isAuthReady, user, hasWorkspace, isOnboardingPage, isLoginPage, router])

  // Redirect onboarded users away from /onboarding (prevent re-entry)
  useEffect(() => {
    if (isAuthReady && user && hasWorkspace && isOnboardingPage) {
      router.push('/')
    }
  }, [isAuthReady, user, hasWorkspace, isOnboardingPage, router])

  // Show loading screen while auth state is resolving
  if (!isAuthReady) {
    return <LoadingScreen />
  }

  // Not authenticated — show loading while redirect to /login fires
  if (!user && !isLoginPage) {
    return <LoadingScreen />
  }

  // User authenticated but needs invite code (checked BEFORE workspace redirect)
  if (user && inviteRequired && !isLoginPage) {
    return <InviteCodeGate email={user.email} />
  }

  // Not onboarded — show loading while redirect to /onboarding fires
  if (user && !hasWorkspace && !isOnboardingPage && !isLoginPage) {
    return <LoadingScreen />
  }

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

  // Mobile layout: floating header + content + bottom bar
  if (isMobile) {
    return (
      <div className="flex flex-col h-screen bg-surface-alt">
        <a
          href="#main-content"
          className="absolute -top-full left-2 z-[100] px-4 py-2 bg-[#FF6600] text-white rounded-xl text-sm font-medium focus:top-2 focus:outline-none transition-[top]"
        >
          Skip to main content
        </a>
        <MobileHeader />
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
        className="absolute -top-full left-2 z-[100] px-4 py-2 bg-[#FF6600] text-white rounded-xl text-sm font-medium focus:top-2 focus:outline-none transition-[top]"
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
    return <LoadingScreen />
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
