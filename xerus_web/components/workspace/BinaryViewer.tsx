'use client'

import { useEffect, useState } from 'react'
import { Download, FileText, FileSpreadsheet, FileArchive, Image as ImageIcon, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getExtension, formatSize, isImageFile, IMAGE_EXTENSIONS } from './file-utils'
import { downloadFile, getFileBlob } from '@/lib/api/workspace'

function getFileIcon(name: string) {
  const ext = getExtension(name)
  if (IMAGE_EXTENSIONS.has(ext)) {
    return <ImageIcon className="w-16 h-16 text-blue-500" />
  }
  if (ext === 'pdf') {
    return <FileText className="w-16 h-16 text-red-500" />
  }
  if (['docx', 'xlsx', 'pptx'].includes(ext)) {
    return <FileSpreadsheet className="w-16 h-16 text-green-600" />
  }
  return <FileArchive className="w-16 h-16 text-text-muted" />
}

interface BinaryViewerProps {
  name: string
  path: string
  size?: number
  className?: string
}

export function BinaryViewer({ name, path, size, className }: BinaryViewerProps) {
  const ext = getExtension(name)
  const isImage = isImageFile(name)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!isImage) {
      return
    }

    let isCancelled = false
    let objectUrl: string | null = null

    async function loadImage() {
      try {
        setImageError(false)
        setImageLoaded(false)
        const result = await getFileBlob(path)
        if (isCancelled) {
          return
        }
        objectUrl = URL.createObjectURL(result.blob)
        setImageUrl(objectUrl)
      } catch {
        if (!isCancelled) {
          setImageError(true)
          setImageUrl(null)
        }
      }
    }

    loadImage()

    return () => {
      isCancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [isImage, path])

  const handleDownload = async () => {
    try {
      setDownloading(true)
      await downloadFile(path, name)
    } finally {
      setDownloading(false)
    }
  }

  // Image viewer
  if (isImage && !imageError) {
    return (
      <div className={cn('flex flex-col h-full', className)}>
        {/* Image toolbar */}
        <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-surface-active bg-surface">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted font-mono">{path}</span>
            {size != null && (
              <span className="text-[10px] text-text-muted">{formatSize(size)}</span>
            )}
          </div>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-text text-white hover:bg-[#1a1a1a] transition-colors text-xs font-medium"
          >
            {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            {downloading ? 'Downloading' : 'Download'}
          </button>
        </div>

        {/* Image display */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-8 bg-[#F5F5F0]">
          {(!imageLoaded || !imageUrl) && (
            <Loader2 className="w-6 h-6 animate-spin text-text-muted absolute" />
          )}
          {imageUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={name}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
                className={cn(
                  'max-w-full max-h-full object-contain rounded-xl shadow-sm',
                  !imageLoaded && 'opacity-0',
                )}
              />
            </>
          )}
        </div>
      </div>
    )
  }

  // Generic binary viewer (PDFs, docs, archives, or image load failures)
  return (
    <div className={cn('flex flex-col items-center justify-center h-full gap-6 p-8', className)}>
      {getFileIcon(name)}

      <div className="text-center">
        <h3 className="text-lg font-medium text-text mb-1">{name}</h3>
        <p className="text-sm text-text-secondary mb-1">{ext.toUpperCase()} file</p>
        {size != null && <p className="text-sm text-text-muted">{formatSize(size)}</p>}
      </div>

      <p className="text-sm text-text-secondary text-center max-w-sm">
        This file type cannot be edited inline. You can download it or replace it with a new upload.
      </p>

      <div className="flex items-center gap-3">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 px-5 py-2 rounded-full bg-text text-white hover:bg-[#1a1a1a] transition-colors text-sm font-medium"
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {downloading ? 'Downloading' : 'Download'}
        </button>
      </div>
    </div>
  )
}
