'use client'

import { useEffect } from 'react'
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
import { GradientBackground } from '@/components/GradientBackground'

import { InviteCodeGate } from '@/components/InviteCodeGate'

// Code-split: only loaded on /login route
const LoginOverlay = dynamic(
  () => import('@/components/LoginOverlay').then(mod => ({ default: mod.LoginOverlay })),
  { ssr: false }
)

// Contextual loading screen — shows appropriate message per gate
function LoadingScreen({ title, subtitle }: { title?: string; subtitle?: string }) {
  return (
    <div className="flex h-screen items-center justify-center relative">
      <GradientBackground />
      <div className="flex flex-col items-center gap-8 animate-tab-in relative z-10">
        <img src="/logo/xerus.svg" alt="Xerus" className="w-20 h-20 animate-pulse" />

        {title ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-lg font-semibold text-text">{title}</p>
            {subtitle && (
              <p className="text-sm text-text-secondary">{subtitle}</p>
            )}
            <div className="w-56 h-1.5 bg-surface-active rounded-full overflow-hidden mt-1">
              <div className="h-full bg-[#FF6600] rounded-full animate-[loading_1.5s_ease-in-out_infinite]" />
            </div>
          </div>
        ) : (
          /* Minimal: no text — used during hydration & login auth check */
          <div className="w-40 h-1 bg-surface-active rounded-full overflow-hidden">
            <div className="h-full bg-[#FF6600]/70 rounded-full animate-[loading_1.5s_ease-in-out_infinite]" />
          </div>
        )}
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

  // Redirect authenticated users away from /login
  useEffect(() => {
    if (isAuthReady && user && isLoginPage) {
      router.push('/')
    }
  }, [isAuthReady, user, isLoginPage, router])

  // Redirect onboarded users away from /onboarding (prevent re-entry)
  useEffect(() => {
    if (isAuthReady && user && hasWorkspace && isOnboardingPage) {
      router.push('/')
    }
  }, [isAuthReady, user, hasWorkspace, isOnboardingPage, router])

  // Show loading screen while auth state is resolving
  if (!isAuthReady) {
    return isLoginPage
      ? <LoadingScreen />
      : <LoadingScreen title="Loading your workspace" subtitle="Verifying your session..." />
  }

  // Not authenticated — show loading while redirect to /login fires
  if (!user && !isLoginPage) {
    return <LoadingScreen title="Session expired" subtitle="Redirecting to sign in..." />
  }

  // User authenticated but needs invite code (checked BEFORE workspace redirect)
  if (user && inviteRequired && !isLoginPage) {
    return <InviteCodeGate email={user.email} />
  }

  // Not onboarded — show loading while redirect to /onboarding fires
  if (user && !hasWorkspace && !isOnboardingPage && !isLoginPage) {
    return <LoadingScreen title="Setting up your workspace" subtitle="Preparing your AI workforce..." />
  }

  // Onboarding page: no sidebar, full-screen onboarding chat
  if (isOnboardingPage && user) {
    return (
      <div className="flex h-screen overflow-hidden">
        <main className="flex-1 relative h-screen overflow-y-auto">
          {children}
        </main>
      </div>
    )
  }

  // Login page: full-screen overlay handles everything (bg, branding, form)
  if (isLoginPage) {
    return <LoginOverlay />
  }

  // Mobile layout: floating header + content + bottom bar
  if (isMobile) {
    return (
      <div className="flex flex-col h-screen relative">
        <GradientBackground />
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
    <div className="flex h-screen overflow-hidden relative">
      <GradientBackground />
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
            className="shrink-0 w-[var(--right-panel-width)] h-screen border-l border-surface-active overflow-y-auto"
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
