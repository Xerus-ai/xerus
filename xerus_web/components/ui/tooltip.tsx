"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
    React.ElementRef<typeof TooltipPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
    <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
            "z-50 overflow-hidden rounded-lg border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md origin-[--radix-tooltip-content-transform-origin] animate-in fade-in-0 zoom-in-[0.97] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97] data-[state=delayed-open]:data-[side=bottom]:slide-in-from-top-1 data-[state=delayed-open]:data-[side=left]:slide-in-from-right-1 data-[state=delayed-open]:data-[side=right]:slide-in-from-left-1 data-[state=delayed-open]:data-[side=top]:slide-in-from-bottom-1 data-[state=instant-open]:duration-0",
            className
        )}
        {...props}
    />
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
