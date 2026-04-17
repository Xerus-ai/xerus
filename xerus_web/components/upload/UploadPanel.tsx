'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Upload, X, Minus, Folder, Tag, Loader2, ChevronDown, Mic, Paperclip, RotateCcw, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FloatingPanel } from '@/components/common/FloatingPanel'
import { detectUploadContent, type UploadContentType } from '@/lib/utils/detect-upload-content'
import { parseFrontmatter, type AgentFrontmatter, type SkillFrontmatter, type XerusHubMeta } from '@/lib/utils/parse-frontmatter'
import { AgentPreviewCard } from './AgentPreviewCard'
import { SkillPreviewCard } from './SkillPreviewCard'
import type { FileEntry } from './FileTreePreview'

// --- Types ---

interface FolderOption {
    id: string
    name: string
}

interface FileItem {
    file: File
    id: string
    status: 'pending' | 'uploading' | 'success' | 'error'
    progress: number
    message?: string
    type: 'pdf' | 'image' | 'audio' | 'other'
    blobUrl?: string
}

type UploadPanelProps = {
    isOpen: boolean
    onClose: () => void
    folders?: FolderOption[]
    currentFolderId?: string | null
} & (
    | {
        context: 'workspace'
        uploadFile: (file: File, tags: string[], folderId: string | null) => Promise<void>
        onUploadComplete: () => void
        onImportAgent?: never
        onImportSkill?: never
    }
    | {
        context: 'import'
        onImportAgent?: (files: File[]) => Promise<void>
        onImportSkill?: (files: File[]) => Promise<void>
        uploadFile?: never
        onUploadComplete?: never
    }
)

// --- Helpers ---

function getFileType(file: File): FileItem['type'] {
    if (file.type.startsWith('image/')) return 'image'
    if (file.type.startsWith('audio/')) return 'audio'
    if (file.type === 'application/pdf') return 'pdf'
    return 'other'
}

/**
 * Recursively read directory entries from a dropped folder.
 * Uses webkitGetAsEntry() for folder drag-and-drop support.
 */
async function readDirectoryEntries(entry: FileSystemDirectoryEntry): Promise<File[]> {
    const files: File[] = []
    const reader = entry.createReader()

    const readBatch = (): Promise<FileSystemEntry[]> =>
        new Promise((resolve, reject) => reader.readEntries(resolve, reject))

    let batch = await readBatch()
    while (batch.length > 0) {
        for (const child of batch) {
            if (child.isFile) {
                const file = await new Promise<File>((resolve, reject) =>
                    (child as FileSystemFileEntry).file(resolve, reject)
                )
                files.push(file)
            } else if (child.isDirectory) {
                const nested = await readDirectoryEntries(child as FileSystemDirectoryEntry)
                files.push(...nested)
            }
        }
        batch = await readBatch()
    }
    return files
}

async function getFilesFromDrop(e: React.DragEvent): Promise<File[]> {
    const items = e.dataTransfer.items
    if (!items) return Array.from(e.dataTransfer.files)

    const allFiles: File[] = []
    const entries: FileSystemEntry[] = []

    // Collect entries first (must be done synchronously in the event handler)
    for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.()
        if (entry) entries.push(entry)
    }

    // Then process async
    for (const entry of entries) {
        if (entry.isFile) {
            const file = await new Promise<File>((resolve, reject) =>
                (entry as FileSystemFileEntry).file(resolve, reject)
            )
            allFiles.push(file)
        } else if (entry.isDirectory) {
            const nested = await readDirectoryEntries(entry as FileSystemDirectoryEntry)
            allFiles.push(...nested)
        }
    }

    return allFiles.length > 0 ? allFiles : Array.from(e.dataTransfer.files)
}

// --- Component ---

export function UploadPanel(props: UploadPanelProps) {
    const { isOpen, onClose, context } = props

    // Guard against double-click race on Import/Upload buttons
    const busyRef = useRef(false)
    // Raw files from drop/browse
    const [rawFiles, setRawFiles] = useState<File[]>([])
    // Detected content type
    const [detectedType, setDetectedType] = useState<UploadContentType>('files')
    // Parsed agent data
    const [agentData, setAgentData] = useState<{ frontmatter: AgentFrontmatter; body: string } | null>(null)
    // Parsed skill data
    const [skillData, setSkillData] = useState<{ frontmatter: SkillFrontmatter; xerushub: XerusHubMeta | null; body: string } | null>(null)
    // Parse warning
    const [parseWarning, setParseWarning] = useState<string | null>(null)
    // Import state
    const [isImporting, setIsImporting] = useState(false)
    const [importError, setImportError] = useState<string | null>(null)

    // Workspace mode state (file list, tags, folder)
    const [fileItems, setFileItems] = useState<FileItem[]>([])
    const [tags, setTags] = useState<string[]>([])
    const [tagInput, setTagInput] = useState('')
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(
        props.currentFolderId || null
    )
    const [isDragActive, setIsDragActive] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Update folder when prop changes
    const currentFolderProp = props.currentFolderId || null
    useEffect(() => {
        if (currentFolderProp) {
            setSelectedFolderId(currentFolderProp)
        }
    }, [currentFolderProp])

    // Reset on close — revoke blob URLs to prevent memory leaks
    useEffect(() => {
        if (!isOpen) {
            // Revoke any blob URLs before clearing state
            fileItems.forEach(f => { if (f.blobUrl) URL.revokeObjectURL(f.blobUrl) })
            setRawFiles([])
            setDetectedType('files')
            setAgentData(null)
            setSkillData(null)
            setParseWarning(null)
            setImportError(null)
            setIsImporting(false)
            setFileItems([])
            setTags([])
            setTagInput('')
            setIsUploading(false)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fileItems intentionally excluded to avoid re-triggering
    }, [isOpen])

    // --- File processing ---

    const processFiles = useCallback(async (files: File[]) => {
        setRawFiles(files)
        setImportError(null)
        setParseWarning(null)

        const type = detectUploadContent(files)
        setDetectedType(type)

        // Always build the file list so attachments/images render for every context
        const items: FileItem[] = files.map(file => {
            const ft = getFileType(file)
            return {
                file,
                id: Math.random().toString(36).substring(7),
                status: 'pending' as const,
                progress: 0,
                type: ft,
                blobUrl: ft === 'image' ? URL.createObjectURL(file) : undefined,
            }
        })
        setFileItems(items)

        if (type === 'agent') {
            const agentMdFile = files.find(f => f.name === 'agent.md')
            if (agentMdFile) {
                const content = await agentMdFile.text()
                const { data, body } = parseFrontmatter<AgentFrontmatter>(content)
                setAgentData({ frontmatter: data, body })

                // Warn if config.json is missing
                if (!files.some(f => f.name === 'config.json')) {
                    setParseWarning('config.json not found — defaults will be generated on import')
                }

                // Warn if name is missing
                if (!data.name) {
                    setParseWarning('agent.md is missing a "name" field in frontmatter')
                }
            }
        } else if (type === 'skill') {
            const skillMdFile = files.find(f => f.name === 'SKILL.md')
            if (skillMdFile) {
                const content = await skillMdFile.text()
                const { data, body } = parseFrontmatter<SkillFrontmatter>(content)

                // Try to parse xerushub.json if present
                let xerushub: XerusHubMeta | null = null
                const xerushubFile = files.find(f => f.name === 'xerushub.json')
                if (xerushubFile) {
                    try {
                        const json = await xerushubFile.text()
                        xerushub = JSON.parse(json)
                    } catch { /* invalid json — skip */ }
                }

                setSkillData({ frontmatter: data, xerushub, body })
            }
        }
    }, [])

    // --- Drop/browse handlers ---

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsDragActive(true)
        } else if (e.type === 'dragleave') {
            // Only deactivate when leaving the drop zone itself, not child elements
            if (e.currentTarget === e.target) {
                setIsDragActive(false)
            }
        }
    }

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragActive(false)
        if (!e.dataTransfer) return
        const files = await getFilesFromDrop(e)
        if (files.length > 0) processFiles(files)
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files)
            processFiles(files)
        }
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const handleClear = () => {
        fileItems.forEach(f => { if (f.blobUrl) URL.revokeObjectURL(f.blobUrl) })
        setRawFiles([])
        setDetectedType('files')
        setAgentData(null)
        setSkillData(null)
        setParseWarning(null)
        setImportError(null)
        setFileItems([])
    }

    // --- Workspace upload ---

    const removeFile = (id: string) => {
        setFileItems(prev => {
            const removed = prev.find(f => f.id === id)
            if (removed?.blobUrl) URL.revokeObjectURL(removed.blobUrl)
            return prev.filter(f => f.id !== id)
        })
    }

    const handleTagKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && tagInput.trim()) {
            e.preventDefault()
            if (!tags.includes(tagInput.trim())) {
                setTags([...tags, tagInput.trim()])
            }
            setTagInput('')
        } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
            setTags(tags.slice(0, -1))
        }
    }

    const removeTag = (tagToRemove: string) => {
        setTags(tags.filter(tag => tag !== tagToRemove))
    }

    const handleWorkspaceUpload = async (minimize: () => void) => {
        if (context !== 'workspace' || busyRef.current) return
        const pendingFiles = fileItems.filter(f => f.status === 'pending' || f.status === 'error')
        if (pendingFiles.length === 0) return

        busyRef.current = true
        setIsUploading(true)
        minimize()

        for (const fileItem of pendingFiles) {
            setFileItems(prev => prev.map(f =>
                f.id === fileItem.id ? { ...f, status: 'uploading', progress: 0 } : f
            ))

            const progressInterval = setInterval(() => {
                setFileItems(prev => prev.map(f =>
                    f.id === fileItem.id && f.status === 'uploading'
                        ? { ...f, progress: Math.min(90, f.progress + 10) }
                        : f
                ))
            }, 200)

            try {
                await props.uploadFile(fileItem.file, tags, selectedFolderId)

                setFileItems(prev => prev.map(f =>
                    f.id === fileItem.id ? { ...f, status: 'success', progress: 100 } : f
                ))
                props.onUploadComplete()
            } catch (error) {
                setFileItems(prev => prev.map(f =>
                    f.id === fileItem.id ? { ...f, status: 'error', message: 'Upload failed — please try again' } : f
                ))
            } finally {
                clearInterval(progressInterval)
            }
        }
        setIsUploading(false)
        busyRef.current = false
    }

    // --- Import handlers ---

    const handleImport = async (minimize: () => void) => {
        if (context !== 'import' || busyRef.current) return
        busyRef.current = true
        setIsImporting(true)
        setImportError(null)
        minimize()

        try {
            if (detectedType === 'agent' && props.onImportAgent) {
                await props.onImportAgent(rawFiles)
            } else if (detectedType === 'skill' && props.onImportSkill) {
                await props.onImportSkill(rawFiles)
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Import failed'
            setImportError(message)
        } finally {
            setIsImporting(false)
            busyRef.current = false
        }
    }

    // --- Build file tree for preview ---

    const fileEntries: FileEntry[] = rawFiles.map(f => ({
        name: f.name,
        size: f.size,
    }))

    // Separate images for workspace grid view
    const imageFiles = fileItems.filter(f => f.type === 'image')
    const attachmentFiles = fileItems.filter(f => f.type !== 'image')

    const hasContent = rawFiles.length > 0 || fileItems.length > 0
    const isDetectedImport = detectedType === 'agent' || detectedType === 'skill'

    // Panel title
    const panelTitle = isDetectedImport
        ? detectedType === 'agent' ? 'Import Agent' : 'Import Skill'
        : 'Upload Files'

    return (
        <FloatingPanel
            isOpen={isOpen}
            onClose={onClose}
            title={panelTitle}
            minimizedTitle={isImporting || isUploading ? `${panelTitle}...` : `${panelTitle} (${rawFiles.length})`}
            icon={<Upload className="w-4 h-4" />}
            className="w-[600px] h-[600px] rounded-[40px] shadow-sm bg-surface p-2"
            variant="clean"
        >
            {({ close, minimize }) => (
                <div className="bg-card rounded-2xl h-full w-full flex flex-col p-8 overflow-hidden font-sans">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6 shrink-0">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={close}
                                className="p-2 bg-surface-hover hover:bg-surface-pressed rounded-full transition-colors"
                                aria-label="Close"
                            >
                                <X className="w-4 h-4 text-text" />
                            </button>
                            <button
                                onClick={minimize}
                                className="p-2 bg-surface-hover hover:bg-surface-pressed rounded-full transition-colors"
                                aria-label="Minimize"
                            >
                                <Minus className="w-4 h-4 text-text" />
                            </button>
                        </div>
                        {hasContent && (
                            <button
                                onClick={handleClear}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-text-secondary hover:text-text hover:bg-surface-hover transition-colors"
                            >
                                <RotateCcw className="w-3 h-3" />
                                Clear
                            </button>
                        )}
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 -mr-2">

                        {/* Drop zone — always visible, compact when files already added */}
                        <div
                            className={cn(
                                "border-2 border-dashed rounded-3xl flex flex-col items-center justify-center text-center transition-colors cursor-pointer mb-8",
                                hasContent ? "h-24" : "h-48",
                                isDragActive
                                    ? "border-primary bg-primary/5"
                                    : "border-surface-active hover:border-primary hover:bg-surface"
                            )}
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                multiple
                                onChange={handleFileSelect}
                            />
                            <div className="flex flex-col items-center gap-2">
                                {!hasContent && (
                                    <div className="w-12 h-12 rounded-full bg-surface-hover flex items-center justify-center mb-2">
                                        <Upload className="w-5 h-5 text-text-secondary" />
                                    </div>
                                )}
                                <div className="flex items-center gap-2 text-text font-medium">
                                    {hasContent && <Upload className="w-4 h-4" />}
                                    <span>{hasContent ? 'Drop more files or click to browse' : 'Drop files or folders here'}</span>
                                </div>
                                {!hasContent && (
                                    <p className="text-xs text-text-secondary">or click to browse</p>
                                )}
                            </div>
                        </div>

                        {/* Agent Preview */}
                        {detectedType === 'agent' && agentData && (
                            <AgentPreviewCard
                                frontmatter={agentData.frontmatter}
                                markdownBody={agentData.body}
                                files={fileEntries}
                                warning={parseWarning || undefined}
                            />
                        )}

                        {/* Skill Preview */}
                        {detectedType === 'skill' && skillData && (
                            <SkillPreviewCard
                                frontmatter={skillData.frontmatter}
                                xerushub={skillData.xerushub}
                                markdownBody={skillData.body}
                                files={fileEntries}
                            />
                        )}

                        {/* Hint when regular files dropped in import context */}
                        {detectedType === 'files' && context === 'import' && rawFiles.length > 0 && (
                            <div className="px-4 py-3 rounded-xl bg-warning/10 border border-warning/20 text-sm text-warning">
                                <p className="font-medium">No agent or skill detected</p>
                                <p className="text-xs mt-1 text-amber-600">
                                    To import an agent, include an <code className="bg-warning/15 px-1 rounded">agent.md</code> file. For a skill, include a <code className="bg-warning/15 px-1 rounded">SKILL.md</code> file.
                                </p>
                            </div>
                        )}

                        {/* Import error */}
                        {importError && (
                            <div className="mt-4 px-3 py-2 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive font-medium">
                                {importError}
                            </div>
                        )}

                        {/* Attachments — always visible */}
                        <div className="mb-6">
                            <h4 className="text-sm font-medium text-text mb-3">Attachments:</h4>
                            {attachmentFiles.length > 0 ? (
                                <div className="space-y-2">
                                    {attachmentFiles.map(file => (
                                        <div key={file.id} className="group flex items-center gap-3 p-3 rounded-2xl border border-surface-active bg-card hover:bg-surface-hover transition-colors">
                                            <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center shrink-0">
                                                {file.type === 'pdf' && <span className="text-sm font-serif italic text-text-secondary">@</span>}
                                                {file.type === 'audio' && <Mic className="w-4 h-4 text-text-secondary" />}
                                                {file.type === 'other' && <Paperclip className="w-4 h-4 text-text-secondary" />}
                                            </div>
                                            <div className="flex-1 min-w-0 flex items-center gap-3">
                                                <span className="text-sm text-text truncate font-medium">{file.file.name}</span>
                                                <span className="text-xs text-text-secondary shrink-0">
                                                    {file.file.size < 1024 ? `${file.file.size} B` : file.file.size < 1048576 ? `${(file.file.size / 1024).toFixed(1)} KB` : `${(file.file.size / 1048576).toFixed(1)} MB`}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => removeFile(file.id)}
                                                className="p-2 text-text-secondary hover:text-destructive transition-colors"
                                                aria-label="Remove file"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-text-secondary py-2">No files added yet</p>
                            )}
                        </div>

                        {/* Image Grid — always visible */}
                        <div className="mb-6">
                            <div className="grid grid-cols-3 gap-3">
                                {imageFiles.map(file => (
                                    <div key={file.id} className="relative aspect-video rounded-2xl overflow-hidden group border border-surface-active">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={file.blobUrl || ''}
                                            alt={file.file.name}
                                            className="w-full h-full object-cover"
                                        />
                                        <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 backdrop-blur-sm rounded-full text-[10px] text-white font-medium">
                                            {file.file.size < 1024 ? `${file.file.size} B` : file.file.size < 1048576 ? `${(file.file.size / 1024).toFixed(1)} KB` : `${(file.file.size / 1048576).toFixed(1)} MB`}
                                        </div>
                                        <button
                                            onClick={() => removeFile(file.id)}
                                            className="absolute top-2 right-2 w-6 h-6 bg-card/80 hover:bg-card rounded-full flex items-center justify-center text-text-secondary hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                                            aria-label="Remove image"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="aspect-video rounded-2xl bg-surface border border-surface-active flex items-center justify-center hover:bg-surface-hover transition-colors"
                                    aria-label="Add image"
                                >
                                    <PlusIcon className="w-6 h-6 text-text-secondary" />
                                </button>
                            </div>
                        </div>

                        {/* Tags + Folder — always visible */}
                        <div className="space-y-4 pt-2 border-t border-surface-active">
                            {/* Tags */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                                    <Tag className="w-3 h-3" /> Tags
                                </label>
                                <div className="flex flex-wrap gap-2 bg-card p-2 rounded-lg border border-surface-active focus-within:ring-1 focus-within:ring-primary transition-shadow">
                                    {tags.map(tag => (
                                        <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-surface text-xs font-medium text-text">
                                            {tag}
                                            <button onClick={() => removeTag(tag)} className="hover:text-destructive" aria-label={`Remove tag ${tag}`}>
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                    <input
                                        type="text"
                                        value={tagInput}
                                        onChange={(e) => setTagInput(e.target.value)}
                                        onKeyDown={handleTagKeyDown}
                                        placeholder={tags.length === 0 ? "Add tags..." : ""}
                                        className="flex-1 min-w-[80px] text-sm bg-transparent focus:outline-none"
                                    />
                                </div>
                                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                    {['Design', 'Blog', 'Research', 'Archive'].map(suggestion => (
                                        <button
                                            key={suggestion}
                                            onClick={() => {
                                                if (!tags.includes(suggestion)) setTags([...tags, suggestion])
                                            }}
                                            className="px-2 py-1 rounded-full bg-surface-hover text-xs text-text-secondary hover:bg-surface-pressed hover:text-text transition-colors whitespace-nowrap"
                                        >
                                            + {suggestion}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Folder / Channel — always visible */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                                    <Folder className="w-3 h-3" /> {context === 'workspace' ? 'Folder' : 'Channel'}
                                </label>
                                <div className="relative">
                                    <select
                                        value={selectedFolderId || ''}
                                        onChange={(e) => setSelectedFolderId(e.target.value || null)}
                                        className="w-full appearance-none bg-card border border-surface-active text-text text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-primary transition-colors"
                                    >
                                        <option value="">{context === 'workspace' ? 'No Folder (Root)' : 'No Channel'}</option>
                                        {(props.folders || []).map(folder => (
                                            <option key={folder.id} value={folder.id}>
                                                {folder.name}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer — always visible */}
                    <div className="pt-4 mt-auto shrink-0 border-t border-surface-active">
                        <div className="flex items-center justify-between">
                            {/* Left: Write with AI */}
                            <button
                                disabled
                                className="h-9 px-3 rounded-xl flex items-center gap-2 text-text-secondary font-medium text-sm opacity-50 cursor-not-allowed"
                            >
                                <Sparkles className="w-4 h-4" />
                                Write with AI
                            </button>

                            {/* Right: Cancel + action */}
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={onClose}
                                    className="px-6 py-2.5 rounded-xl border border-surface-active text-text hover:bg-surface font-medium text-sm transition-colors"
                                >
                                    Cancel
                                </button>

                                {/* Import button for agent/skill */}
                                {isDetectedImport && (
                                    <button
                                        onClick={() => handleImport(minimize)}
                                        disabled={isImporting}
                                        className="px-6 py-2.5 rounded-xl bg-text text-white text-sm font-medium hover:bg-text/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        {isImporting ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Importing...
                                            </>
                                        ) : (
                                            detectedType === 'agent' ? 'Import Agent' : 'Import Skill'
                                        )}
                                    </button>
                                )}

                                {/* Upload button for workspace files */}
                                {!isDetectedImport && context === 'workspace' && (
                                    <button
                                        onClick={() => handleWorkspaceUpload(minimize)}
                                        disabled={fileItems.length === 0 || isUploading}
                                        className="px-6 py-2.5 rounded-xl bg-text text-white text-sm font-medium hover:bg-text/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        {isUploading ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Uploading...
                                            </>
                                        ) : (
                                            `Upload ${fileItems.length > 0 ? `${fileItems.length} Files` : ''}`
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </FloatingPanel>
    )
}

function PlusIcon({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M5 12h14" />
            <path d="M12 5v14" />
        </svg>
    )
}
