/**
 * Drive document helpers
 * The user's drive/ folder is the single source of truth for documents they
 * can attach to agents as knowledge sources. Anything outside drive/
 * (agents/<slug>/knowledge/, .claude/, context/, data/) is internal plumbing
 * and must never surface in user-facing pickers.
 */
import type { FileNode } from '@/lib/api/workspace'

export interface DriveDocument {
  path: string
  name: string
  title: string
  content_type: string
}

const INGESTIBLE_EXTENSIONS = new Set([
  'md', 'txt', 'pdf', 'docx', 'doc', 'rtf',
  'csv', 'tsv', 'json', 'html', 'htm', 'xml',
])

export function flattenDriveDocuments(node: FileNode): DriveDocument[] {
  const docs: DriveDocument[] = []

  const visit = (current: FileNode) => {
    if (current.type === 'file' && current.path.startsWith('drive/') && !current.name.startsWith('.')) {
      const ext = current.name.includes('.') ? current.name.split('.').pop()!.toLowerCase() : ''
      if (INGESTIBLE_EXTENSIONS.has(ext)) {
        docs.push({
          path: current.path,
          name: current.name,
          title: current.name,
          content_type: ext || 'document',
        })
      }
    }
    current.children?.forEach(visit)
  }

  visit(node)
  return docs
}
