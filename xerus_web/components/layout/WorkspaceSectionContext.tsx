'use client'

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'

export type WorkspaceSection = 'agents' | 'skills' | 'connectors' | 'knowledge' | 'memory' | 'projects' | 'files' | 'browse'

interface WorkspaceSectionContextType {
  activeSection: WorkspaceSection
  setActiveSection: (section: WorkspaceSection) => void
  navigateToPath: (path: string) => void
  consumePendingPath: () => string | null
}

const Context = createContext<WorkspaceSectionContextType>({
  activeSection: 'agents',
  setActiveSection: () => {},
  navigateToPath: () => {},
  consumePendingPath: () => null,
})

export function WorkspaceSectionProvider({ children }: { children: ReactNode }) {
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('agents')
  // Ref, not state — transient signal data, consumed once (rule: rerender-use-ref-transient-values)
  const pendingPathRef = useRef<string | null>(null)

  const handleSetSection = useCallback((section: WorkspaceSection) => {
    setActiveSection(section)
    pendingPathRef.current = null
  }, [])

  const navigateToPath = useCallback((path: string) => {
    pendingPathRef.current = path
    setActiveSection('browse')
  }, [])

  const consumePendingPath = useCallback(() => {
    const path = pendingPathRef.current
    pendingPathRef.current = null
    return path
  }, [])

  return (
    <Context.Provider value={{ activeSection, setActiveSection: handleSetSection, navigateToPath, consumePendingPath }}>
      {children}
    </Context.Provider>
  )
}

export function useWorkspaceSection() {
  return useContext(Context)
}
