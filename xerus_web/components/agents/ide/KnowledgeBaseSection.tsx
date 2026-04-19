'use client'

import React, { useState } from 'react'
import { Book, Plus, X, Loader2 } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { FolderCard } from "@/components/FolderCard"

interface KnowledgeBaseSectionProps {
  agentId: number
  agentDocs: any[]
  availableDocuments: any[]
  isEditable: boolean
  isMarketplace?: boolean
  onAddKb: (docId: string, docTitle: string) => Promise<void>
  onRemoveKb: (docId: string) => Promise<void>
}

export function KnowledgeBaseSection({
  agentId,
  agentDocs,
  availableDocuments,
  isEditable,
  isMarketplace = false,
  onAddKb,
  onRemoveKb,
}: KnowledgeBaseSectionProps) {
  const [showPicker, setShowPicker] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  // Documents not yet assigned to this agent
  const assignedIds = new Set(agentDocs.map((d: any) => d.id))
  const unassignedDocs = availableDocuments.filter((d: any) => !assignedIds.has(d.id))

  const handleAdd = async (doc: any) => {
    setLoadingId(doc.id)
    try {
      await onAddKb(doc.id, doc.title || doc.name || 'Untitled')
      setShowPicker(false)
    } finally {
      setLoadingId(null)
    }
  }

  const handleRemove = async (docId: string) => {
    setLoadingId(docId)
    try {
      await onRemoveKb(docId)
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Book className="w-6 h-6 text-secondary" />
        <h3 className="text-2xl font-serif text-text">Knowledge Base</h3>
      </div>

      <div className="bg-surface rounded-3xl border border-surface-active shadow-sm p-6">
        {agentDocs.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mx-auto mb-4">
              <Book className="w-8 h-8 text-text-secondary" />
            </div>
            <h3 className="text-lg font-serif text-text mb-2">
              {isMarketplace ? 'Knowledge Base' : 'No knowledge sources yet'}
            </h3>
            <p className="text-text-secondary mb-6">
              {isMarketplace
                ? 'Clone this agent to add knowledge sources.'
                : 'Add documents to give your agent knowledge.'}
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
            {agentDocs.map((doc: any) => (
              <div key={doc.id} className="min-w-[200px] relative group">
                <FolderCard
                  title={doc.title || doc.name || 'Untitled'}
                  fileCount={doc.chunk_count || 1}
                  storageUsed="--"
                  accessUsers={[]}
                  surface="plate"
                />
                {isEditable && (
                  <button
                    onClick={() => handleRemove(doc.id)}
                    disabled={loadingId === doc.id}
                    className="absolute top-2 right-2 w-6 h-6 bg-card/90 hover:bg-destructive/10 rounded-full flex items-center justify-center text-text-muted hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50 z-50"
                    title="Remove from agent"
                  >
                    {loadingId === doc.id ? (
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

        {/* Inline document picker */}
        {showPicker && (
          <div className="mt-4 pt-4 border-t border-surface-active">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-text">Select a document to add</h4>
              <button
                onClick={() => setShowPicker(false)}
                className="p-1 hover:bg-surface-hover rounded-full transition-colors"
              >
                <X className="w-4 h-4 text-text-secondary" />
              </button>
            </div>
            {unassignedDocs.length === 0 ? (
              <p className="text-sm text-text-secondary py-4 text-center">
                No documents available. Upload documents in the Workspace first.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {unassignedDocs.map((doc: any) => (
                  <button
                    key={doc.id}
                    onClick={() => handleAdd(doc)}
                    disabled={loadingId === doc.id}
                    className="flex items-center gap-3 p-3 rounded-xl border border-surface-active hover:border-primary hover:bg-primary/5 transition-colors text-left disabled:opacity-50"
                  >
                    <div className="w-8 h-8 rounded-lg bg-surface-hover flex items-center justify-center shrink-0">
                      <Book className="w-4 h-4 text-text-secondary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-text truncate">
                        {doc.title || doc.name || 'Untitled'}
                      </div>
                      <div className="text-[11px] text-text-muted">
                        {doc.content_type || 'document'}
                      </div>
                    </div>
                    {loadingId === doc.id && (
                      <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
