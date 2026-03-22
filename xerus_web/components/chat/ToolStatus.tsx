'use client'

import { memo } from 'react'
import { cn } from "@/lib/utils"
import type { LucideIcon } from 'lucide-react'
import {
  Wrench,
  Globe,
  Search,
  Database,
  FileSearch,
  Calculator,
  Code,
  Mail,
  Calendar,
  Twitter,
  Github,
  FileText,
  Loader2,
  Check,
  X,
  AlertCircle
} from 'lucide-react'
import { Badge } from "@/components/ui/badge"

export interface ToolExecution {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  parameters?: Record<string, unknown>
  result?: Record<string, unknown>
  startTime?: number
  endTime?: number
  error?: string
}

interface ToolStatusProps {
  tools: ToolExecution[]
  className?: string
  compact?: boolean
}

// Get icon for different tools
const getToolIcon = (toolName: string): LucideIcon => {
  const name = toolName.toLowerCase()

  if (name.includes('search') || name.includes('perplexity')) return Search
  if (name.includes('web') || name.includes('browse')) return Globe
  if (name.includes('database') || name.includes('sql')) return Database
  if (name.includes('file') || name.includes('doc')) return FileSearch
  if (name.includes('calc')) return Calculator
  if (name.includes('code') || name.includes('execute')) return Code
  if (name.includes('email') || name.includes('mail')) return Mail
  if (name.includes('calendar') || name.includes('schedule')) return Calendar
  if (name.includes('twitter') || name.includes('tweet')) return Twitter
  if (name.includes('github') || name.includes('git')) return Github
  if (name.includes('text') || name.includes('write')) return FileText

  return Wrench
}

// Get display name for tools
const getToolDisplayName = (toolName: string): string => {
  // Remove prefixes like 'mcp:', 'builtin:', etc.
  const cleanName = toolName.replace(/^(mcp:|builtin:|custom:)/, '')
  
  // Convert snake_case or kebab-case to Title Case
  return cleanName
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Format duration
const formatDuration = (start?: number, end?: number): string => {
  if (!start) return ''
  const duration = (end || Date.now()) - start
  if (duration < 100) return `${duration}ms`
  if (duration < 1000) return `${Math.round(duration / 100) * 100}ms`
  return `${(duration / 1000).toFixed(1)}s`
}

export const ToolStatus = memo(function ToolStatus({
  tools,
  className,
  compact = false
}: ToolStatusProps) {
  if (!tools || tools.length === 0) {
    return null
  }
  
  // In compact mode, only show running tools
  const displayTools = compact 
    ? tools.filter(t => t.status === 'running')
    : tools
  
  if (displayTools.length === 0) {
    return null
  }
  
  if (compact) {
    // Compact inline display
    return (
      <div className={cn("flex items-center gap-2 flex-wrap", className)}>
        {displayTools.map((tool, index) => {
          const Icon = getToolIcon(tool.name)
          
          return (
            <Badge
              key={tool.id}
              variant="secondary"
              className="text-xs py-0.5 px-2 animate-in fade-in-0 slide-in-from-bottom-1 duration-200"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              <Icon className="h-3 w-3 mr-1" />
              {getToolDisplayName(tool.name)}
            </Badge>
          )
        })}
      </div>
    )
  }
  
  // Full display
  return (
    <div className={cn(
      "border rounded-lg bg-card p-3 space-y-2 transition-all duration-300 animate-in fade-in-0 slide-in-from-top-2",
      className
    )}>
      <div className="flex items-center gap-2 text-xs font-medium">
        <Wrench className="h-3.5 w-3.5 text-primary" />
        <span>Active Tools</span>
        <Badge variant="outline" className="text-xs">
          {tools.length}
        </Badge>
      </div>
      
      <div className="space-y-1.5">
        {tools.map((tool, index) => {
          const Icon = getToolIcon(tool.name)
          const isRunning = tool.status === 'running'
          const isCompleted = tool.status === 'completed'
          const isFailed = tool.status === 'failed'
          
          return (
            <div
              key={tool.id}
              className={cn(
                "flex items-center gap-2 py-1 px-2 rounded-md text-xs transition-all duration-300 ease-out",
                "animate-in fade-in-0 slide-in-from-left-2",
                isRunning && "bg-primary/5 shadow-sm",
                isCompleted && "bg-green-50 dark:bg-green-950/20",
                isFailed && "bg-red-50 dark:bg-red-950/20"
              )}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {/* Status icon */}
              <div className="flex-shrink-0">
                {isRunning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : isCompleted ? (
                  <Check className="h-3.5 w-3.5 text-green-500 animate-in zoom-in-50 duration-200" />
                ) : isFailed ? (
                  <X className="h-3.5 w-3.5 text-red-500 animate-in zoom-in-50 duration-200" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-muted transition-colors duration-200" />
                )}
              </div>
              
              {/* Tool icon and name */}
              <Icon className={cn(
                "h-3.5 w-3.5 text-muted-foreground transition-all duration-200",
                isRunning && "text-primary animate-pulse"
              )} />
              <span className={cn(
                "flex-1 min-w-0 truncate transition-all duration-200",
                isRunning && "font-medium"
              )}>
                {getToolDisplayName(tool.name)}
              </span>
              
              {/* Parameters preview (if any) */}
              {tool.parameters && Object.keys(tool.parameters).length > 0 && (
                <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                  {typeof Object.values(tool.parameters)[0] === 'string'
                    ? (Object.values(tool.parameters)[0] as string)
                    : JSON.stringify(Object.values(tool.parameters)[0])}
                </span>
              )}
              
              {/* Duration */}
              {tool.startTime && (
                <span className="text-xs text-muted-foreground">
                  {formatDuration(tool.startTime, tool.endTime)}
                </span>
              )}
            </div>
          )
        })}
      </div>
      
      {/* Show any errors */}
      {tools.some(t => t.error) && (
        <div className="mt-2 space-y-1 animate-in fade-in-0 slide-in-from-top-2 duration-300">
          {tools.filter(t => t.error).map((tool, index) => (
            <div
              key={tool.id}
              className="text-xs text-red-600 dark:text-red-400 px-2 flex items-center gap-1"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <AlertCircle className="h-3 w-3 flex-shrink-0" />
              <span>{tool.name}: {tool.error}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})
