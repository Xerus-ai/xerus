'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Upload, X, Minus, FileText, Folder, Tag, Trash2, CheckCircle, AlertCircle, Loader2, ChevronDown, ChevronUp, Link as LinkIcon, Image as ImageIcon, Mic, Play, Download, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FloatingPanel } from '@/components/common/FloatingPanel'
import { motion, AnimatePresence } from 'framer-motion'

interface Folder {
    id: string
    name: string
}

interface FileUploadPanelProps {
    isOpen: boolean
    onClose: () => void
    folders: Folder[]
    currentFolderId: string | null
    uploadFile: (file: File, tags: string[], folderId: string | null) => Promise<void>
    onUploadComplete: () => void
}

interface FileItem {
    file: File
    id: string
    status: 'pending' | 'uploading' | 'success' | 'error'
    progress: number
    message?: string
    type: 'pdf' | 'image' | 'audio' | 'link' | 'other'
}

export function FileUploadPanel({ isOpen, onClose, folders, currentFolderId, uploadFile, onUploadComplete }: FileUploadPanelProps) {
    const [files, setFiles] = useState<FileItem[]>([])
    const [tags, setTags] = useState<string[]>([])
    const [tagInput, setTagInput] = useState('')
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(currentFolderId)
    const [isDragActive, setIsDragActive] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Update selected folder when currentFolderId changes (if not already set by user)
    useEffect(() => {
        if (currentFolderId) {
            setSelectedFolderId(currentFolderId)
        }
    }, [currentFolderId])

    // Reset state when closed
    useEffect(() => {
        if (!isOpen) {
            setFiles([])
            setTags([])
            setTagInput('')
            setIsUploading(false)
        }
    }, [isOpen])

    const getFileType = (file: File): FileItem['type'] => {
        if (file.type.startsWith('image/')) return 'image'
        if (file.type.startsWith('audio/')) return 'audio'
        if (file.type === 'application/pdf') return 'pdf'
        return 'other'
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            addFiles(Array.from(e.target.files))
        }
        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const addFiles = (newFiles: File[]) => {
        const newFileItems: FileItem[] = newFiles.map(file => ({
            file,
            id: Math.random().toString(36).substring(7),
            status: 'pending',
            progress: 0,
            type: getFileType(file)
        }))
        setFiles(prev => [...prev, ...newFileItems])
    }

    const removeFile = (id: string) => {
        setFiles(prev => prev.filter(f => f.id !== id))
    }

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsDragActive(true)
        } else if (e.type === 'dragleave') {
            setIsDragActive(false)
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragActive(false)
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            addFiles(Array.from(e.dataTransfer.files))
        }
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

    const handleUploadClick = async (minimize: () => void) => {
        const pendingFiles = files.filter(f => f.status === 'pending' || f.status === 'error')
        if (pendingFiles.length === 0) return

        setIsUploading(true)
        minimize() // Auto-minimize on start using FloatingPanel's minimize

        for (const fileItem of pendingFiles) {
            // Update status to uploading
            setFiles(prev => prev.map(f =>
                f.id === fileItem.id ? { ...f, status: 'uploading', progress: 0 } : f
            ))

            try {
                // Simulate progress (optional, or rely on real upload speed if we had XHR)
                const progressInterval = setInterval(() => {
                    setFiles(prev => prev.map(f =>
                        f.id === fileItem.id && f.status === 'uploading'
                            ? { ...f, progress: Math.min(90, f.progress + 10) }
                            : f
                    ))
                }, 200)

                await uploadFile(fileItem.file, tags, selectedFolderId)

                clearInterval(progressInterval)

                setFiles(prev => prev.map(f =>
                    f.id === fileItem.id ? { ...f, status: 'success', progress: 100 } : f
                ))

                // Refresh list after each success (or do it once at end)
                onUploadComplete()
            } catch (error) {
                console.error("Upload failed", error)
                setFiles(prev => prev.map(f =>
                    f.id === fileItem.id ? { ...f, status: 'error', message: 'Upload failed — please try again' } : f
                ))
            }
        }

        setIsUploading(false)
    }

    // Separate images for the grid view
    const imageFiles = files.filter(f => f.type === 'image')
    const attachmentFiles = files.filter(f => f.type !== 'image')

    return (
        <FloatingPanel
            isOpen={isOpen}
            onClose={onClose}
            title="Upload Files"
            minimizedTitle={`Upload Files (${files.length})`}
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
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 -mr-2">

                        {/* Drag & Drop Zone */}
                        <div
                            className={cn(
                                "border-2 border-dashed rounded-3xl h-40 flex flex-col items-center justify-center text-center transition-colors cursor-pointer mb-8",
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
                                <div className="flex items-center gap-2 text-text font-medium">
                                    <Upload className="w-5 h-5" />
                                    <span>Drag and drop or browse files</span>
                                </div>
                                <p className="text-xs text-text-secondary">
                                    Maximum 500 MB file size
                                </p>
                            </div>
                        </div>

                        {/* Attachments List */}
                        {attachmentFiles.length > 0 && (
                            <div className="mb-8">
                                <h4 className="text-sm font-medium text-text mb-3">
                                    Attachments:
                                </h4>
                                <div className="space-y-2">
                                    {attachmentFiles.map(file => (
                                        <div key={file.id} className="group flex items-center gap-3 p-3 rounded-2xl border border-surface-active bg-card hover:bg-surface-hover transition-colors">
                                            {/* Icon */}
                                            <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center shrink-0">
                                                {file.type === 'pdf' && <span className="text-sm font-serif italic text-text-secondary">@</span>}
                                                {file.type === 'audio' && <Mic className="w-4 h-4 text-text-secondary" />}
                                                {file.type === 'link' && <LinkIcon className="w-4 h-4 text-text-secondary" />}
                                                {file.type === 'other' && <Paperclip className="w-4 h-4 text-text-secondary" />}
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 min-w-0 flex items-center gap-3">
                                                <span className="text-sm text-text truncate font-medium">
                                                    {file.file.name}
                                                </span>

                                                {file.type === 'audio' && (
                                                    <div className="flex-1 h-6 flex items-center gap-1">
                                                        {/* Fake waveform */}
                                                        {Array.from({ length: 20 }).map((_, i) => (
                                                            <div
                                                                key={i}
                                                                className="w-0.5 bg-surface-active rounded-full"
                                                                style={{ height: `${Math.random() * 100}%` }}
                                                            />
                                                        ))}
                                                        <span className="text-xs text-text-secondary ml-2">0:48</span>
                                                    </div>
                                                )}

                                                {file.type !== 'audio' && (
                                                    <span className="text-xs text-text-secondary shrink-0">
                                                        {(file.file.size / (1024 * 1024)).toFixed(1)} MB
                                                    </span>
                                                )}
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-2">
                                                {file.type === 'audio' ? (
                                                    <button className="w-8 h-8 rounded-full bg-text flex items-center justify-center text-white hover:bg-black transition-colors" aria-label="Play">
                                                        <Play className="w-3 h-3 fill-current" />
                                                    </button>
                                                ) : (
                                                    <button className="p-2 text-text-secondary hover:text-text transition-colors" aria-label="Download">
                                                        <Download className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => removeFile(file.id)}
                                                    className="p-2 text-text-secondary hover:text-destructive transition-colors"
                                                    aria-label="Remove file"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Image Grid */}
                        {imageFiles.length > 0 && (
                            <div className="mb-8">
                                <div className="grid grid-cols-3 gap-3">
                                    {imageFiles.map(file => (
                                        <div key={file.id} className="relative aspect-video rounded-2xl overflow-hidden group border border-surface-active">
                                            <img
                                                src={URL.createObjectURL(file.file)}
                                                alt={file.file.name}
                                                className="w-full h-full object-cover"
                                            />
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                            <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 backdrop-blur-sm rounded-full text-[10px] text-white font-medium">
                                                {(file.file.size / (1024 * 1024)).toFixed(1)} MB
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
                                    {/* Add Button */}
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="aspect-video rounded-2xl bg-surface border border-surface-active flex items-center justify-center hover:bg-surface-hover transition-colors"
                                        aria-label="Add image"
                                    >
                                        <Plus className="w-6 h-6 text-text-secondary" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Metadata Section */}
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

                            {/* Folder Selection */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                                    <Folder className="w-3 h-3" /> Folder
                                </label>
                                <div className="relative">
                                    <select
                                        value={selectedFolderId || ''}
                                        onChange={(e) => setSelectedFolderId(e.target.value || null)}
                                        className="w-full appearance-none bg-card border border-surface-active text-text text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-primary transition-colors"
                                    >
                                        <option value="">No Folder (Root)</option>
                                        {folders.map(folder => (
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

                    {/* Footer Actions */}
                    <div className="pt-6 mt-auto flex justify-end gap-3 shrink-0 border-t border-surface-active">
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-xl border border-surface-active text-text hover:bg-surface font-medium text-sm transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => handleUploadClick(minimize)}
                            disabled={files.length === 0 || isUploading}
                            className="px-6 py-2.5 rounded-xl bg-text text-white text-sm font-medium hover:bg-text/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isUploading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Uploading...
                                </>
                            ) : (
                                `Upload ${files.length > 0 ? `${files.length} Files` : ''}`
                            )}
                        </button>
                    </div>
                </div>
            )}
        </FloatingPanel>
    )
}

function Plus({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M5 12h14" />
            <path d="M12 5v14" />
        </svg>
    )
}
