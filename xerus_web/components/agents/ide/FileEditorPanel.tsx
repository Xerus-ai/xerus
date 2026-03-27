'use client'

import React from 'react'
import { FileText, X, Minus, ArrowUp, Lock, Sparkles, Eye, Pencil, Loader2, Plus, AlertTriangle } from 'lucide-react'
import { FloatingPanel } from '@/components/common/FloatingPanel'
import { cn } from '@/lib/utils'
import { PROMPT_PLACEHOLDER } from './prompt-utils'
import type { SoulFileDefinition } from './AgentFilesSection'

interface FileEditorPanelProps {
  isOpen: boolean
  onClose: () => void
  activeFile: string | null
  activeFileInfo: SoulFileDefinition | undefined
  editContent: string
  onEditContentChange: (content: string) => void
  tempPrompt: string
  onTempPromptChange: (content: string) => void
  isEditable: boolean
  mode: 'view' | 'edit'
  onModeChange: (mode: 'view' | 'edit') => void
  isFormatting: boolean
  isSaving: boolean
  isCloning: boolean
  isAgentRunning: boolean
  onWriteWithAI: () => void
  onSave: () => void
  onClone: () => void
}

export function FileEditorPanel({
  isOpen,
  onClose,
  activeFile,
  activeFileInfo,
  editContent,
  onEditContentChange,
  tempPrompt,
  onTempPromptChange,
  isEditable,
  mode,
  onModeChange,
  isFormatting,
  isSaving,
  isCloning,
  isAgentRunning,
  onWriteWithAI,
  onSave,
  onClone,
}: FileEditorPanelProps) {
  return (
    <FloatingPanel
      isOpen={isOpen}
      onClose={onClose}
      title={activeFile ? (activeFileInfo?.label || activeFile) : 'System Prompt'}
      minimizedTitle={activeFile ? (activeFileInfo?.label || activeFile) : 'System Prompt'}
      icon={activeFile ? <FileText className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
      className="w-[600px] h-[600px] max-w-[95vw] max-h-[95vh] rounded-[40px] shadow-sm bg-surface p-2"
      variant="clean"
    >
      {({ close, minimize }) => (
        <div className="bg-white rounded-[32px] h-full w-full flex flex-col p-6 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={close}
                className="p-1.5 bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded-full transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-text" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  minimize()
                }}
                className="p-1.5 bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded-full transition-colors"
                aria-label="Minimize"
              >
                <Minus className="w-4 h-4 text-text" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-text">
                {activeFile ? activeFileInfo?.label : 'System Prompt'}
              </span>
            </div>
          </div>

          {/* Running agent warning inside editor */}
          {isAgentRunning && activeFile && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4 shrink-0">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-800">
                Agent is running. Changes may be overwritten.
              </p>
            </div>
          )}

          {/* Editor Content */}
          <textarea
            value={activeFile ? editContent : tempPrompt}
            onChange={(e) => activeFile ? onEditContentChange(e.target.value) : onTempPromptChange(e.target.value)}
            placeholder={activeFile ? activeFileInfo?.placeholder : PROMPT_PLACEHOLDER}
            className={cn(
              "flex-1 w-full resize-none outline-none text-sm text-text bg-transparent leading-relaxed placeholder:text-[#9CA3AF] placeholder:whitespace-pre-wrap",
              "font-sans"
            )}
            autoFocus
            readOnly={!isEditable || mode === 'view'}
          />

          {/* Read-only notice for system templates */}
          {!isEditable && (
            <div className="flex items-center justify-between gap-3 p-4 bg-[#FF6600]/5 border border-[#FF6600]/20 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#FF6600]/10 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-[#FF6600]" />
                </div>
                <span className="text-sm text-text">This is a read-only template. Clone this agent to customize it.</span>
              </div>
              <button
                onClick={onClone}
                disabled={isCloning}
                className="flex items-center gap-2 px-4 py-2 bg-[#FF6600] hover:bg-[#E65C00] text-white font-medium rounded-xl text-sm transition-colors disabled:opacity-50 shrink-0 shadow-sm"
              >
                {isCloning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Clone
              </button>
            </div>
          )}

          {/* Footer Toolbar */}
          <div className="mt-6 p-1.5 rounded-[20px] border border-surface-active bg-white flex items-center justify-between shadow-sm shrink-0">
            <div className="flex items-center gap-2">
              {isEditable && mode === 'edit' && (
                <button
                  onClick={onWriteWithAI}
                  disabled={isFormatting}
                  className={cn(
                    "h-9 px-3 hover:bg-surface rounded-[12px] flex items-center gap-2 transition-colors text-text font-medium text-sm",
                    isFormatting && "opacity-50 cursor-not-allowed"
                  )}
                  title="Format prompt with AI"
                >
                  <Sparkles className={cn("w-4 h-4", isFormatting && "animate-spin")} />
                  {isFormatting ? 'Formatting...' : 'Write with AI'}
                </button>
              )}
            </div>

            <div className="flex items-center bg-surface rounded-[14px] p-1">
              <button
                onClick={() => onModeChange('view')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-all",
                  mode === 'view' ? "bg-white shadow-sm text-text" : "text-text-secondary hover:text-text"
                )}
              >
                <Eye className="w-3.5 h-3.5" />
                View
              </button>
              {isEditable && (
                <button
                  onClick={() => onModeChange('edit')}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-all",
                    mode === 'edit' ? "bg-white shadow-sm text-text" : "text-text-secondary hover:text-text"
                  )}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isEditable ? (
                <button
                  onClick={onSave}
                  disabled={activeFile ? isSaving : false}
                  className={cn(
                    "w-9 h-9 bg-text text-white rounded-[12px] flex items-center justify-center hover:bg-[#FF6600] transition-colors shadow-md",
                    (activeFile && isSaving) && "opacity-50 cursor-not-allowed"
                  )}
                  aria-label="Save"
                >
                  {(activeFile && isSaving) ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowUp className="w-4 h-4" />
                  )}
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="h-9 px-4 bg-surface hover:bg-surface-active rounded-[12px] text-text text-sm font-medium transition-colors"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </FloatingPanel>
  )
}
