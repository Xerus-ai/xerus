// Shared file utility functions for workspace components.
// Single source of truth for file categorization, formatting, and editability.

import type { FileNode } from '@/lib/api/workspace'

// ---------- Extension Sets ----------

export const TEXT_EXTENSIONS = new Set([
  'md', 'txt', 'json', 'yaml', 'yml', 'csv', 'xml', 'html', 'htm', 'ts', 'tsx', 'js', 'jsx',
  'toml', 'cfg', 'ini', 'sh', 'bash', 'py', 'rb', 'go', 'rs', 'sql', 'css', 'scss', 'less',
  'svg', 'env', 'gitignore', 'dockerfile',
])

export const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'])

export const PDF_EXTENSIONS = new Set(['pdf'])

export const OFFICE_EXTENSIONS = new Set(['docx', 'xlsx', 'pptx', 'doc', 'xls'])

export const CONFIG_EXTENSIONS = new Set(['json', 'yaml', 'yml', 'xml', 'toml'])

// ---------- File Helpers ----------

export function getExtension(name: string): string {
  const parts = name.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}

export function getFileCategory(name: string): 'text' | 'image' | 'pdf' | 'office' | 'binary' {
  const ext = getExtension(name)
  if (TEXT_EXTENSIONS.has(ext)) return 'text'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (PDF_EXTENSIONS.has(ext)) return 'pdf'
  if (OFFICE_EXTENSIONS.has(ext)) return 'office'
  return 'binary'
}

export function isTextFile(name: string): boolean {
  const ext = getExtension(name)
  if (!ext) return true // Extensionless files (Dockerfile, Makefile) treated as text
  return TEXT_EXTENSIONS.has(ext)
}

export function isMarkdownFile(name: string): boolean {
  const ext = getExtension(name)
  return ext === 'md' || ext === 'txt'
}

export function isImageFile(name: string): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(name))
}

export function formatSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function getTypeLabel(name: string): string {
  const ext = getExtension(name)
  if (ext === 'md') return 'Markdown'
  if (ext === 'json') return 'JSON'
  if (ext === 'yaml' || ext === 'yml') return 'YAML'
  if (ext === 'csv') return 'CSV'
  if (ext === 'xml') return 'XML'
  if (ext === 'html' || ext === 'htm') return 'HTML'
  if (ext === 'ts' || ext === 'tsx') return 'TypeScript'
  if (ext === 'js' || ext === 'jsx') return 'JavaScript'
  if (ext === 'pdf') return 'PDF'
  if (OFFICE_EXTENSIONS.has(ext)) return ext.toUpperCase()
  if (IMAGE_EXTENSIONS.has(ext)) return 'Image'
  return ext ? ext.toUpperCase() : 'File'
}

// ---------- Tree Helpers ----------

export function sortDirsFirst(a: FileNode, b: FileNode): number {
  if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
  return a.name.localeCompare(b.name)
}

export function collectFiles(node: FileNode): FileNode[] {
  if (node.type === 'file') return [node]
  if (!node.children) return []
  return node.children.flatMap(collectFiles)
}

export function countFiles(node: FileNode): number {
  return collectFiles(node).length
}

export function findNode(root: FileNode, targetPath: string): FileNode | null {
  if (root.path === targetPath) return root
  if (root.children) {
    for (const child of root.children) {
      const found = findNode(child, targetPath)
      if (found) return found
    }
  }
  return null
}

// ---------- Filtering / Sorting ----------

export type FileFilter = 'all' | 'markdown' | 'json' | 'config' | 'media'
export type SortMode = 'name' | 'modified' | 'size'

export function matchesFilter(node: FileNode, filter: FileFilter): boolean {
  if (filter === 'all') return true
  const ext = getExtension(node.name)
  switch (filter) {
    case 'markdown':
      return ext === 'md' || ext === 'txt'
    case 'json':
      return ext === 'json'
    case 'config':
      return CONFIG_EXTENSIONS.has(ext)
    case 'media':
      return IMAGE_EXTENSIONS.has(ext) || ext === 'pdf'
    default:
      return true
  }
}

export function matchesSearch(node: FileNode, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)
}

export function sortFiles(files: FileNode[], mode: SortMode): FileNode[] {
  return files.slice().sort((a, b) => {
    switch (mode) {
      case 'name':
        return a.name.localeCompare(b.name)
      case 'modified':
        return (b.modified || '').localeCompare(a.modified || '')
      case 'size':
        return (b.size || 0) - (a.size || 0)
      default:
        return 0
    }
  })
}

// ---------- Editability (client-side, mirrors backend editability.ts) ----------

const AUTO_GENERATED_PATTERNS: RegExp[] = [
  /^agents\/[^/]+\/CLAUDE\.md$/,
  /^CLAUDE\.md$/,
]

const EDITABLE_PATTERNS: RegExp[] = [
  /^agents\/[^/]+\/SOUL\.md$/,
  /^agents\/[^/]+\/STATUS\.md$/,
  /^agents\/[^/]+\/config\.json$/,
  /^agents\/[^/]+\/HEARTBEAT\.md$/,
  /^agents\/[^/]+\/knowledge\/.+/,
  /^drive\/.+/,
  /^projects\/[^/]+\/knowledge\/.+/,
]

export function getEditabilityBadge(path: string): { label: string; className: string } {
  for (const p of AUTO_GENERATED_PATTERNS) {
    if (p.test(path)) {
      return { label: 'Auto-generated', className: 'bg-orange-100 text-orange-800' }
    }
  }
  for (const p of EDITABLE_PATTERNS) {
    if (p.test(path)) {
      return { label: 'Editable', className: 'bg-green-100 text-green-800' }
    }
  }
  return { label: 'Read-only', className: 'bg-surface-hover text-text-secondary' }
}
