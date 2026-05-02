'use client'

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { Eye, Pencil, Loader2, Lock, Sparkles, ArrowUp } from 'lucide-react'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { BinaryViewer } from './BinaryViewer'
import { MarkdownPreview } from './MarkdownPreview'
import { SyntaxViewer } from './SyntaxViewer'
import * as workspaceApi from '@/lib/api/workspace'
import type { EditabilityStatus } from '@/lib/api/workspace'
import { isTextFile, isMarkdownFile, formatSize, getExtension } from './file-utils'

const CodeMirrorEditor = lazy(() =>
  import('./CodeMirrorEditor').then((mod) => ({ default: mod.CodeMirrorEditor }))
)

interface FileEditorProps {
  path: string
  name: string
  size?: number
  onDirtyChange: (path: string, isDirty: boolean) => void
  className?: string
}

export function FileEditor({ path, name, size, onDirtyChange, className }: FileEditorProps) {
  const [content, setContent] = useState<string>('')
  const [originalContent, setOriginalContent] = useState<string>('')
  const [editability, setEditability] = useState<EditabilityStatus>('read_only')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const contentRef = useRef(content)
  contentRef.current = content

  const isText = isTextFile(name)
  const isMd = isMarkdownFile(name)
  const isEditable = editability === 'editable'
  const isDirty = content !== originalContent
  const wordCount = content.split(/\s+/).filter(Boolean).length
  const charCount = content.length

  useEffect(() => {
    onDirtyChange(path, isDirty)
  }, [isDirty, path, onDirtyChange])

  useEffect(() => {
    let cancelled = false
    async function loadFile() {
      setLoading(true)
      setError(null)
      setMode('view')
      try {
        const result = await workspaceApi.getFile(path)
        if (cancelled) return
        setContent(result.content)
        setOriginalContent(result.content)
        setEditability(result.editability)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load file')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadFile()
    return () => { cancelled = true }
  }, [path])

  const handleSave = useCallback(async () => {
    const currentContent = contentRef.current
    if (currentContent === originalContent || !isEditable || saving) return
    setSaving(true)
    try {
      await workspaceApi.putFile(path, currentContent)
      setOriginalContent(currentContent)
      toast.success('File saved', { description: 'Your changes have been written to disk.' })
    } catch (err) {
      toast.error("Couldn't save this file", { description: 'Please try again.' })
    } finally {
      setSaving(false)
    }
  }, [isEditable, originalContent, path, saving])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full gap-3 p-8', className)}>
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={() => {
            setError(null)
            setLoading(true)
            workspaceApi.getFile(path).then((result) => {
              setContent(result.content)
              setOriginalContent(result.content)
              setEditability(result.editability)
              setLoading(false)
            }).catch((err) => {
              setError(err instanceof Error ? err.message : 'Failed to load file')
              setLoading(false)
            })
          }}
          className="text-sm text-secondary font-medium hover:underline"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!isText) {
    return <BinaryViewer name={name} path={path} size={size} className={className} />
  }

  // Decide what to show based on mode
  const showEditor = mode === 'edit' && isEditable
  const showPreview = mode === 'view' && isMd
  const showSyntaxViewer = mode === 'view' && !isMd

  return (
    <div className={cn("relative h-full min-h-0", className)}>

      {/* Content area — fills the entire container */}
      <div className="h-full overflow-hidden relative">
        {/* Read-only label — pure overlay, no card / no background */}
        {!isEditable && (
          <div
            className="absolute top-4 right-6 z-10 inline-flex items-center gap-1.5 text-sm text-text-muted pointer-events-none"
            aria-label="This file is read-only"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Read-only</span>
          </div>
        )}

        {showPreview ? (
          <MarkdownPreview content={content} className="h-full overflow-y-auto pb-14" />
        ) : showEditor ? (
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
              </div>
            }
          >
            <CodeMirrorEditor
              value={content}
              onChange={setContent}
              readOnly={false}
              filename={name}
              onSave={handleSave}
            />
          </Suspense>
        ) : (
          <SyntaxViewer content={content} filename={name} className="h-full pb-14" />
        )}
      </div>

      {/* Footer Toolbar — floats over content at the bottom.
          Uses absolute positioning so it doesn't consume layout space.
          Content areas have bottom padding (pb-14) to prevent last lines
          from being permanently obscured. */}
      <div className="absolute bottom-3 left-3 right-3 p-1 rounded-xl border border-surface-active bg-card/95 backdrop-blur-sm flex items-center gap-2 shadow-sm z-10">
        <button
          disabled
          aria-label="Write with AI"
          title="Write with AI (coming soon)"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-text-secondary opacity-50 cursor-not-allowed shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center bg-surface rounded-[10px] p-0.5 shrink-0">
          <button
            onClick={() => setMode('view')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[11px] font-semibold transition-all',
              mode === 'view' ? 'bg-card shadow-sm text-text' : 'text-text-secondary hover:text-text',
            )}
          >
            <Eye className="w-3 h-3" />
            View
          </button>
          {isEditable && (
            <button
              onClick={() => setMode('edit')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[11px] font-semibold transition-all',
                mode === 'edit' ? 'bg-card shadow-sm text-text' : 'text-text-secondary hover:text-text',
              )}
            >
              <Pencil className="w-3 h-3" />
              Edit
            </button>
          )}
        </div>

        {/* Spacer that swallows leftover space and clips the count first */}
        <span
          className="flex-1 min-w-0 text-right text-[11px] text-text-muted font-medium tabular-nums whitespace-nowrap truncate"
          title={`${wordCount.toLocaleString()} words · ${charCount.toLocaleString()} characters`}
        >
          {wordCount.toLocaleString()}w · {charCount.toLocaleString()}c
        </span>

        {isEditable && (
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            aria-label={mode === 'edit' && isDirty ? 'Save changes' : 'No changes to save'}
            title={mode === 'edit' && isDirty ? 'Save (Ctrl/Cmd+S)' : 'No changes to save'}
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center shadow-sm transition-colors shrink-0',
              mode === 'edit' && isDirty
                ? 'bg-text text-white hover:bg-primary'
                : 'bg-surface text-text-secondary cursor-not-allowed',
            )}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUp className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    </div>
  )
}
