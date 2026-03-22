'use client'

import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode, type ComponentType } from 'react'

/**
 * Sidebar slot: lets a page push a component into the AppSidebar body.
 *
 * The page registers a Component (not JSX) + stable props key.
 * The sidebar renders it. No re-render loops because we track
 * by a string key, not by JSX identity.
 */

interface SlotEntry {
  key: string
  Component: ComponentType
}

interface SidebarSlotContextType {
  slot: SlotEntry | null
  register: (key: string, Component: ComponentType) => void
  unregister: (key: string) => void
}

const Context = createContext<SidebarSlotContextType>({
  slot: null,
  register: () => {},
  unregister: () => {},
})

export function SidebarSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<SlotEntry | null>(null)

  const register = useCallback((key: string, Component: ComponentType) => {
    setSlot((prev) => (prev?.key === key ? prev : { key, Component }))
  }, [])

  const unregister = useCallback((key: string) => {
    setSlot((prev) => (prev?.key === key ? null : prev))
  }, [])

  return (
    <Context.Provider value={{ slot, register, unregister }}>
      {children}
    </Context.Provider>
  )
}

/**
 * Page calls: useSidebarSlotRegister('chat-sidebar', MyChatSidebar)
 * Registers on mount, unregisters on unmount. No re-render loop.
 */
export function useSidebarSlotRegister(key: string, Component: ComponentType) {
  const { register, unregister } = useContext(Context)
  const compRef = useRef(Component)
  compRef.current = Component

  useEffect(() => {
    register(key, compRef.current)
    return () => unregister(key)
  }, [key, register, unregister])
}

/**
 * Sidebar calls: const SlotContent = useSidebarSlotContent()
 * Returns the registered component or null.
 */
export function useSidebarSlotContent(): ComponentType | null {
  const { slot } = useContext(Context)
  return slot?.Component ?? null
}
