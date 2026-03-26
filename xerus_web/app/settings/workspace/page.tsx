'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRedirectIfNotAuth } from '@/utils/AuthContext'
import { getCreditBalance, type CreditBalance } from '@/lib/api/user'
import {
  getStatus as getWorkspaceStatus,
  pauseWorkspace,
  startWorkspace,
  stopWorkspace,
  triggerBackup,
} from '@/lib/api/workspace'
import type { WorkspaceStatus } from '@/lib/api/workspace'
import { Cpu, HardDrive, MemoryStick, Server, Sparkles, Play, Pause, Square, Archive, Bot, Puzzle, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from '@/lib/toast'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const PLAN_CREDITS: Record<string, number> = {
  free: 10,
  starter: 2500,
  advanced: 10000,
  prodigy: 100000,
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  advanced: 'Advanced',
  prodigy: 'Prodigy',
}

// Per-pod resource allocation by plan tier
const PLAN_RESOURCES: Record<string, { vcpus: number; memoryGb: number; storageGb: number }> = {
  free:     { vcpus: 1, memoryGb: 1, storageGb: 5 },
  starter:  { vcpus: 1, memoryGb: 2, storageGb: 10 },
  advanced: { vcpus: 2, memoryGb: 4, storageGb: 25 },
  prodigy:  { vcpus: 4, memoryGb: 8, storageGb: 50 },
}

const POD_ENV = {
  os: 'Ubuntu 24.04',
  region: 'Nuremberg, EU',
} as const

export default function WorkspaceOverviewPage() {
  const user = useRedirectIfNotAuth()
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus | null>(null)
  const [workspaceLoading, setWorkspaceLoading] = useState(true)
  const [workspaceAction, setWorkspaceAction] = useState<string | null>(null)
  const [credits, setCredits] = useState<CreditBalance | null>(null)

  const fetchWorkspaceStatus = useCallback(async () => {
    try {
      const status = await getWorkspaceStatus()
      setWorkspaceStatus(status)
    } catch {
      // Status unavailable
    } finally {
      setWorkspaceLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    fetchWorkspaceStatus()
    getCreditBalance().then(setCredits).catch(() => {})
  }, [user, fetchWorkspaceStatus])

  const handleAction = async (
    action: string,
    fn: () => Promise<void>,
    successMsg: string
  ) => {
    setWorkspaceAction(action)
    try {
      await fn()
      toast.success(successMsg)
      await fetchWorkspaceStatus()
    } catch {
      toast.error("Something went wrong", { description: 'Please try again in a moment.' })
    } finally {
      setWorkspaceAction(null)
    }
  }

  const isRunning = workspaceStatus?.sandbox_running
  const planType = credits?.plan_type || 'free'
  const podResources = PLAN_RESOURCES[planType] || PLAN_RESOURCES.free
  const totalCredits = credits ? PLAN_CREDITS[credits.plan_type] || 10 : 10
  const creditsPercent = credits ? Math.min(100, (credits.credits_available / totalCredits) * 100) : 0

  const formatResetDate = (iso: string): string => {
    const reset = new Date(iso)
    const now = new Date()
    const diffDays = Math.ceil((reset.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays <= 0) return 'Resets today'
    if (diffDays === 1) return 'Resets tomorrow'
    return `Resets in ${diffDays} days`
  }

  return (
    <div className="max-w-[680px]">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="font-serif text-[22px] text-text tracking-tight mb-1">Workspace</h1>
        <p className="text-sm text-text-secondary mb-8">
          Your pod environment and resource usage
        </p>
      </motion.div>

      {/* Pod Status */}
      <motion.div
        className="bg-surface/60 rounded-2xl border border-surface-active/60 p-6 mb-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-surface-hover flex items-center justify-center">
              <Server className="w-4 h-4 text-text-secondary" />
            </div>
            <div>
              <p className="text-sm font-medium text-text">Pod</p>
              {workspaceStatus?.sandbox_id && (
                <p className="text-[11px] text-text-secondary font-mono mt-0.5">
                  {workspaceStatus.sandbox_id}
                </p>
              )}
            </div>
          </div>
          {workspaceLoading ? (
            <div className="h-6 w-20 rounded-full animate-shimmer" />
          ) : (
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'w-2 h-2 rounded-full',
                  isRunning ? 'bg-emerald-500' : 'bg-text-secondary/40'
                )}
              />
              <span
                className={cn(
                  'text-xs font-medium',
                  isRunning ? 'text-emerald-600' : 'text-text-secondary'
                )}
              >
                {isRunning ? 'Running' : 'Stopped'}
              </span>
            </div>
          )}
        </div>

        {/* Pod Resources */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-surface-hover/50 border border-surface-active/40 rounded-xl p-3.5 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Cpu className="w-3.5 h-3.5 text-text-secondary" />
            </div>
            <p className="text-lg font-semibold text-text">{podResources.vcpus}</p>
            <p className="text-[11px] text-text-secondary">vCPUs</p>
          </div>
          <div className="bg-surface-hover/50 border border-surface-active/40 rounded-xl p-3.5 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <MemoryStick className="w-3.5 h-3.5 text-text-secondary" />
            </div>
            <p className="text-lg font-semibold text-text">{podResources.memoryGb} <span className="text-sm font-normal text-text-secondary">GB</span></p>
            <p className="text-[11px] text-text-secondary">Memory</p>
          </div>
          <div className="bg-surface-hover/50 border border-surface-active/40 rounded-xl p-3.5 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <HardDrive className="w-3.5 h-3.5 text-text-secondary" />
            </div>
            <p className="text-lg font-semibold text-text">{podResources.storageGb} <span className="text-sm font-normal text-text-secondary">GB</span></p>
            <p className="text-[11px] text-text-secondary">Storage</p>
          </div>
        </div>

        {/* OS + Region info row */}
        <div className="flex items-center gap-3 text-[11px] text-text-secondary mb-4">
          <span className="inline-flex items-center gap-1.5 bg-surface-hover/50 border border-surface-active/40 rounded-lg px-2.5 py-1">
            {POD_ENV.os}
          </span>
          <span className="inline-flex items-center gap-1.5 bg-surface-hover/50 border border-surface-active/40 rounded-lg px-2.5 py-1">
            <span className="text-[13px]">&#127466;&#127482;</span>
            {POD_ENV.region}
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {!isRunning ? (
            <button
              onClick={() => handleAction('start', startWorkspace, 'Pod started')}
              disabled={workspaceAction !== null}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#FF6600] text-white text-xs font-medium rounded-lg hover:bg-[#E65C00] transition-colors disabled:opacity-40"
            >
              <Play className="w-3 h-3" />
              {workspaceAction === 'start' ? 'Starting...' : 'Start'}
            </button>
          ) : (
            <>
              <button
                onClick={() => handleAction('pause', pauseWorkspace, 'Pod paused')}
                disabled={workspaceAction !== null}
                className="flex items-center gap-1.5 px-4 py-2 bg-surface-hover text-text text-xs font-medium rounded-lg hover:bg-surface-pressed transition-colors disabled:opacity-40"
              >
                <Pause className="w-3 h-3" />
                {workspaceAction === 'pause' ? 'Pausing...' : 'Pause'}
              </button>
              <button
                onClick={() => handleAction('stop', stopWorkspace, 'Pod stopped')}
                disabled={workspaceAction !== null}
                className="flex items-center gap-1.5 px-4 py-2 bg-surface-hover text-text text-xs font-medium rounded-lg hover:bg-surface-pressed transition-colors disabled:opacity-40"
              >
                <Square className="w-3 h-3" />
                {workspaceAction === 'stop' ? 'Stopping...' : 'Stop'}
              </button>
            </>
          )}
        </div>
      </motion.div>

      {/* Usage Metrics */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary mb-3">
          Usage
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {/* AI Credits */}
          <div className="bg-surface/60 rounded-2xl border border-surface-active/60 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-text-secondary" />
              <p className="text-sm font-medium text-text">AI Credits</p>
            </div>
            {credits ? (
              <>
                <p className="text-2xl font-semibold text-text mb-0.5">
                  {credits.credits_available}
                  <span className="text-sm font-normal text-text-secondary ml-1">
                    / {totalCredits}
                  </span>
                </p>
                <div className="w-full h-1.5 bg-surface-hover rounded-full mt-2 mb-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#FF6600]/70 transition-all duration-500"
                    style={{ width: `${creditsPercent}%` }}
                  />
                </div>
                <p className="text-[11px] text-text-secondary">
                  {formatResetDate(credits.credits_reset_date)}
                </p>
              </>
            ) : (
              <div className="space-y-2">
                <div className="h-7 w-24 rounded-lg animate-shimmer" />
                <div className="h-1.5 w-full rounded-full animate-shimmer" />
              </div>
            )}
          </div>

          {/* Storage */}
          <div className="bg-surface/60 rounded-2xl border border-surface-active/60 p-5">
            <div className="flex items-center gap-2 mb-3">
              <HardDrive className="w-4 h-4 text-text-secondary" />
              <p className="text-sm font-medium text-text">Storage</p>
            </div>
            <p className="text-2xl font-semibold text-text mb-0.5">
              --
              <span className="text-sm font-normal text-text-secondary ml-1">
                / {podResources.storageGb} GB
              </span>
            </p>
            <div className="w-full h-1.5 bg-surface-hover rounded-full mt-2 mb-2 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#FF6600]/70 transition-all duration-500"
                style={{ width: '0%' }}
              />
            </div>
            <p className="text-[11px] text-text-secondary">
              Workspace files, knowledge base, memory
            </p>
          </div>
        </div>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary mb-3">
          Quick Actions
        </p>
        <div className="bg-surface/60 rounded-2xl border border-surface-active/60 overflow-hidden">
          {/* Create Backup */}
          <button
            onClick={() => handleAction('backup', triggerBackup, 'Backup created')}
            disabled={workspaceAction !== null}
            className="flex items-center w-full px-5 py-4 hover:bg-surface-hover/40 transition-colors disabled:opacity-40 text-left group"
          >
            <div className="w-8 h-8 rounded-lg bg-surface-hover flex items-center justify-center mr-3 shrink-0">
              <Archive className="w-4 h-4 text-text-secondary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text">
                {workspaceAction === 'backup' ? 'Creating backup...' : 'Create Backup'}
              </p>
              <p className="text-xs text-text-secondary mt-0.5">
                Take a backup of your current workspace
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-text-secondary/50 group-hover:text-text-secondary transition-colors shrink-0" />
          </button>

          <div className="border-t border-surface-active/40 mx-5" />

          {/* Agent Marketplace */}
          <Link
            href="/ai-agents"
            className="flex items-center w-full px-5 py-4 hover:bg-surface-hover/40 transition-colors text-left group"
          >
            <div className="w-8 h-8 rounded-lg bg-surface-hover flex items-center justify-center mr-3 shrink-0">
              <Bot className="w-4 h-4 text-text-secondary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text">Agent Marketplace</p>
              <p className="text-xs text-text-secondary mt-0.5">
                Browse and install pre-built agents
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-text-secondary/50 group-hover:text-text-secondary transition-colors shrink-0" />
          </Link>

          <div className="border-t border-surface-active/40 mx-5" />

          {/* Skill Marketplace */}
          <Link
            href="/skills"
            className="flex items-center w-full px-5 py-4 hover:bg-surface-hover/40 transition-colors text-left group"
          >
            <div className="w-8 h-8 rounded-lg bg-surface-hover flex items-center justify-center mr-3 shrink-0">
              <Puzzle className="w-4 h-4 text-text-secondary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text">Skill Marketplace</p>
              <p className="text-xs text-text-secondary mt-0.5">
                Browse and install skills for your agents
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-text-secondary/50 group-hover:text-text-secondary transition-colors shrink-0" />
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
