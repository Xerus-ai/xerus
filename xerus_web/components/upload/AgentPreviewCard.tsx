'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bot, Wrench, Shield } from 'lucide-react'
import { ModelIcon } from '@/components/agents/AgentAvatar'
import { formatModelName } from '@/utils/models'
import type { AgentFrontmatter } from '@/lib/utils/parse-frontmatter'
import { FileTreePreview, type FileEntry } from './FileTreePreview'

interface AgentPreviewCardProps {
  frontmatter: AgentFrontmatter
  markdownBody: string
  files: FileEntry[]
  warning?: string
}

export function AgentPreviewCard({ frontmatter, markdownBody, files, warning }: AgentPreviewCardProps) {
  const { name, description, ai_model, category, tools, autonomy_level, personality_type } = frontmatter

  return (
    <div className="flex flex-col gap-4">
      {/* Detection badge */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot className="w-3.5 h-3.5 text-primary" />
        </div>
        <span className="text-sm font-semibold text-text">Agent Detected</span>
      </div>

      {/* Agent info card */}
      <div className="bg-surface rounded-2xl p-5 border border-surface-active">
        {/* Header: name + model */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-serif text-xl text-text truncate">{name || 'Unnamed Agent'}</h3>
            {description && (
              <p className="text-sm text-text-secondary line-clamp-2 mt-1">{description}</p>
            )}
          </div>
          {ai_model && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-white border border-surface-active rounded-lg shrink-0 ml-3">
              <ModelIcon model={ai_model} size="sm" />
              <span className="text-[10px] font-bold text-text-secondary max-w-[80px] truncate">
                {formatModelName(ai_model)}
              </span>
            </div>
          )}
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-2 mb-4">
          {category && (
            <span className="text-[10px] font-medium px-2 py-1 rounded-md bg-primary/10 text-primary capitalize">
              {category}
            </span>
          )}
          {personality_type && (
            <span className="text-[10px] font-medium px-2 py-1 rounded-md bg-surface-hover text-text-secondary capitalize">
              {personality_type}
            </span>
          )}
          {autonomy_level && (
            <span className="text-[10px] font-medium px-2 py-1 rounded-md bg-surface-hover text-text-secondary flex items-center gap-1">
              <Shield className="w-3 h-3" />
              {autonomy_level.replace('_', ' ')}
            </span>
          )}
        </div>

        {/* Tools */}
        {tools && tools.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="w-3.5 h-3.5 text-text-secondary shrink-0" />
            <div className="flex flex-wrap gap-1.5">
              {tools.map(tool => (
                <span
                  key={tool}
                  className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-white border border-surface-active text-text-secondary"
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Markdown preview — Eden zoom technique */}
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

      {/* Warning */}
      {warning && (
        <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700 font-medium">
          {warning}
        </div>
      )}

      {/* File tree */}
      <FileTreePreview files={files} />
    </div>
  )
}
