'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Puzzle, Tag } from 'lucide-react'
import type { SkillFrontmatter, XerusHubMeta } from '@/lib/utils/parse-frontmatter'
import { FileTreePreview, type FileEntry } from './FileTreePreview'

interface SkillPreviewCardProps {
  frontmatter: SkillFrontmatter
  xerushub?: XerusHubMeta | null
  markdownBody: string
  files: FileEntry[]
}

export function SkillPreviewCard({ frontmatter, xerushub, markdownBody, files }: SkillPreviewCardProps) {
  const name = xerushub?.displayName || frontmatter.name || 'Unnamed Skill'
  const description = xerushub?.summary || frontmatter.description || ''
  const tags = xerushub?.tags || []
  const version = xerushub?.version || frontmatter.version || null

  return (
    <div className="flex flex-col gap-4">
      {/* Detection badge */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <Puzzle className="w-3.5 h-3.5 text-emerald-600" />
        </div>
        <span className="text-sm font-semibold text-text">Skill Detected</span>
      </div>

      {/* Skill info card */}
      <div className="bg-surface rounded-2xl p-5 border border-surface-active">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-serif text-xl text-text truncate">{name}</h3>
            {description && (
              <p className="text-sm text-text-secondary line-clamp-3 mt-1">{description}</p>
            )}
          </div>
          {version && (
            <span className="text-[10px] font-medium px-2 py-1 rounded-md bg-surface-hover text-text-secondary shrink-0 ml-3">
              v{version}
            </span>
          )}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <Tag className="w-3.5 h-3.5 text-text-secondary shrink-0" />
            <div className="flex flex-wrap gap-1.5">
              {tags.map(tag => (
                <span
                  key={tag}
                  className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-[#FF6600]/10 text-[#FF6600]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Author */}
        {frontmatter.author && (
          <p className="text-[11px] text-text-secondary mb-4">
            by <span className="font-medium text-text">{frontmatter.author}</span>
          </p>
        )}

        {/* Markdown preview */}
        <div className="rounded-xl overflow-hidden border border-surface-active bg-white" style={{ maxHeight: '160px' }}>
          <div className="overflow-hidden" style={{ maxHeight: '160px' }}>
            <div
              className="prose prose-sm max-w-none text-text prose-headings:text-text prose-headings:font-normal prose-headings:leading-[1.3] prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-h1:text-[36px] prose-h1:font-normal prose-h1:mb-3 prose-h2:text-[30px] prose-h2:font-normal prose-h2:mb-2 prose-h3:text-[24px] prose-h3:font-normal prose-h3:mb-2"
              style={{
                zoom: 0.35,
                padding: '16px 20px',
                fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
                fontWeight: 300,
                fontSize: '11px',
                lineHeight: 1.35,
              }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {markdownBody}
              </ReactMarkdown>
            </div>
          </div>
          <div
            className="h-4 -mt-4 relative z-10 pointer-events-none"
            style={{ background: 'linear-gradient(to top, white, transparent)' }}
          />
        </div>
      </div>

      {/* File tree */}
      <FileTreePreview files={files} />
    </div>
  )
}
