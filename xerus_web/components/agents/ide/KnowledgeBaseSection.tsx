'use client'

import React, { useMemo, useState } from 'react'
import { Book, Plus, X, Loader2, AlertCircle } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { FolderCard } from "@/components/FolderCard"
import type { DriveDocument } from '@/lib/drive-documents'

export interface ConnectedDoc {
  connectionId: number
  path: string
  name: string
  title: string
  subtitle: string
  content_type: string
  missing: boolean
}

interface KnowledgeBaseSectionProps {
  connectedDocs: ConnectedDoc[]
  driveDocuments: DriveDocument[]
  isEditable: boolean
  isMarketplace?: boolean
  onConnect: (filePath: string) => Promise<void>
  onDisconnect: (connectionId: number) => Promise<void>
}

export function KnowledgeBaseSection({
  connectedDocs,
  driveDocuments,
  isEditable,
  isMarketplace = false,
  onConnect,
  onDisconnect,
}: KnowledgeBaseSectionProps) {
  const [showPicker, setShowPicker] = useState(false)
  // A picker row is keyed by file path; a connected card is keyed by connection id.
  // Keep loading keys separate so the two sides never clash.
  const [connectingPath, setConnectingPath] = useState<string | null>(null)
  const [disconnectingId, setDisconnectingId] = useState<number | null>(null)

  const connectedPaths = useMemo(() => new Set(connectedDocs.map(d => d.path)), [connectedDocs])
  const unconnectedDrive = useMemo(
    () => driveDocuments.filter(d => !connectedPaths.has(d.path)),
    [driveDocuments, connectedPaths],
  )

  const handleConnect = async (doc: DriveDocument) => {
    setConnectingPath(doc.path)
    try {
      await onConnect(doc.path)
      setShowPicker(false)
    } finally {
      setConnectingPath(null)
    }
  }

  const handleDisconnect = async (connectionId: number) => {
    setDisconnectingId(connectionId)
    try {
      await onDisconnect(connectionId)
    } finally {
      setDisconnectingId(null)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Book className="w-6 h-6 text-secondary" />
        <h3 className="text-2xl font-serif text-text">Knowledge Base</h3>
      </div>

      <div className="bg-surface rounded-3xl border border-surface-active shadow-sm p-6">
        {connectedDocs.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mx-auto mb-4">
              <Book className="w-8 h-8 text-text-secondary" />
            </div>
            <h3 className="text-lg font-serif text-text mb-2">
              {isMarketplace ? 'Knowledge Base' : 'No knowledge sources yet'}
            </h3>
            <p className="text-text-secondary mb-6">
              {isMarketplace
                ? 'Clone this agent to connect knowledge sources.'
                : 'Connect documents from your drive to give this agent knowledge.'}
            </p>
            {isEditable && !isMarketplace && (
              <Button
                onClick={() => setShowPicker(true)}
                className="px-6 py-2.5 rounded-full bg-text text-white hover:bg-text/90 transition-colors text-sm font-medium inline-flex items-center gap-2 h-auto"
              >
                <Plus className="w-4 h-4" />
                Add Source
              </Button>
            )}
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar">
            {connectedDocs.map((doc) => (
              <div key={doc.connectionId} className="min-w-[200px] relative group">
                <FolderCard
                  title={doc.title}
                  fileCount={1}
                  storageUsed={doc.missing ? 'Missing from drive' : doc.subtitle}
                  accessUsers={[]}
                  surface="plate"
                />
                {doc.missing && (
                  <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-[10px] font-medium">
                    <AlertCircle className="w-3 h-3" />
                    Missing
                  </div>
                )}
                {isEditable && (
                  <button
                    onClick={() => handleDisconnect(doc.connectionId)}
                    disabled={disconnectingId === doc.connectionId}
                    className="absolute top-2 right-2 w-6 h-6 bg-card/90 hover:bg-destructive/10 rounded-full flex items-center justify-center text-text-muted hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50 z-50"
                    title="Remove from agent"
                  >
                    {disconnectingId === doc.connectionId ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <X className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>
            ))}
            {isEditable && !isMarketplace && (
              <button
                onClick={() => setShowPicker(true)}
                className="min-w-[200px] border-2 border-dashed border-surface-active rounded-xl flex flex-col items-center justify-center gap-2 text-text-secondary hover:border-primary hover:text-primary transition-colors group"
              >
                <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center group-hover:bg-primary/5">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium">Add Source</span>
              </button>
            )}
          </div>
        )}

        {/* Inline drive-file picker */}
        {showPicker && (
          <div className="mt-4 pt-4 border-t border-surface-active">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-text">Connect a file from your drive</h4>
              <button
                onClick={() => setShowPicker(false)}
                className="p-1 hover:bg-surface-hover rounded-full transition-colors"
              >
                <X className="w-4 h-4 text-text-secondary" />
              </button>
            </div>
            {unconnectedDrive.length === 0 ? (
              <p className="text-sm text-text-secondary py-4 text-center">
                {driveDocuments.length === 0
                  ? 'No documents in your drive yet. Upload files in Workspace to connect them here.'
                  : 'Every compatible drive file is already connected to this agent.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {unconnectedDrive.map((doc) => {
                  const subtitle = doc.path.startsWith('drive/')
                    ? doc.path.slice('drive/'.length)
                    : doc.path
                  return (
                    <button
                      key={doc.path}
                      onClick={() => handleConnect(doc)}
                      disabled={connectingPath === doc.path}
                      className="flex items-center gap-3 p-3 rounded-xl border border-surface-active hover:border-primary hover:bg-primary/5 transition-colors text-left disabled:opacity-50"
                    >
                      <div className="w-8 h-8 rounded-lg bg-surface-hover flex items-center justify-center shrink-0">
                        <Book className="w-4 h-4 text-text-secondary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-text truncate">
                          {doc.title}
                        </div>
                        <div className="text-[11px] text-text-muted truncate">
                          {subtitle}
                        </div>
                      </div>
                      {connectingPath === doc.path && (
                        <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
