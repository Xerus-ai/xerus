'use client'

import { useState, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { CodeBlock } from '@/components/shared/CodeBlock'
import {
  X,
  Copy,
  Check,
  Sparkles,
  FileText,
  FileCode,
  Image as ImageIcon,
  File,
  Download,
  ExternalLink,
  List,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ViewerContentType =
  | 'plan'
  | 'html'
  | 'pdf'
  | 'markdown'
  | 'image'
  | 'code'
  | 'csv'
  | 'text'
  | 'unknown'

export interface ViewerContent {
  type: ViewerContentType
  title: string
  subtitle?: string
  content?: string   // text content (markdown, code, html source, csv)
  url?: string       // URL for iframes (pdf, html) or images
  language?: string  // code language hint
}

interface ArtifactViewerPanelProps {
  content: ViewerContent
  onClose: () => void
  className?: string
}

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
  css: 'css', scss: 'scss', html: 'html', xml: 'xml',
  json: 'json', yaml: 'yaml', yml: 'yaml', md: 'markdown',
  sql: 'sql', sh: 'bash', bash: 'bash', csv: 'csv',
}

function detectLanguage(filename: string, explicit?: string): string {
  if (explicit) return LANG_MAP[explicit] ?? explicit
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return LANG_MAP[ext] ?? 'text'
}

// ---------------------------------------------------------------------------
// Icon helpers
// ---------------------------------------------------------------------------

function getTypeIcon(type: ViewerContentType) {
  switch (type) {
    case 'plan': return Sparkles
    case 'image': return ImageIcon
    case 'markdown': return FileText
    case 'code': case 'csv': return FileCode
    default: return File
  }
}

function getTypeColor(type: ViewerContentType) {
  switch (type) {
    case 'plan': return 'bg-primary/15 text-primary'
    case 'html': return 'bg-cyan-500/10 text-cyan-600'
    case 'pdf': return 'bg-red-500/10 text-red-600'
    case 'image': return 'bg-emerald-500/10 text-emerald-600'
    case 'code': case 'csv': return 'bg-violet-500/10 text-violet-600'
    case 'markdown': return 'bg-blue-500/10 text-blue-600'
    default: return 'bg-surface-alt text-text-secondary'
  }
}

const TYPE_LABELS: Record<ViewerContentType, string> = {
  plan: 'Plan',
  html: 'HTML',
  pdf: 'PDF',
  markdown: 'Document',
  image: 'Image',
  code: 'Code',
  csv: 'CSV',
  text: 'Text',
  unknown: 'File',
}

// ---------------------------------------------------------------------------
// Content renderers
// ---------------------------------------------------------------------------

function HtmlRenderer({ content, url }: { content?: string; url?: string }) {
  return (
    <iframe
      title="HTML Preview"
      sandbox="allow-scripts"
      srcDoc={content || undefined}
      src={!content && url ? url : undefined}
      className="w-full h-full border-0"
    />
  )
}

function PdfRenderer({ url }: { url: string }) {
  return (
    <iframe
      title="PDF Preview"
      src={url}
      sandbox="allow-scripts allow-same-origin"
      className="w-full h-full border-0"
    />
  )
}

function ImageRenderer({ url, title }: { url: string; title: string }) {
  return (
    <div className="flex items-center justify-center h-full p-6 bg-surface">
      <img
        src={url}
        alt={title}
        className="max-w-full max-h-full object-contain rounded-xl shadow-sm"
      />
    </div>
  )
}

function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className={cn(
      'px-6 py-5',
      'prose prose-sm max-w-none',
      'prose-p:leading-relaxed prose-p:text-text-secondary prose-p:text-[14px] prose-p:my-1.5',
      'prose-headings:font-semibold prose-headings:text-text prose-headings:mt-4 prose-headings:mb-2',
      'prose-h1:text-xl prose-h2:text-lg prose-h3:text-base',
      'prose-strong:text-text prose-strong:font-semibold',
      'prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:bg-surface-hover prose-code:text-text prose-code:font-mono prose-code:text-[13px]',
      'prose-code:before:content-none prose-code:after:content-none',
      'prose-pre:bg-code-bg prose-pre:rounded-xl prose-pre:border prose-pre:border-code-border',
      'prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-li:text-text-secondary prose-li:text-[14px]',
      'prose-a:text-secondary prose-a:no-underline hover:prose-a:underline prose-a:font-medium',
      'prose-table:text-xs prose-th:text-left prose-th:text-text prose-th:font-semibold prose-th:pb-2',
      'prose-td:text-text-secondary prose-td:py-1',
      'prose-tr:border-b prose-tr:border-surface-active',
      'prose-em:text-text-secondary',
      'prose-blockquote:border-l-0 prose-blockquote:not-italic prose-blockquote:bg-surface-hover/60 prose-blockquote:rounded-lg prose-blockquote:px-4 prose-blockquote:py-3 prose-blockquote:text-text-secondary prose-blockquote:italic prose-blockquote:font-serif',
    )}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children }: { href?: string; children?: React.ReactNode }) {
            if (!href || href.startsWith('#')) {
              return <span>{children}</span>;
            }
            try {
              const parsed = new URL(href, window.location.origin);
              if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
                return <span>{children}</span>;
              }
            } catch {
              return <span>{children}</span>;
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
          code({ inline, className: codeClassName, children, ...props }: {
            inline?: boolean; className?: string; children?: React.ReactNode
          }) {
            const match = /language-(\w+)/.exec(codeClassName || '')
            const text = String(children).replace(/\n$/, '')

            return !inline && match ? (
              <CodeBlock
                code={text}
                language={match[1]}
                preTag="div"
                className="rounded-xl !mt-0 !mb-0 text-sm"
              />
            ) : (
              <code className={codeClassName} {...props}>{children}</code>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

function CodeRenderer({ content, language }: { content: string; language: string }) {
  return (
    <CodeBlock
      code={content}
      language={language}
      preTag="div"
      className="!m-0 !rounded-none text-sm"
      showLineNumbers
    />
  )
}

function EmptyRenderer({ title, url }: { title: string; url?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
      <File className="w-10 h-10 text-text-muted/30" />
      <p className="text-sm text-text-muted">
        No preview available for <span className="font-medium text-text">{title}</span>
      </p>
      {url && (
        <a
          href={url}
          download={title}
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/90 font-medium transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Download file
        </a>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ArtifactViewerPanel({
  content,
  onClose,
  className,
}: ArtifactViewerPanelProps) {
  const [copied, setCopied] = useState(false)

  const language = useMemo(
    () => detectLanguage(content.title, content.language),
    [content.title, content.language]
  )

  const Icon = getTypeIcon(content.type)
  const iconColor = getTypeColor(content.type)
  const typeLabel = TYPE_LABELS[content.type]

  const handleCopy = () => {
    const text = content.content || content.url || ''
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Decide what to render based on content type
  const renderContent = () => {
    switch (content.type) {
      case 'html':
        if (content.content || content.url)
          return <HtmlRenderer content={content.content} url={content.url} />
        return <EmptyRenderer title={content.title} url={content.url} />

      case 'pdf':
        if (content.url)
          return <PdfRenderer url={content.url} />
        return <EmptyRenderer title={content.title} />

      case 'image':
        if (content.url)
          return <ImageRenderer url={content.url} title={content.title} />
        return <EmptyRenderer title={content.title} />

      case 'plan':
      case 'markdown':
        if (content.content)
          return <MarkdownRenderer content={content.content} />
        return <EmptyRenderer title={content.title} url={content.url} />

      case 'code':
      case 'csv':
        if (content.content)
          return <CodeRenderer content={content.content} language={language} />
        return <EmptyRenderer title={content.title} url={content.url} />

      case 'text':
        if (content.content)
          return (
            <pre className="px-6 py-5 text-sm leading-relaxed text-text-secondary whitespace-pre-wrap font-mono">
              {content.content}
            </pre>
          )
        return <EmptyRenderer title={content.title} url={content.url} />

      default:
        return <EmptyRenderer title={content.title} url={content.url} />
    }
  }

  // Full-bleed content (html, pdf, image) shouldn't scroll via overflow-y-auto
  const isFullBleed = content.type === 'html' || content.type === 'pdf' || content.type === 'image'

  return (
    <div
      className={cn(
        'hidden md:flex flex-col shrink-0 overflow-hidden',
        'h-full',
        'w-[50%] bg-card border-l border-surface-active/40',
        'transition-all duration-200 ease-in-out',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border shrink-0 bg-card">
        {/* Type icon */}
        <div className={cn('w-7 h-7 rounded-xl flex items-center justify-center shrink-0', iconColor)}>
          <Icon className="w-3.5 h-3.5" />
        </div>

        {/* Title + type label */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-text truncate">
            {content.title}
          </div>
          <div className="text-[11px] text-text-muted truncate">
            {content.subtitle || typeLabel}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          {content.url && (
            <a
              href={content.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
              aria-label="Open in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          <button
            type="button"
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            aria-label="Table of contents"
          >
            <List className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors text-xs font-medium"
            aria-label="Copy content"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden lg:inline">{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            aria-label="Close viewer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className={cn('flex-1', isFullBleed ? 'overflow-hidden' : 'overflow-y-auto scrollbar-thin')}>
        {renderContent()}
      </div>
    </div>
  )
}
