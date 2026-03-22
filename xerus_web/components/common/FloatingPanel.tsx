import React, { useState, useEffect, useId } from 'react'
import { X, Minus, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFloatingPanelContext } from './FloatingPanelContext'
import { motion, AnimatePresence } from 'framer-motion'

interface FloatingPanelProps {
    isOpen: boolean
    onClose: () => void
    title: string
    icon: React.ReactNode
    children: React.ReactNode | ((props: { close: () => void; minimize: () => void }) => React.ReactNode)
    minimizedTitle?: string
    className?: string
    variant?: 'default' | 'clean'
}

export function FloatingPanel({
    isOpen,
    onClose,
    title,
    icon,
    children,
    minimizedTitle,
    className,
    variant = 'default'
}: FloatingPanelProps) {
    const [isMinimized, setIsMinimized] = useState(false)
    const panelId = useId()
    const { registerMinimizedPanel, unregisterMinimizedPanel, getPanelPosition } = useFloatingPanelContext()

    // Reset minimized state when opened
    useEffect(() => {
        if (isOpen) {
            setIsMinimized(false)
        }
    }, [isOpen])

    // Register/Unregister with context when minimized state changes
    useEffect(() => {
        if (isOpen && isMinimized) {
            registerMinimizedPanel(panelId)
        } else {
            unregisterMinimizedPanel(panelId)
        }
        return () => unregisterMinimizedPanel(panelId)
    }, [isOpen, isMinimized, panelId, registerMinimizedPanel, unregisterMinimizedPanel])

    return (
        <AnimatePresence>
            {isOpen && (
                isMinimized ? (
                    <motion.div
                        key="minimized"
                        initial={{ opacity: 0, scale: 0.8, y: 20, right: getPanelPosition(panelId) }}
                        animate={{
                            opacity: 1,
                            scale: 1,
                            y: 0,
                            right: getPanelPosition(panelId)
                        }}
                        exit={{ opacity: 0, scale: 0.8, y: 20, right: getPanelPosition(panelId) }}
                        transition={{ type: "spring", stiffness: 350, damping: 25 }}
                        className="fixed bottom-6 z-50 bg-text text-white rounded-xl shadow-xl cursor-pointer hover:bg-[#1a1a1a] flex items-center gap-3 px-4 py-3 w-[220px]"
                        onClick={() => setIsMinimized(false)}
                    >
                        {icon}
                        <span className="font-medium truncate text-sm">{minimizedTitle || title}</span>
                        <ChevronUp className="w-4 h-4 opacity-50 ml-auto" />
                    </motion.div>
                ) : (
                    <motion.div
                        key="expanded"
                        initial={{ opacity: 0, scale: 0.9, y: 20, right: getPanelPosition(panelId) }}
                        animate={{ opacity: 1, scale: 1, y: 0, right: 24 }}
                        exit={{
                            opacity: 0,
                            scale: 0.9,
                            y: 20,
                            right: getPanelPosition(panelId),
                            transition: { duration: 0.2 }
                        }}
                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                        className={cn(
                            "fixed bottom-6 z-50 w-[540px] rounded-xl shadow-2xl border border-surface-active flex flex-col overflow-hidden font-sans",
                            variant === 'default' ? "bg-surface-alt" : "bg-white",
                            className
                        )}
                    >
                        {variant === 'default' ? (
                            <>
                                {/* Header */}
                                <div className="flex items-center justify-between px-5 py-4 bg-text text-white shrink-0">
                                    <h3 className="font-medium flex items-center gap-2">
                                        {icon}
                                        {title}
                                    </h3>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => setIsMinimized(true)}
                                            className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                                            aria-label="Minimize"
                                        >
                                            <Minus className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={onClose}
                                            className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                                            aria-label="Close"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Body */}
                                <div className="flex-1 overflow-y-auto max-h-[70vh] p-5">
                                    {typeof children === 'function'
                                        ? children({ close: onClose, minimize: () => setIsMinimized(true) })
                                        : children}
                                </div>
                            </>
                        ) : (
                            <div className="h-full w-full flex flex-col">
                                {typeof children === 'function'
                                    ? children({ close: onClose, minimize: () => setIsMinimized(true) })
                                    : children}
                            </div>
                        )}
                    </motion.div>
                )
            )}
        </AnimatePresence>
    )
}
