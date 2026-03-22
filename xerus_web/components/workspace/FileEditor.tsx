'use client'

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { Eye, Pencil, Loader2, Lock, Sparkles, ArrowUp } from 'lucide-react'
import { toast } from 'sonner'
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
      toast.success('File saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save file')
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
          className="text-sm text-[#FF6600] font-medium hover:underline"
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
    <div className={cn("flex flex-col h-full bg-white", className)}>

      {/* Read-only notice — matching agent IDE pattern */}
      {!isEditable && (
        <div className="mx-8 mt-6 mb-4 flex items-center gap-3 p-4 bg-[#FF6600]/5 border border-[#FF6600]/20 rounded-2xl shrink-0">
          <div className="w-8 h-8 rounded-xl bg-[#FF6600]/10 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4 text-[#FF6600]" />
          </div>
          <span className="text-sm text-text">This file is read-only</span>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-hidden relative">
        {showPreview ? (
          <MarkdownPreview content={content} className="h-full overflow-y-auto" />
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
          <SyntaxViewer content={content} filename={name} className="h-full" />
        )}
      </div>

      {/* Footer Toolbar — matching skill editor pattern */}
      <div className="mx-4 mb-4 mt-2 p-1.5 rounded-[20px] border border-surface-active bg-white flex items-center justify-between shadow-sm shrink-0">
        {/* Left: Write with AI */}
        <div className="flex items-center gap-2">
          <button
            disabled
            className="h-9 px-3 rounded-[12px] flex items-center gap-2 text-text-secondary font-medium text-sm opacity-50 cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" />
            Write with AI
          </button>
        </div>

        {/* Center: View/Edit segmented control */}
        <div className="flex items-center bg-surface rounded-[14px] p-1">
          <button
            onClick={() => setMode('view')}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-all',
              mode === 'view' ? 'bg-white shadow-sm text-text' : 'text-text-secondary hover:text-text',
            )}
          >
            <Eye className="w-3.5 h-3.5" />
            View
          </button>
          {isEditable && (
            <button
              onClick={() => setMode('edit')}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-all',
                mode === 'edit' ? 'bg-white shadow-sm text-text' : 'text-text-secondary hover:text-text',
              )}
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
          )}
        </div>

        {/* Right: Word count + Save */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-text-muted font-medium tabular-nums">
            {wordCount.toLocaleString()}w &middot; {charCount.toLocaleString()}c
          </span>
          {isEditable ? (
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className={cn(
                'w-9 h-9 rounded-[12px] flex items-center justify-center shadow-md transition-colors',
                mode === 'edit' && isDirty
                  ? 'bg-text text-white hover:bg-[#FF6600]'
                  : 'bg-surface text-text-secondary cursor-not-allowed',
              )}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
