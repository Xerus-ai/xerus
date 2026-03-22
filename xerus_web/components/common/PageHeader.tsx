import React, { useState, useEffect, useMemo } from 'react'
import { Search, ChevronDown, Check } from 'lucide-react'
import { cn } from "@/lib/utils"
import { useDebounce } from 'use-debounce'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

// Primary categories to show as pills (most common/useful)
const PRIMARY_CATEGORIES = [
    'Productivity',
    'Artificial Intelligence (AI)',
    'Communication',
    'Developer Tools'
]

interface PageHeaderProps {
    description?: string
    badge?: string
    searchQuery?: string
    onSearchChange?: (query: string) => void
    searchPlaceholder?: string
    categories?: string[]
    selectedCategories?: string[]
    onToggleCategory?: (category: string) => void
    onClearCategories?: () => void
    className?: string
    children?: React.ReactNode
}

export function PageHeader({
    description,
    badge,
    searchQuery,
    onSearchChange,
    searchPlaceholder = "Search...",
    categories,
    selectedCategories = [],
    onToggleCategory,
    onClearCategories,
    className,
    children
}: PageHeaderProps) {
    const [inputValue, setInputValue] = useState(searchQuery || '')
    const [debouncedValue] = useDebounce(inputValue, 500)
    const [dropdownOpen, setDropdownOpen] = useState(false)

    useEffect(() => {
        setInputValue(searchQuery || '')
    }, [searchQuery])

    useEffect(() => {
        if (onSearchChange && debouncedValue !== searchQuery) {
            onSearchChange(debouncedValue)
        }
    }, [debouncedValue, onSearchChange, searchQuery])

    // Split categories into primary (shown as pills) and secondary (in dropdown)
    const { primaryCats, secondaryCats } = useMemo(() => {
        if (!categories) return { primaryCats: [], secondaryCats: [] }

        const allCats = categories.filter(cat => cat !== 'all')
        const primary = PRIMARY_CATEGORIES.filter(pc => allCats.includes(pc))
        const secondary = allCats.filter(cat => !PRIMARY_CATEGORIES.includes(cat))

        return { primaryCats: primary, secondaryCats: secondary }
    }, [categories])

    // Count selected categories in dropdown
    const selectedInDropdown = useMemo(() => {
        return secondaryCats.filter(cat => selectedCategories.includes(cat)).length
    }, [secondaryCats, selectedCategories])

    const isAllSelected = selectedCategories.length === 0

    return (
        <div className={cn("flex flex-col items-start max-w-4xl mb-16 w-full", className)}>
            {badge && (
                <span className="inline-block bg-surface text-text-secondary text-[10px] font-semibold uppercase tracking-widest px-4 py-1.5 rounded-full mb-6">
                    {badge}
                </span>
            )}


            {description && (
                <p className="text-xl text-text-secondary font-light mb-10 max-w-2xl">
                    {description}
                </p>
            )}

            {children}

            {/* Search & Filter Row */}
            {(onSearchChange || categories) && (
                <div className="flex flex-col items-start gap-6 w-full mt-2">
                    {onSearchChange && (
                        <div className="relative w-full max-w-md">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                            <input
                                type="text"
                                placeholder={searchPlaceholder}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-white/60 border border-surface-active rounded-full text-sm focus:outline-none focus:border-[#FF6600] transition-colors placeholder:text-text-secondary/60"
                            />
                        </div>
                    )}

                    {categories && categories.length > 0 && onToggleCategory && (
                        <div className="flex items-center gap-2 flex-wrap">
                            {/* All Button - Clears filters */}
                            <button
                                onClick={onClearCategories}
                                className={cn(
                                    "px-6 py-2 rounded-full text-sm font-medium transition-all",
                                    isAllSelected
                                        ? 'bg-[#261E1B] text-white shadow-sm'
                                        : 'bg-surface-hover text-text-secondary hover:text-text hover:bg-surface-pressed'
                                )}
                            >
                                All
                            </button>

                            {/* Primary Category Pills */}
                            {primaryCats.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => onToggleCategory(cat)}
                                    className={cn(
                                        "px-6 py-2 rounded-full text-sm font-medium transition-all",
                                        selectedCategories.includes(cat)
                                            ? 'bg-[#261E1B] text-white shadow-sm'
                                            : 'bg-surface-hover text-text-secondary hover:text-text hover:bg-surface-pressed'
                                    )}
                                >
                                    {cat}
                                </button>
                            ))}

                            {/* More Categories Dropdown */}
                            {secondaryCats.length > 0 && (
                                <Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
                                    <PopoverTrigger asChild>
                                        <button
                                            className={cn(
                                                "px-6 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2",
                                                selectedInDropdown > 0
                                                    ? 'bg-[#261E1B] text-white shadow-sm'
                                                    : 'bg-surface-hover text-text-secondary hover:text-text hover:bg-surface-pressed'
                                            )}
                                        >
                                            More
                                            {selectedInDropdown > 0 && (
                                                <span className="bg-white/20 text-xs px-1.5 py-0.5 rounded-full">
                                                    {selectedInDropdown}
                                                </span>
                                            )}
                                            <ChevronDown className={cn(
                                                "w-4 h-4 transition-transform",
                                                dropdownOpen && "rotate-180"
                                            )} />
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent
                                        className="w-64 p-2 bg-white border border-surface-active rounded-xl shadow-lg"
                                        align="start"
                                    >
                                        <div className="max-h-[300px] overflow-y-auto">
                                            {secondaryCats.map(cat => {
                                                const isSelected = selectedCategories.includes(cat)
                                                return (
                                                    <button
                                                        key={cat}
                                                        onClick={() => onToggleCategory(cat)}
                                                        className={cn(
                                                            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors",
                                                            isSelected
                                                                ? 'bg-surface-hover text-text'
                                                                : 'text-text-secondary hover:bg-surface-hover hover:text-text'
                                                        )}
                                                    >
                                                        <div className={cn(
                                                            "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                                                            isSelected
                                                                ? 'bg-[#261E1B] border-[#261E1B]'
                                                                : 'border-surface-active'
                                                        )}>
                                                            {isSelected && <Check className="w-3 h-3 text-white" />}
                                                        </div>
                                                        <span className="capitalize">{cat.replace('_', ' ')}</span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
