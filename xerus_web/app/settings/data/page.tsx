'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRedirectIfNotAuth } from '@/utils/AuthContext'
import {
  exportWorkspace,
  importWorkspace,
  listSnapshots,
  restoreFromSnapshot,
} from '@/lib/api/workspace'
import type { SnapshotFile } from '@/lib/api/workspace'
import { Download, Upload, History, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'

export default function DataPage() {
  const user = useRedirectIfNotAuth()
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<SnapshotFile[]>([])
  const [snapshotsOpen, setSnapshotsOpen] = useState(false)
  const [snapshotsLoading, setSnapshotsLoading] = useState(false)
  const importFileRef = useRef<HTMLInputElement>(null)

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  const formatSnapshotDate = (iso: string): string => {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const handleExport = async () => {
    setActionInProgress('export')
    try {
      await exportWorkspace()
      toast.success('Workspace export downloaded')
    } catch {
      toast.error('Failed to export workspace')
    } finally {
      setActionInProgress(null)
    }
  }

  const handleImportFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setActionInProgress('import')
    try {
      await importWorkspace(file)
      toast.success('Workspace imported successfully')
    } catch {
      toast.error('Failed to import workspace')
    } finally {
      setActionInProgress(null)
      e.target.value = ''
    }
  }

  const handleRestore = async (snapshot: SnapshotFile) => {
    setActionInProgress('restore')
    try {
      await restoreFromSnapshot(snapshot.key)
      toast.success('Workspace restored from snapshot')
      setSnapshots([])
    } catch {
      toast.error('Failed to restore workspace')
    } finally {
      setActionInProgress(null)
    }
  }

  const toggleSnapshots = async () => {
    const willOpen = !snapshotsOpen
    setSnapshotsOpen(willOpen)

    if (willOpen && snapshots.length === 0) {
      setSnapshotsLoading(true)
      try {
        const result = await listSnapshots()
        setSnapshots(result)
      } catch {
        toast.error('Failed to load snapshots')
      } finally {
        setSnapshotsLoading(false)
      }
    }
  }

  return (
    <div className="max-w-[680px]">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="font-serif text-[22px] text-text tracking-tight mb-1">Data</h1>
        <p className="text-sm text-text-secondary mb-8">
          Export, import, and restore your workspace
        </p>
      </motion.div>

      {/* Export */}
      <motion.div
        className="bg-surface/60 rounded-2xl border border-surface-active/60 overflow-hidden mb-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <div className="flex items-center justify-between p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-surface-hover flex items-center justify-center">
              <Download className="w-4 h-4 text-text-secondary" />
            </div>
            <div>
              <p className="text-sm font-medium text-text">Export workspace</p>
              <p className="text-xs text-text-secondary mt-0.5">
                Download your workspace as a .tar.gz archive
              </p>
            </div>
          </div>
          <button
            onClick={handleExport}
            disabled={actionInProgress !== null}
            className="px-4 py-2 bg-[#FF6600] text-white text-xs font-medium rounded-lg hover:bg-[#E65C00] transition-colors disabled:opacity-40"
          >
            {actionInProgress === 'export' ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </motion.div>

      {/* Import */}
      <motion.div
        className="bg-surface/60 rounded-2xl border border-surface-active/60 overflow-hidden mb-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <div className="flex items-center justify-between p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-surface-hover flex items-center justify-center">
              <Upload className="w-4 h-4 text-text-secondary" />
            </div>
            <div>
              <p className="text-sm font-medium text-text">Import workspace</p>
              <p className="text-xs text-text-secondary mt-0.5">
                Upload a .tar.gz archive to restore workspace files
              </p>
            </div>
          </div>
          <button
            onClick={() => importFileRef.current?.click()}
            disabled={actionInProgress !== null}
            className="px-4 py-2 bg-surface-hover text-text text-xs font-medium rounded-lg hover:bg-surface-pressed transition-colors disabled:opacity-40"
          >
            {actionInProgress === 'import' ? 'Importing...' : 'Choose file'}
          </button>
          <input
            ref={importFileRef}
            type="file"
            accept=".tar.gz,.tgz"
            onChange={handleImportFileSelected}
            className="sr-only"
            aria-label="Import workspace archive"
            tabIndex={-1}
          />
        </div>
      </motion.div>

      {/* Snapshots */}
      <motion.div
        className="bg-surface/60 rounded-2xl border border-surface-active/60 overflow-hidden"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
      >
        <button
          onClick={toggleSnapshots}
          className="flex items-center justify-between w-full p-5 hover:bg-surface-hover/30 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-surface-hover flex items-center justify-center">
              <History className="w-4 h-4 text-text-secondary" />
            </div>
            <div>
              <p className="text-sm font-medium text-text">Snapshots</p>
              <p className="text-xs text-text-secondary mt-0.5">
                View and restore from previous backups
              </p>
            </div>
          </div>
          {snapshotsOpen ? (
            <ChevronUp className="w-4 h-4 text-text-secondary" />
          ) : (
            <ChevronDown className="w-4 h-4 text-text-secondary" />
          )}
        </button>

        {snapshotsOpen && (
          <div className="border-t border-surface-active/40 px-5 py-4">
            {snapshotsLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-12 rounded-xl animate-shimmer" />
                ))}
              </div>
            ) : snapshots.length === 0 ? (
              <p className="text-sm text-text-secondary py-2">No snapshots available</p>
            ) : (
              <div className="space-y-2">
                {snapshots.map((snapshot) => (
                  <div
                    key={snapshot.key}
                    className="flex items-center justify-between p-3 bg-surface-hover/50 rounded-xl"
                  >
                    <div>
                      <p className="text-sm text-text">
                        {formatSnapshotDate(snapshot.lastModified)}
                      </p>
                      <p className="text-xs text-text-secondary">{formatBytes(snapshot.size)}</p>
                    </div>
                    <button
                      onClick={() => handleRestore(snapshot)}
                      disabled={actionInProgress !== null}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary border border-surface-active rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-40"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  )
}
