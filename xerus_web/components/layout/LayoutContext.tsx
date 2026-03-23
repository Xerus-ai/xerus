'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react'

interface LayoutContextValue {
  isRightPanelOpen: boolean
  rightPanelContent: React.ReactNode | null
  openRightPanel: (content: React.ReactNode) => void
  closeRightPanel: () => void
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
}

const LayoutContext = createContext<LayoutContextValue>({
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
  const [rightPanelContent, setRightPanelContent] =
    useState<React.ReactNode | null>(null)
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false)
  const [windowWidth, setWindowWidth] = useState(0)
  const [hasMeasured, setHasMeasured] = useState(false)

  useEffect(() => {
    let rafId: number | null = null

    const measure = () => {
      setWindowWidth(window.innerWidth)
      setHasMeasured(true)
    }

    const onResize = () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('resize', onResize, { passive: true })
    return () => {
      window.removeEventListener('resize', onResize)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [])

  const isMobile = hasMeasured && windowWidth < BREAKPOINT_MOBILE
  const isTablet =
    hasMeasured &&
    windowWidth >= BREAKPOINT_MOBILE &&
    windowWidth < BREAKPOINT_DESKTOP
  const isDesktop = !hasMeasured || windowWidth >= BREAKPOINT_DESKTOP

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
