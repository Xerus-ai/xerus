import React from 'react'
import Link from 'next/link'
import { cn } from "@/lib/utils"

interface ResourceCardProps {
    id: string
    title: string
    description?: string
    icon?: React.ReactNode | string
    href?: string
    stats?: React.ReactNode
    actions?: React.ReactNode
    headerActions?: React.ReactNode
    className?: string
    onClick?: () => void
}

export function ResourceCard({
    id,
    title,
    description,
    icon,
    href,
    stats,
    actions,
    headerActions,
    className,
    onClick
}: ResourceCardProps) {
    const CardContent = (
        <div className={cn(
            "bg-surface p-5 rounded-[24px] flex flex-col h-full border border-transparent hover:border-surface-active transition-colors duration-300 relative group",
            className
        )}>
            {/* Header: Icon & Name & Header Actions */}
            <div className="flex items-center gap-4 mb-3">
                <div className="w-14 h-14 flex items-center justify-center bg-surface-hover rounded-xl text-2xl shrink-0 overflow-hidden">
                    {typeof icon === 'string' ? (
                        icon.startsWith('http') || icon.startsWith('/') ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={icon} alt={title} className="w-10 h-10 object-contain" />
                        ) : (
                            <span>{icon}</span>
                        )
                    ) : (
                        icon
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <h3 className="font-serif text-lg text-text leading-tight line-clamp-1" title={title}>{title}</h3>
                        {headerActions && (
                            <div className="flex items-center gap-2 shrink-0">
                                {headerActions}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {description && (
                <p className="text-sm text-text-secondary mb-4 leading-relaxed line-clamp-2 min-h-[38px]">
                    {description}
                </p>
            )}

            {/* Stats Row */}
            {stats && (
                <div className="flex items-center gap-4 mb-6 text-xs text-text-secondary">
                    {stats}
                </div>
            )}

            {/* Action Buttons */}
            {actions && (
                <div className="mt-auto flex items-center gap-3">
                    {actions}
                </div>
            )}
        </div>
    )

    if (href) {
        // If there's an href, we might want the whole card to be clickable or just parts.
        // The design in tools page had a "Manage" button.
        // If we wrap the whole card in Link, nested buttons might cause issues.
        // So we'll just render the div, and let the actions handle navigation or the user can pass a Link as an action.
        // However, if the user wants the whole card to be a link, they can wrap this component or we can support it.
        // For now, let's assume actions handle navigation to keep it flexible.
        return CardContent
    }

    return (
        <div onClick={onClick} className={cn(onClick && "cursor-pointer")}>
            {CardContent}
        </div>
    )
}
