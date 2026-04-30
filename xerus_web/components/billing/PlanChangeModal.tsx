'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { usePlanChangeDetector } from '@/hooks/usePlanChangeDetector'
import { getWorkspaceUsage, resizeWorkspace, recreateWorkspace, exportWorkspace } from '@/lib/api/workspace'
import type { WorkspaceUsage } from '@/lib/api/workspace'
import type { PlanType } from '@/lib/plans'
import { PLANS } from '@/lib/plans'
import { toast } from '@/lib/toast'
import { ArrowUp, ArrowDown, Download, AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PlanChangeModal() {
  const { planDrift, oldPlan, newPlan, loading: detecting } = usePlanChangeDetector()
  const [open, setOpen] = useState(false)
  const [usage, setUsage] = useState<WorkspaceUsage | null>(null)
  const [processing, setProcessing] = useState(false)
  const [confirmDowngrade, setConfirmDowngrade] = useState(false)

  useEffect(() => {
    if (!detecting && planDrift) {
      const dismissed = sessionStorage.getItem('plan-change-dismissed')
      if (dismissed) return
      setOpen(true)
      if (planDrift === 'downgrade') {
        getWorkspaceUsage().then(setUsage).catch(() => {})
      }
    }
  }, [detecting, planDrift])

  const handleDismiss = useCallback(() => {
    sessionStorage.setItem('plan-change-dismissed', '1')
    setOpen(false)
  }, [])

  const handleUpgrade = useCallback(async () => {
    setProcessing(true)
    try {
      await resizeWorkspace()
      toast.success('Workspace upgraded', { description: `Resources resized to ${newPlan} plan` })
      setOpen(false)
    } catch (err) {
      toast.error('Upgrade failed', { description: (err as Error).message })
    } finally {
      setProcessing(false)
    }
  }, [newPlan])

  const handleDownload = useCallback(async () => {
    try {
      await exportWorkspace()
      toast.success('Workspace exported')
    } catch {
      toast.error('Export failed')
    }
  }, [])

  const handleRecreate = useCallback(async () => {
    setProcessing(true)
    try {
      await recreateWorkspace()
      toast.success('Workspace recreated', { description: `Fresh workspace on ${newPlan} plan` })
      setOpen(false)
    } catch (err) {
      toast.error('Recreation failed', { description: (err as Error).message })
    } finally {
      setProcessing(false)
      setConfirmDowngrade(false)
    }
  }, [newPlan])

  if (!planDrift || detecting) return null

  const oldResources = oldPlan ? PLANS[oldPlan] : null
  const newResources = newPlan ? PLANS[newPlan] : null

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!processing) { if (!v) handleDismiss(); else setOpen(v) } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {planDrift === 'upgrade' ? (
              <ArrowUp className="w-5 h-5 text-emerald-500" />
            ) : (
              <ArrowDown className="w-5 h-5 text-amber-500" />
            )}
            {planDrift === 'upgrade' ? 'Upgrade Your Workspace' : 'Downgrade Your Workspace'}
          </DialogTitle>
          <DialogDescription>
            {planDrift === 'upgrade'
              ? `Your plan changed to ${newPlan}. Resize your workspace to unlock more resources.`
              : `Your plan changed to ${newPlan}. Your workspace needs to be recreated with fewer resources.`}
          </DialogDescription>
        </DialogHeader>

        {planDrift === 'upgrade' && oldResources && newResources && (
          <div className="grid grid-cols-3 gap-3 my-2">
            <ResourceDiff label="vCPU" old={oldResources.vcpu} next={newResources.vcpu} />
            <ResourceDiff label="RAM" old={oldResources.ram} next={newResources.ram} unit="GB" />
            <ResourceDiff label="Disk" old={oldResources.disk} next={newResources.disk} unit="GB" />
          </div>
        )}

        {planDrift === 'downgrade' && (
          <div className="space-y-3 my-2">
            {usage && (
              <div>
                <div className="flex justify-between text-xs text-text-secondary mb-1">
                  <span>Current disk usage</span>
                  <span>{formatDiskSize(usage.disk_used_mb)} / {formatDiskSize(usage.disk_limit_mb)}</span>
                </div>
                <div className="w-full h-2 bg-surface-hover rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      usage.disk_used_percent < 80 ? 'bg-emerald-500' :
                      usage.disk_used_percent < 95 ? 'bg-amber-500' : 'bg-red-500'
                    )}
                    style={{ width: `${Math.min(100, usage.disk_used_percent)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div className="text-xs text-red-700 dark:text-red-300">
                  <p className="font-medium">All workspace files will be erased.</p>
                  <p className="mt-1">Your memory, account data, and agent configurations are safe. Only workspace files (drive, projects) will be removed.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {planDrift === 'upgrade' ? (
            <button
              onClick={handleUpgrade}
              disabled={processing}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 w-full sm:w-auto"
            >
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
              {processing ? 'Upgrading...' : 'Upgrade Now'}
            </button>
          ) : (
            <>
              <button
                onClick={handleDownload}
                disabled={processing}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-surface-hover text-text text-sm font-medium rounded-lg hover:bg-surface-pressed transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Download Workspace
              </button>
              {!confirmDowngrade ? (
                <button
                  onClick={() => setConfirmDowngrade(true)}
                  disabled={processing}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  Proceed with Erase
                </button>
              ) : (
                <button
                  onClick={handleRecreate}
                  disabled={processing}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-red-700 text-white text-sm font-medium rounded-lg hover:bg-red-800 transition-colors disabled:opacity-50"
                >
                  {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {processing ? 'Recreating...' : 'Confirm — Erase All Data'}
                </button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function formatDiskSize(mb: number): string {
  return mb < 1024 ? `${mb} MB` : `${(mb / 1024).toFixed(1)} GB`
}

function ResourceDiff({ label, old, next, unit }: { label: string; old: number; next: number; unit?: string }) {
  return (
    <div className="bg-surface-hover/50 border border-surface-active/40 rounded-lg p-3 text-center">
      <p className="text-[11px] text-text-secondary mb-1">{label}</p>
      <p className="text-sm">
        <span className="text-text-secondary">{old}{unit && ` ${unit}`}</span>
        <span className="text-text-secondary mx-1">{'->'}</span>
        <span className="font-semibold text-emerald-600">{next}{unit && ` ${unit}`}</span>
      </p>
    </div>
  )
}
