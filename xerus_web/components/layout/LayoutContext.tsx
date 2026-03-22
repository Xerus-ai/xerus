'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'

interface LayoutContextValue {
  isSubSidebarVisible: boolean
  isRightPanelOpen: boolean
  rightPanelContent: React.ReactNode | null
  openRightPanel: (content: React.ReactNode) => void
  closeRightPanel: () => void
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
}

const LayoutContext = createContext<LayoutContextValue>({
  isSubSidebarVisible: false,
  isRightPanelOpen: false,
  rightPanelContent: null,
  openRightPanel: () => {},
  closeRightPanel: () => {},
  isMobile: false,
  isTablet: false,
  isDesktop: true,
})

const BREAKPOINT_MOBILE = 768
const BREAKPOINT_DESKTOP = 1280

export function LayoutProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [rightPanelContent, setRightPanelContent] =
    useState<React.ReactNode | null>(null)
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false)
  const [windowWidth, setWindowWidth] = useState(0)
  const [hasMeasured, setHasMeasured] = useState(false)

  useEffect(() => {
    const measure = () => {
      setWindowWidth(window.innerWidth)
      setHasMeasured(true)
    }

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const isMobile = hasMeasured && windowWidth < BREAKPOINT_MOBILE
  const isTablet =
    hasMeasured &&
    windowWidth >= BREAKPOINT_MOBILE &&
    windowWidth < BREAKPOINT_DESKTOP
  const isDesktop = !hasMeasured || windowWidth >= BREAKPOINT_DESKTOP

  const isSubSidebarVisible = pathname.startsWith('/inbox')

  const openRightPanel = useCallback((content: React.ReactNode) => {
    setRightPanelContent(content)
    setIsRightPanelOpen(true)
  }, [])

  const closeRightPanel = useCallback(() => {
    setIsRightPanelOpen(false)
    setRightPanelContent(null)
  }, [])

  return (
    <LayoutContext.Provider
      value={{
        isSubSidebarVisible,
        isRightPanelOpen,
        rightPanelContent,
        openRightPanel,
        closeRightPanel,
        isMobile,
        isTablet,
        isDesktop,
      }}
    >
      {children}
    </LayoutContext.Provider>
  )
}

export function useLayout() {
  return useContext(LayoutContext)
}
