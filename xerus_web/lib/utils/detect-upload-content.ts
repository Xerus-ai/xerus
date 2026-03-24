/**
 * Auto-detect what the user is uploading based on filenames.
 * Case-sensitive matching: agent.md (lowercase), SKILL.md (uppercase) — matches actual file conventions.
 */
export type UploadContentType = 'agent' | 'skill' | 'files'

export function detectUploadContent(files: File[]): UploadContentType {
  const names = new Set(files.map(f => f.name))
  if (names.has('agent.md')) return 'agent'
  if (names.has('SKILL.md')) return 'skill'
  return 'files'
}
