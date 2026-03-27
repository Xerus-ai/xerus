'use client'

import { useState, ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '@/lib/utils'
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
          <span key={i} className="text-[#FF6600] font-medium cursor-default hover:underline">{part}</span>
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
      className="p-1 rounded-md bg-white/10 text-gray-400 hover:text-gray-200 transition-colors"
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
  'prose prose-sm max-w-none overflow-hidden',
  'prose-p:leading-relaxed prose-p:text-black prose-p:text-[15px] prose-p:my-1.5',
  'prose-headings:font-semibold prose-headings:text-black prose-headings:mt-4 prose-headings:mb-2',
  'prose-h2:text-lg prose-h3:text-base',
  'prose-strong:text-black prose-strong:font-semibold',
  'prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-lg prose-code:bg-surface prose-code:text-[#FF6600] prose-code:font-mono prose-code:text-sm',
  'prose-code:before:content-none prose-code:after:content-none',
  'prose-pre:bg-[#1E1E1E] prose-pre:rounded-2xl prose-pre:shadow-sm prose-pre:border prose-pre:border-gray-800',
  'prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-li:text-black prose-li:text-[15px]',
  'prose-a:text-[#FF6600] prose-a:no-underline hover:prose-a:underline prose-a:font-medium',
  'prose-table:text-sm prose-th:text-left prose-th:text-black prose-th:font-semibold prose-th:pb-2',
  'prose-td:text-black prose-td:py-1.5',
  'prose-tr:border-b prose-tr:border-surface-active',
  'prose-em:text-black/80',
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
                  <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{match[1]}</span>
                  <div className="opacity-0 group-hover/code:opacity-100 transition-opacity">
                    <CopyButton text={text} />
                  </div>
                </div>
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                  className="rounded-2xl !mt-0 !mb-0 !pt-10 shadow-sm border border-gray-800 text-sm"
                  {...props}
                >
                  {text}
                </SyntaxHighlighter>
              </div>
            ) : (
              <code className="px-1.5 py-0.5 rounded-lg bg-surface font-mono text-sm text-[#FF6600]" {...props}>
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
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
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
