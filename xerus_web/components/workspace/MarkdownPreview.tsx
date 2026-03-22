'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '@/lib/utils'

interface MarkdownPreviewProps {
  content: string
  className?: string
}

// Warm code block theme matching Xerus design
const warmCodeTheme: Record<string, React.CSSProperties> = {
  ...oneDark,
  'pre[class*="language-"]': {
    ...((oneDark as Record<string, React.CSSProperties>)['pre[class*="language-"]'] || {}),
    background: '#F5F0EB',
    borderRadius: '12px',
    color: '#2D2D2D',
  },
  'code[class*="language-"]': {
    ...((oneDark as Record<string, React.CSSProperties>)['code[class*="language-"]'] || {}),
    background: '#F5F0EB',
    color: '#2D2D2D',
  },
  comment: { color: '#999999', fontStyle: 'italic' },
  string: { color: '#B5695A' },
  keyword: { color: '#CC6600' },
  number: { color: '#B5695A' },
  function: { color: '#6E6E6E' },
  operator: { color: '#6E6E6E' },
  punctuation: { color: '#999999' },
}

export function MarkdownPreview({ content, className }: MarkdownPreviewProps) {
  return (
    <div className={cn('px-12 py-10 overflow-y-auto bg-white', className)}>
      <article className={cn(
        'prose prose-base max-w-3xl mx-auto',
        // Headings
        'prose-headings:font-serif prose-headings:text-text prose-headings:font-normal',
        'prose-h1:text-4xl prose-h1:leading-tight prose-h2:text-2xl prose-h2:mt-10 prose-h3:text-xl',
        // Body
        'prose-p:text-text prose-p:leading-[1.8]',
        'prose-strong:text-text prose-strong:font-semibold',
        'prose-li:text-text prose-li:leading-[1.8]',
        // Links
        'prose-a:text-[#FF6600] prose-a:no-underline hover:prose-a:underline',
        // Inline code — warm bg, no backtick quotes
        'prose-code:bg-surface-hover prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-sm prose-code:font-mono prose-code:text-text',
        'prose-code:before:content-none prose-code:after:content-none',
        // Code blocks (pre) — handled by SyntaxHighlighter but fallback styles
        'prose-pre:bg-surface prose-pre:rounded-xl prose-pre:p-0 prose-pre:my-4 prose-pre:border prose-pre:border-surface-active',
        // Lists
        'prose-ul:list-disc prose-ol:list-decimal',
        // HR
        'prose-hr:border-surface-active prose-hr:my-8',
        // Blockquote
        'prose-blockquote:border-l-[#FF6600] prose-blockquote:bg-[#FF6600]/5 prose-blockquote:py-1 prose-blockquote:rounded-r-lg',
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
                  <SyntaxHighlighter
                    style={warmCodeTheme}
                    language={match ? match[1] : 'text'}
                    showLineNumbers
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
                  >
                    {codeString}
                  </SyntaxHighlighter>
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
