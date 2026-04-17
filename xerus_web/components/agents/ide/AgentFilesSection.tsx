'use client'

import React from 'react'
import { FileText, Pencil, Lock, AlertTriangle } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { cn } from '@/lib/utils'
import { getPromptPreview } from './prompt-utils'

interface FileData {
  content: string | null
  isTemplate: boolean
}

export interface SoulFileDefinition {
  fileName: string
  label: string
  description: string
  placeholder: string
}

interface AgentFilesSectionProps {
  agent: any
  isEditable: boolean
  isLoading: boolean
  isAgentRunning: boolean
  files: Record<string, FileData>
  soulFiles: readonly SoulFileDefinition[]
  onOpenSystemPrompt: () => void
  onOpenSoulFile: (fileName: string) => void
}

export function AgentFilesSection({
  agent,
  isEditable,
  isLoading,
  isAgentRunning,
  files,
  soulFiles,
  onOpenSystemPrompt,
  onOpenSoulFile,
}: AgentFilesSectionProps) {
  return (
    <>
      {/* Running agent warning */}
      {isAgentRunning && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            This agent has an active session. File changes may be overwritten during execution.
          </p>
        </div>
      )}

      {/* Agent Files - Unified Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <FileText className="w-6 h-6 text-secondary" />
          <h3 className="text-2xl font-serif text-text">Agent Files</h3>
        </div>

        {/* All files in one card */}
        <div className="bg-surface rounded-3xl border border-surface-active shadow-sm p-4 space-y-3">
          {/* System Prompt row */}
          <div className="bg-surface-hover rounded-xl px-5 py-4 flex items-center gap-4 cursor-pointer"
            onClick={onOpenSystemPrompt}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-text">System Prompt</span>
              </div>
              <p className={`text-sm leading-relaxed line-clamp-2 ${!getPromptPreview(agent.system_prompt || agent.prompt) ? 'text-text-secondary italic' : 'text-text font-medium'}`}>
                {getPromptPreview(agent.system_prompt || agent.prompt) || "You are a helpful assistant that answers questions based on the provided knowledge base..."}
              </p>
            </div>
            {isEditable ? (
              <Button
                variant="ghost"
                className="h-9 px-4 bg-text hover:bg-primary rounded-xl text-white flex items-center gap-2 shrink-0"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span className="text-sm font-medium">Edit</span>
              </Button>
            ) : (
              <Button
                variant="ghost"
                className="h-9 px-4 bg-text/70 rounded-xl text-white flex items-center gap-2 shrink-0 cursor-default"
              >
                <Lock className="w-3.5 h-3.5" />
                <span className="text-sm font-medium">View Only</span>
              </Button>
            )}
          </div>

          {/* Soul file rows - 2 per row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {soulFiles.map((file) => {
            const fileData = files[file.fileName]
            const hasContent = !!fileData?.content
            const previewText = fileData?.content?.split('\n').filter(Boolean).slice(0, 3).join(' ') || null

            return (
              <div
                key={file.fileName}
                className={cn(
                  "bg-surface-hover rounded-xl px-5 py-4 flex items-center gap-4 cursor-pointer",
                  isLoading && "animate-pulse"
                )}
                onClick={() => {
                  if (isLoading) return
                  onOpenSoulFile(file.fileName)
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-text">{file.label}</span>
                    {fileData?.isTemplate && (
                      <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200/50">
                        Template
                      </span>
                    )}
                  </div>
                  {isLoading ? (
                    <div className="h-4 bg-surface-hover rounded w-3/4" />
                  ) : previewText ? (
                    <p className="text-sm leading-relaxed text-text font-medium line-clamp-2">
                      {previewText}
                    </p>
                  ) : (
                    <p className="text-sm leading-relaxed text-text-secondary italic">
                      {file.description}
                    </p>
                  )}
                </div>
                {!isLoading && (
                  isEditable ? (
                    <Button
                      variant="ghost"
                      className="h-9 px-4 bg-text hover:bg-primary rounded-xl text-white flex items-center gap-2 shrink-0"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span className="text-sm font-medium">{hasContent ? 'Edit' : 'Create'}</span>
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      className="h-9 px-4 bg-text/70 rounded-xl text-white flex items-center gap-2 shrink-0 cursor-default"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span className="text-sm font-medium">View Only</span>
                    </Button>
                  )
                )}
              </div>
            )
          })}
          </div>
        </div>
      </div>
    </>
  )
}
