import React from 'react'
import { cn } from "@/lib/utils"

interface StatusBadgeProps {
    status: 'active' | 'inactive' | 'running' | 'stopped' | 'connected' | 'disconnected' | 'error' | string
    label?: string
    className?: string
    size?: 'sm' | 'md'
}

export function StatusBadge({ status, label, className, size = 'sm' }: StatusBadgeProps) {
    const getStatusStyles = (status: string) => {
        switch (status.toLowerCase()) {
            case 'active':
            case 'running':
            case 'connected':
            case 'success':
                return 'bg-green-50 text-green-700 border-green-200'
            case 'inactive':
            case 'stopped':
            case 'disconnected':
                return 'bg-surface-hover text-text-secondary border-surface-active'
            case 'error':
            case 'failed':
                return 'bg-red-50 text-red-700 border-red-200'
            case 'warning':
                return 'bg-yellow-50 text-yellow-700 border-yellow-200'
            case 'blue':
                return 'bg-[#FFF4E6] text-[#FF6600] border-[#FF6600]/20'
            default:
                return 'bg-surface-hover text-text-secondary border-surface-active'
        }
    }

    const getDotColor = (status: string) => {
        switch (status.toLowerCase()) {
            case 'active':
            case 'running':
            case 'connected':
            case 'success':
                return 'bg-green-500'
            case 'inactive':
            case 'stopped':
            case 'disconnected':
                return 'bg-surface-active'
            case 'error':
            case 'failed':
                return 'bg-red-500'
            case 'warning':
                return 'bg-yellow-500'
            case 'blue':
                return 'bg-[#FF6600]'
            default:
                return 'bg-surface-active'
        }
    }

    return (
        <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full font-medium border transition-colors",
            size === 'sm' ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm",
            getStatusStyles(status),
            className
        )}>
            <span className={cn("rounded-full", size === 'sm' ? "w-1.5 h-1.5" : "w-2 h-2", getDotColor(status))}></span>
            <span className="capitalize">{label || status}</span>
        </span>
    )
}
