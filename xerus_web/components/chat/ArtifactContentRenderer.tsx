'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { CodeBlock } from '@/components/shared/CodeBlock'
import { Download, File } from 'lucide-react'

// ---------------------------------------------------------------------------
// Public types — used by ArtifactViewerPanel and useArtifactTabs
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
  content?: string
  url?: string
  language?: string
}

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
// Renderers
// ---------------------------------------------------------------------------

function HtmlRenderer({ content, url }: { content?: string; url?: string }) {
  return (
    <iframe
      title="HTML Preview"
      sandbox="allow-scripts allow-same-origin allow-forms"
      srcDoc={content || undefined}
      src={!content && url ? url : undefined}
      className="w-full h-full border-0 bg-white"
      allow="clipboard-write; fullscreen"
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
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
              return <span>{children}</span>
            }
            try {
              const parsed = new URL(href, window.location.origin)
              if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
                return <span>{children}</span>
              }
            } catch {
              return <span>{children}</span>
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            )
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

function TextRenderer({ content }: { content: string }) {
  return (
    <pre className="px-6 py-5 text-sm leading-relaxed text-text-secondary whitespace-pre-wrap font-mono">
      {content}
    </pre>
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
// Dispatcher
// ---------------------------------------------------------------------------

export function ArtifactContentRenderer({ content }: { content: ViewerContent }) {
  const language = detectLanguage(content.title, content.language)

  switch (content.type) {
    case 'html':
      if (content.content || content.url)
        return <HtmlRenderer content={content.content} url={content.url} />
      return <EmptyRenderer title={content.title} url={content.url} />

    case 'pdf':
      if (content.url) return <PdfRenderer url={content.url} />
      return <EmptyRenderer title={content.title} />

    case 'image':
      if (content.url) return <ImageRenderer url={content.url} title={content.title} />
      return <EmptyRenderer title={content.title} />

    case 'plan':
    case 'markdown':
      if (content.content) return <MarkdownRenderer content={content.content} />
      return <EmptyRenderer title={content.title} url={content.url} />

    case 'code':
    case 'csv':
      if (content.content) return <CodeRenderer content={content.content} language={language} />
      return <EmptyRenderer title={content.title} url={content.url} />

    case 'text':
      if (content.content) return <TextRenderer content={content.content} />
      return <EmptyRenderer title={content.title} url={content.url} />

    default:
      return <EmptyRenderer title={content.title} url={content.url} />
  }
}

export function isFullBleedContent(type: ViewerContentType): boolean {
  return type === 'html' || type === 'pdf' || type === 'image'
}
