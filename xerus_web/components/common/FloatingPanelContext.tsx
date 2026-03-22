'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'

interface FloatingPanelContextType {
    minimizedPanels: string[]
    registerMinimizedPanel: (id: string) => void
    unregisterMinimizedPanel: (id: string) => void
    getPanelPosition: (id: string) => number
}

const FloatingPanelContext = createContext<FloatingPanelContextType | undefined>(undefined)

export function FloatingPanelProvider({ children }: { children: React.ReactNode }) {
    const [minimizedPanels, setMinimizedPanels] = useState<string[]>([])

    const registerMinimizedPanel = useCallback((id: string) => {
        setMinimizedPanels(prev => {
            if (prev.includes(id)) return prev
            return [...prev, id]
        })
    }, [])

    const unregisterMinimizedPanel = useCallback((id: string) => {
        setMinimizedPanels(prev => prev.filter(p => p !== id))
    }, [])

    const getPanelPosition = useCallback((id: string) => {
        const index = minimizedPanels.indexOf(id)
        if (index === -1) return 0
        // Base right offset (24px) + (index * (width (200px) + gap (12px)))
        return 24 + (index * (220 + 12))
    }, [minimizedPanels])

    return (
        <FloatingPanelContext.Provider value={{ minimizedPanels, registerMinimizedPanel, unregisterMinimizedPanel, getPanelPosition }}>
            {children}
        </FloatingPanelContext.Provider>
    )
}

export function useFloatingPanelContext() {
    const context = useContext(FloatingPanelContext)
    if (context === undefined) {
        throw new Error('useFloatingPanelContext must be used within a FloatingPanelProvider')
    }
    return context
}
