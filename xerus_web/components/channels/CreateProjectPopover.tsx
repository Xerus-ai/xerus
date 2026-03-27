'use client'

import { useState, useRef, useEffect } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { apiCall } from '@/lib/api/client'

interface CreateProjectPopoverProps {
  children: React.ReactNode
  onCreated: () => Promise<void>
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export function CreateProjectPopover({
  children,
  onCreated,
  align = 'start',
  side = 'bottom',
}: CreateProjectPopoverProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      // Small delay so popover animation finishes before focus
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    } else {
      setName('')
    }
  }, [open])

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setIsCreating(true)
    try {
      await apiCall('/company/domains', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
      })
      setName('')
      setOpen(false)
      await onCreated()
    } catch {
      // apiCall shows toast on error
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        sideOffset={8}
        className="w-[260px] rounded-2xl bg-surface-alt border border-surface-active p-0 shadow-lg"
      >
        <div className="p-3">
          <div className="text-xs font-semibold text-text mb-2">New project</div>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') setOpen(false)
            }}
            placeholder="e.g. Product, Engineering..."
            disabled={isCreating}
            className="w-full px-3 py-2 rounded-xl bg-surface border border-surface-active text-sm text-text placeholder:text-text-muted outline-none focus-visible:ring-2 focus-visible:ring-primary focus:border-primary/40 focus:shadow-[0_2px_12px_rgba(255,102,0,0.08)] transition-all"
          />
          <div className="flex items-center justify-end gap-2 mt-3">
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 rounded-xl text-xs text-text-muted hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={isCreating || !name.trim()}
              className="px-4 py-1.5 rounded-xl text-xs font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isCreating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
