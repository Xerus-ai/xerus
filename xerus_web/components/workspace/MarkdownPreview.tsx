'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import { cn } from '@/lib/utils'
import { CodeBlock } from '@/components/shared/CodeBlock'

interface MarkdownPreviewProps {
  content: string
  className?: string
}

// Warm code block theme matching Xerus design
const warmCodeTheme: Record<string, React.CSSProperties> = {
  'pre[class*="language-"]': {
    background: '#F5F0EB',
    borderRadius: '12px',
    color: '#2D2D2D',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    fontSize: '13px',
    lineHeight: '1.6',
  },
  'code[class*="language-"]': {
    background: '#F5F0EB',
    color: '#2D2D2D',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  },
  comment: { color: '#999999', fontStyle: 'italic' },
  prolog: { color: '#999999' },
  doctype: { color: '#999999' },
  cdata: { color: '#999999' },
  punctuation: { color: '#999999' },
  property: { color: '#CC6600' },
  tag: { color: '#CC6600' },
  boolean: { color: '#CC6600' },
  number: { color: '#B5695A' },
  constant: { color: '#B5695A' },
  symbol: { color: '#B5695A' },
  selector: { color: '#B5695A' },
  'attr-name': { color: '#CC6600' },
  string: { color: '#B5695A' },
  char: { color: '#B5695A' },
  builtin: { color: '#CC6600' },
  inserted: { color: '#B5695A' },
  operator: { color: '#6E6E6E' },
  entity: { color: '#CC6600' },
  url: { color: '#B5695A' },
  '.language-css .token.string': { color: '#B5695A' },
  '.style .token.string': { color: '#B5695A' },
  atrule: { color: '#CC6600' },
  'attr-value': { color: '#B5695A' },
  keyword: { color: '#CC6600' },
  function: { color: '#6E6E6E' },
  'class-name': { color: '#2D2D2D', fontWeight: '600' },
  regex: { color: '#B5695A' },
  important: { color: '#CC6600', fontWeight: 'bold' },
  variable: { color: '#2D2D2D' },
  deleted: { color: '#B5695A' },
}

export function MarkdownPreview({ content, className }: MarkdownPreviewProps) {
  return (
    <div className={cn('px-12 py-10 overflow-y-auto bg-card', className)}>
      <article className={cn(
        'prose prose-base max-w-[65ch] mx-auto',
        // Headings — serif, clear size steps, tight leading
        'prose-headings:font-serif prose-headings:text-text prose-headings:font-normal',
        'prose-h1:text-[2.25rem] prose-h1:leading-[1.1] prose-h1:tracking-tight prose-h2:text-[1.5rem] prose-h2:leading-[1.2] prose-h2:mt-10 prose-h3:text-[1.15rem] prose-h3:leading-[1.3]',
        // Body — relaxed line-height
        'prose-p:text-text prose-p:leading-[1.7]',
        'prose-strong:text-text prose-strong:font-semibold',
        'prose-li:text-text prose-li:leading-[1.7]',
        // Links — orange accent
        'prose-a:text-secondary prose-a:no-underline hover:prose-a:underline',
        // Inline code — warm bg, no backtick quotes
        'prose-code:bg-surface-hover prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-[13px] prose-code:font-mono prose-code:text-text',
        'prose-code:before:content-none prose-code:after:content-none',
        // Code blocks (pre) — handled by SyntaxHighlighter but fallback styles
        'prose-pre:bg-surface prose-pre:rounded-xl prose-pre:p-0 prose-pre:my-5 prose-pre:border prose-pre:border-surface-active',
        // Lists
        'prose-ul:list-disc prose-ol:list-decimal',
        // HR
        'prose-hr:border-surface-active prose-hr:my-8',
        // Blockquote — subtle bg tint + italic serif, no heavy left border
        'prose-blockquote:border-l-0 prose-blockquote:not-italic prose-blockquote:bg-surface-hover/60 prose-blockquote:rounded-lg prose-blockquote:px-5 prose-blockquote:py-3 prose-blockquote:text-text-secondary prose-blockquote:italic prose-blockquote:font-serif',
        // Tables
        'prose-table:text-sm [&_th]:bg-surface [&_th]:p-2 [&_td]:p-2 [&_tr]:border-b [&_tr]:border-surface-active',
      )}>
        <ReactMarkdown
          remarkPlugins={[remarkFrontmatter, remarkGfm]}
          components={{
            // Handle both fenced code blocks and inline code
            code({ className: codeClassName, children, node, ...props }) {
              const match = /language-(\w+)/.exec(codeClassName || '')
              const codeString = String(children).replace(/\n$/, '')

              // Detect block code: has language OR has newlines OR parent is <pre>
              const isBlock = !!match || codeString.includes('\n')

              if (isBlock) {
                return (
                  <CodeBlock
                    code={codeString}
                    language={match ? match[1] : 'text'}
                    showLineNumbers
                    theme={warmCodeTheme}
                    customStyle={{
                      margin: 0,
                      borderRadius: '12px',
                      fontSize: '13px',
                      lineHeight: '1.6',
                      padding: '1rem',
                      background: '#F5F0EB',
                      border: '1px solid #E5E0DA',
                    }}
                    lineNumberStyle={{
                      color: '#999999',
                      minWidth: '2.5em',
                      paddingRight: '1em',
                      userSelect: 'none',
                    }}
                  />
                )
              }

              // Inline code
              return <code className={codeClassName} {...props}>{children}</code>
            },
            // Wrap pre to avoid double-nesting with SyntaxHighlighter
            pre({ children }) {
              return <>{children}</>
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </article>
    </div>
  )
}
