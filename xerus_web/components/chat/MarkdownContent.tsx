'use client'

import { useState, ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { CodeBlock } from '@/components/shared/CodeBlock'
import { Check, Copy } from 'lucide-react'

// @mention highlight
function MentionText({ children }: { children: ReactNode }) {
  if (typeof children !== 'string') return <>{children}</>
  const parts = children.split(/(@[\w-]+)/g)
  if (parts.length === 1) return <>{children}</>
  return (
    <>
      {parts.map((part, i) =>
        /^@[\w-]+$/.test(part) ? (
          <span key={i} className="text-primary font-medium cursor-default hover:underline">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      className="p-1 rounded-md bg-white/10 text-white/40 hover:text-white/70 transition-[color,opacity]"
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      aria-label="Copy code"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </button>
  )
}

const PROSE_CLASSES = cn(
  'prose prose-sm max-w-[65ch] overflow-hidden',
  // Paragraphs — comfortable reading line-height
  'prose-p:leading-[1.6] prose-p:text-text prose-p:text-[15px] prose-p:my-2',
  // Headings — clear size steps with tight leading
  'prose-headings:font-semibold prose-headings:text-text prose-headings:mt-5 prose-headings:mb-2',
  'prose-h1:text-xl prose-h1:leading-tight prose-h2:text-lg prose-h2:leading-snug prose-h3:text-[15px] prose-h3:leading-snug prose-h3:uppercase prose-h3:tracking-wide prose-h3:text-text-secondary',
  'prose-strong:text-text prose-strong:font-semibold',
  // Inline code
  'prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:bg-surface-hover prose-code:text-text prose-code:font-mono prose-code:text-[13px]',
  'prose-code:before:content-none prose-code:after:content-none',
  // Code blocks
  'prose-pre:bg-code-bg prose-pre:rounded-2xl prose-pre:shadow-sm prose-pre:border prose-pre:border-code-border',
  // Lists — proper spacing
  'prose-ul:my-2.5 prose-ol:my-2.5 prose-li:my-1 prose-li:text-text prose-li:text-[15px] prose-li:leading-[1.6]',
  // Links — orange accent with hover underline
  'prose-a:text-secondary prose-a:no-underline hover:prose-a:underline prose-a:font-medium',
  // Blockquotes — subtle bg tint + italic, no heavy left border
  'prose-blockquote:border-l-0 prose-blockquote:not-italic prose-blockquote:bg-surface-hover/60 prose-blockquote:rounded-lg prose-blockquote:px-4 prose-blockquote:py-3 prose-blockquote:text-text-secondary prose-blockquote:italic prose-blockquote:font-serif',
  // Tables
  'prose-table:text-sm prose-th:text-left prose-th:text-text prose-th:font-semibold prose-th:pb-2',
  'prose-td:text-text prose-td:py-1.5',
  'prose-tr:border-b prose-tr:border-surface-active',
  'prose-em:text-text/80',
)

interface MarkdownContentProps {
  content: string
  className?: string
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={cn(PROSE_CLASSES, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className: codeClassName, children, ...props }: {
            node?: unknown; inline?: boolean; className?: string; children?: React.ReactNode
          }) {
            const match = /language-(\w+)/.exec(codeClassName || '')
            const text = String(children).replace(/\n$/, '')

            return !inline && match ? (
              <div className="relative group/code my-4">
                <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2 z-10">
                  <span className="text-[11px] font-medium text-white/40 uppercase tracking-wide">{match[1]}</span>
                  <div className="opacity-0 group-hover/code:opacity-100 transition-opacity">
                    <CopyButton text={text} />
                  </div>
                </div>
                <CodeBlock
                  code={text}
                  language={match[1]}
                  preTag="div"
                  className="rounded-2xl !mt-0 !mb-0 !pt-10 shadow-sm border border-code-border text-sm"
                />
              </div>
            ) : (
              <code className="px-1.5 py-0.5 rounded-lg bg-surface-hover font-mono text-sm text-primary" {...props}>
                {children}
              </code>
            )
          },
          a({ href, children }) {
            // Validate URL protocol to prevent XSS
            // Pass through hash-only and empty hrefs without rewriting
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
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-secondary hover:underline font-medium">
                {children}
              </a>
            )
          },
          p({ children }) {
            return (
              <p>
                {Array.isArray(children)
                  ? children.map((child, i) =>
                      typeof child === 'string' ? <MentionText key={i}>{child}</MentionText> : child
                    )
                  : typeof children === 'string'
                    ? <MentionText>{children}</MentionText>
                    : children}
              </p>
            )
          },
          li({ children }) {
            return (
              <li>
                {Array.isArray(children)
                  ? children.map((child, i) =>
                      typeof child === 'string' ? <MentionText key={i}>{child}</MentionText> : child
                    )
                  : typeof children === 'string'
                    ? <MentionText>{children}</MentionText>
                    : children}
              </li>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
