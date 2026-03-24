'use client'

import { FileText, FolderOpen } from 'lucide-react'

interface FileEntry {
  name: string
  size: number
  isDirectory?: boolean
  children?: FileEntry[]
}

interface FileTreePreviewProps {
  files: FileEntry[]
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileRow({ file, depth = 0 }: { file: FileEntry; depth?: number }) {
  return (
    <>
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-surface-hover transition-colors"
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {file.isDirectory ? (
          <FolderOpen className="w-3.5 h-3.5 text-text-secondary shrink-0" />
        ) : (
          <FileText className="w-3.5 h-3.5 text-text-secondary shrink-0" />
        )}
        <span className="text-xs text-text font-medium truncate flex-1">
          {file.name}
        </span>
        {!file.isDirectory && (
          <span className="text-[10px] text-text-secondary tabular-nums shrink-0">
            {formatSize(file.size)}
          </span>
        )}
        {file.isDirectory && file.children && (
          <span className="text-[10px] text-text-secondary shrink-0">
            {file.children.length} files
          </span>
        )}
      </div>
      {file.isDirectory && file.children?.map((child, i) => (
        <FileRow key={`${child.name}-${i}`} file={child} depth={depth + 1} />
      ))}
    </>
  )
}

export function FileTreePreview({ files }: FileTreePreviewProps) {
  return (
    <div className="space-y-0.5">
      <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2 px-2">
        Files
      </h4>
      {files.map((file, i) => (
        <FileRow key={`${file.name}-${i}`} file={file} />
      ))}
    </div>
  )
}

export type { FileEntry }
