'use client'

import { memo } from 'react'
import { cn } from "@/lib/utils"
import type { LucideIcon } from 'lucide-react'
import {
  Loader2,
  Check,
  AlertCircle,
  Brain,
  Search,
  FileText,
  Zap,
  Users,
  GitBranch,
  CheckCircle2,
  Wrench,
  Globe,
  Database,
  FileSearch,
  Calculator,
  Code,
  Mail,
  Calendar,
  Twitter,
  Github
} from 'lucide-react'
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

export interface ExecutionStep {
  id: string
  name: string
  status: 'pending' | 'active' | 'completed' | 'failed'
  description?: string
  progress?: number
  startTime?: number
  endTime?: number
  data?: Record<string, unknown>
}

export interface ExecutionState {
  mode: 'simple' | 'planned' | 'coordinated' | 'team'
  currentNode?: string
  steps: ExecutionStep[]
  agents?: string[]
  totalSteps?: number
  completedSteps?: number
  error?: string
}

export interface ToolExecution {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  icon?: string
  parameters?: Record<string, unknown>
  result?: Record<string, unknown>
  startTime?: number
  endTime?: number
  error?: string
}

interface ExecutionProgressProps {
  state: ExecutionState
  activeTools?: ToolExecution[]
  className?: string
}

// Get icon for different nodes/steps
const getStepIcon = (stepName: string): LucideIcon => {
  const icons: Record<string, LucideIcon> = {
    classify: Brain,
    retrieve: FileText,
    tools: Zap,
    plan: GitBranch,
    execute: Zap,
    verify: CheckCircle2,
    generate: FileText,
    delegate: Users,
    search: Search
  }

  return icons[stepName.toLowerCase()] || Zap
}

// Get display name for nodes
const getStepDisplayName = (stepName: string): string => {
  const names: Record<string, string> = {
    classify: 'Analyzing request',
    retrieve: 'Retrieving knowledge',
    tools: 'Executing tools',
    plan: 'Creating execution plan',
    execute: 'Executing steps',
    execute_step: 'Executing step',
    verify: 'Verifying results',
    generate: 'Generating response',
    delegate: 'Coordinating agents',
    search: 'Searching',
    worker: 'Processing'
  }
  
  return names[stepName.toLowerCase()] || stepName
}

// Format duration
const formatDuration = (start?: number, end?: number): string => {
  if (!start) return ''
  const duration = (end || Date.now()) - start
  if (duration < 1000) return `${duration}ms`
  return `${(duration / 1000).toFixed(1)}s`
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
  const cleanName = toolName.replace(/^(mcp:|builtin:|custom:)/, '')
  return cleanName
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export const ExecutionProgress = memo(function ExecutionProgress({
  state,
  activeTools,
  className
}: ExecutionProgressProps) {
  if (!state || state.steps.length === 0) {
    return (
      <div className={cn(
        "border rounded-lg bg-card p-3 transition-all duration-300 animate-in fade-in-0 slide-in-from-top-2",
        className
      )}>
        <div className="flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span className="text-xs font-medium">Initializing...</span>
        </div>
      </div>
    )
  }
  
  const overallProgress = state.totalSteps 
    ? (state.completedSteps || 0) / state.totalSteps * 100
    : 0
  
  return (
    <div className={cn(
      "border rounded-lg bg-card p-3 space-y-2 transition-all duration-300 animate-in fade-in-0 slide-in-from-top-2",
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span className="text-xs font-medium">Processing</span>
          </div>
          <Badge variant="secondary" className="text-xs">
            {state.mode === 'planned' ? 'Multi-step' : 
             state.mode === 'team' ? 'Multi-agent' :
             state.mode === 'coordinated' ? 'Coordinated' : 
             'Simple'}
          </Badge>
        </div>
        
        {state.agents && state.agents.length > 0 && (
          <div className="flex items-center gap-1">
            <Users className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {state.agents.join(', ')}
            </span>
          </div>
        )}
      </div>
      
      {/* Overall progress bar */}
      {state.totalSteps && state.totalSteps > 1 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Step {state.completedSteps || 0} of {state.totalSteps}
            </span>
            <span className="text-muted-foreground">
              {Math.round(overallProgress)}%
            </span>
          </div>
          <Progress value={overallProgress} className="h-1.5" />
        </div>
      )}
      
      {/* Steps list */}
      <div className="space-y-2">
        {state.steps.map((step, index) => {
          const Icon = getStepIcon(step.name)
          const isActive = step.status === 'active'
          const isCompleted = step.status === 'completed'
          const isFailed = step.status === 'failed'

          // Find active tool for tool_execution step
          const activeTool = step.name === 'tool_execution' && activeTools && activeTools.length > 0
            ? activeTools.find(t => t.status === 'running')
            : null
          const ToolIcon = activeTool ? getToolIcon(activeTool.name) : null

          return (
            <div
              key={step.id}
              className={cn(
                "flex items-center gap-3 py-1.5 px-2 rounded-md transition-all duration-300 ease-out",
                "animate-in fade-in-0 slide-in-from-left-2",
                isActive && "bg-primary/5 shadow-sm",
                isCompleted && "opacity-60"
              )}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {/* Step icon/status */}
              <div className="flex-shrink-0">
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5 text-green-500 animate-in zoom-in-50 duration-200" />
                ) : isFailed ? (
                  <AlertCircle className="h-3.5 w-3.5 text-red-500 animate-in zoom-in-50 duration-200" />
                ) : isActive ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-muted transition-colors duration-200" />
                )}
              </div>

              {/* Step details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {/* Hide step icon when showing custom tool logo */}
                  {!activeTool?.icon || !(activeTool.icon.startsWith('http') || activeTool.icon.startsWith('/api')) ? (
                    <Icon className={cn(
                      "h-3 w-3 text-muted-foreground transition-all duration-200",
                      isActive && "text-primary animate-pulse"
                    )} />
                  ) : null}
                  {/* Show tool icon if this is a tool execution step */}
                  {activeTool?.icon && (
                    <>
                      {/* Custom icon (HTTP URL or path) */}
                      {(activeTool.icon.startsWith('http') || activeTool.icon.startsWith('/api')) ? (
                        <img
                          src={activeTool.icon}
                          alt={`${activeTool.name} icon`}
                          className="h-6 w-6 object-contain rounded"
                        />
                      ) : ToolIcon ? (
                        /* Fallback to Lucide icon or emoji */
                        <ToolIcon className={cn(
                          "h-3 w-3 text-muted-foreground transition-all duration-200",
                          isActive && "text-primary"
                        )} />
                      ) : (
                        /* Emoji fallback */
                        <span className="text-xs">{activeTool.icon}</span>
                      )}
                    </>
                  )}
                  <span className={cn(
                    "text-xs transition-all duration-200",
                    isActive && "font-medium",
                    isCompleted && "text-muted-foreground"
                  )}>
                    {activeTool
                      ? `Executing Tool - ${getToolDisplayName(activeTool.name)}`
                      : getStepDisplayName(step.name)
                    }
                  </span>

                  {/* Step-specific data (only show if not tool execution) */}
                  {step.data && !activeTool && (
                    <span className="text-xs text-muted-foreground">
                      {typeof step.data?.steps === 'number' ? `(${step.data.steps} steps)` : null}
                      {typeof step.data?.tool === 'string' ? `- ${step.data.tool}` : null}
                      {typeof step.data?.agent === 'string' ? `- ${step.data.agent}` : null}
                    </span>
                  )}
                </div>
                
                {/* Description */}
                {step.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {step.description}
                  </p>
                )}
                
                {/* Progress bar for active step */}
                {isActive && step.progress !== undefined && (
                  <div className="animate-in fade-in-0 slide-in-from-left-2 duration-300">
                    <Progress 
                      value={step.progress} 
                      className="h-1 mt-1" 
                    />
                  </div>
                )}
              </div>
              
              {/* Duration */}
              {(step.startTime || isActive) && (
                <span className="text-xs text-muted-foreground">
                  {formatDuration(step.startTime, step.endTime)}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Error message */}
      {state.error && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-red-50 dark:bg-red-950/20 animate-in fade-in-0 slide-in-from-top-2 duration-300">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 animate-pulse" />
          <p className="text-xs text-red-600 dark:text-red-400">
            {state.error}
          </p>
        </div>
      )}
    </div>
  )
})
