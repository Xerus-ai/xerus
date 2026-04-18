import { Circle, Clock, CheckCircle2, AlertTriangle, X } from 'lucide-react'

// ---------------------------------------------------------------------------
// Agent avatar color generation (hash-based, deterministic per name)
// ---------------------------------------------------------------------------

export const AVATAR_COLORS = [
  '#E8733A', '#3B82F6', '#22C55E', '#EAB308', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#14B8A6', '#6366F1',
]

export function getAgentColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

// ---------------------------------------------------------------------------
// Label color generation
// ---------------------------------------------------------------------------

export const LABEL_COLOR_MAP: Record<string, string> = {
  // Engineering / product labels
  feature: '#22C55E',
  onboarding: '#06B6D4',
  billing: '#F97316',
  security: '#EF4444',
  v2: '#6B7280',
  bug: '#EF4444',
  infra: '#8B5CF6',
  docs: '#3B82F6',
  execution: '#3B82F6',
  kb: '#8B5CF6',
  // Business workflow labels (mirrors TaskPanelParts.TAG_SUGGESTIONS)
  strategy: '#8B5CF6',
  content: '#22C55E',
  research: '#06B6D4',
  launch: '#F97316',
  campaign: '#3B82F6',
  analytics: '#6366F1',
  design: '#EC4899',
  budget: '#EAB308',
  outreach: '#14B8A6',
  review: '#EF4444',
}

const LABEL_FALLBACK_COLORS = [
  '#22C55E', '#3B82F6', '#F97316', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#EAB308', '#14B8A6', '#6366F1',
]

export function getLabelColor(label: { name: string; color: string }): string {
  if (label.color) return label.color
  const mapped = LABEL_COLOR_MAP[label.name.toLowerCase()]
  if (mapped) return mapped
  let hash = 0
  for (let i = 0; i < label.name.length; i++) {
    hash = label.name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return LABEL_FALLBACK_COLORS[Math.abs(hash) % LABEL_FALLBACK_COLORS.length]
}

export function getLabelColorByName(name: string): string {
  return getLabelColor({ name, color: '' })
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

type IconComponent = typeof Circle

export const STATUS_CFG: Record<string, { label: string; color: string; icon: IconComponent }> = {
  open: { label: 'Todo', color: '#6B7280', icon: Circle },
  todo: { label: 'Todo', color: '#6B7280', icon: Circle },
  in_progress: { label: 'In Progress', color: '#3B82F6', icon: Clock },
  done: { label: 'Completed', color: '#22C55E', icon: CheckCircle2 },
  completed: { label: 'Completed', color: '#22C55E', icon: CheckCircle2 },
  needs_approval: { label: 'Needs Approval', color: '#F59E0B', icon: AlertTriangle },
  blocked: { label: 'Blocked', color: '#EF4444', icon: AlertTriangle },
  cancelled: { label: 'Cancelled', color: '#6B7280', icon: X },
}

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

export function fmtDateLong(ds: string): string {
  return new Date(ds).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

export function fmtDateShort(ds: string): string {
  return new Date(ds).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export function formatShortDate(dateString: string): string {
  const d = new Date(dateString)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function timeAgo(ds: string): string {
  const diff = Date.now() - new Date(ds).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ---------------------------------------------------------------------------
// Priority config
// ---------------------------------------------------------------------------

export const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  low: { label: 'Low', color: '#22C55E' },
  medium: { label: 'Medium', color: '#F59E0B' },
  high: { label: 'High', color: '#F97316' },
  critical: { label: 'Critical', color: '#EF4444' },
}

// ---------------------------------------------------------------------------
// File type badge colors
// ---------------------------------------------------------------------------

export const FILE_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  pdf: { bg: '#FEE2E2', text: '#DC2626' },
  json: { bg: '#DBEAFE', text: '#2563EB' },
  csv: { bg: '#D1FAE5', text: '#059669' },
  png: { bg: '#F3E8FF', text: '#7C3AED' },
  jpg: { bg: '#F3E8FF', text: '#7C3AED' },
  md: { bg: '#E0E7FF', text: '#4338CA' },
  txt: { bg: '#F3F4F6', text: '#4B5563' },
}

export function getFileExtension(filename: string): string {
  const parts = filename.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}
