'use client'

import { cn } from '@/lib/utils'
import { CodeBlock } from '@/components/shared/CodeBlock'
import { getExtension } from './file-utils'

// Map file extensions to Prism language identifiers
function extensionToLanguage(ext: string): string {
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    go: 'go',
    java: 'java',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    html: 'html',
    xml: 'xml',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    toml: 'toml',
    txt: 'text',
    csv: 'text',
    cfg: 'ini',
    ini: 'ini',
    env: 'bash',
  }
  return map[ext.toLowerCase()] || 'text'
}

// Warm syntax theme matching Xerus design
const warmSyntaxTheme: Record<string, React.CSSProperties> = {
  'pre[class*="language-"]': {
    background: '#ffffff',
    color: '#2D2D2D',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    fontSize: '15px',
    lineHeight: '1.6',
  },
  'code[class*="language-"]': {
    background: '#ffffff',
    color: '#2D2D2D',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  },
  comment: { color: '#999999', fontStyle: 'italic' },
  prolog: { color: '#999999' },
  doctype: { color: '#999999' },
  cdata: { color: '#999999' },
  punctuation: { color: '#6E6E6E' },
  property: { color: '#CC6600' },
  tag: { color: '#CC6600' },
  boolean: { color: '#CC6600' },
  number: { color: '#B5695A' },
  constant: { color: '#B5695A' },
  symbol: { color: '#B5695A' },
  selector: { color: '#5A8C5A' },
  'attr-name': { color: '#CC6600' },
  string: { color: '#5A8C5A' },
  char: { color: '#5A8C5A' },
  builtin: { color: '#CC6600' },
  inserted: { color: '#5A8C5A' },
  operator: { color: '#6E6E6E' },
  entity: { color: '#CC6600' },
  url: { color: '#5A8C5A' },
  '.language-css .token.string': { color: '#5A8C5A' },
  '.style .token.string': { color: '#5A8C5A' },
  atrule: { color: '#CC6600' },
  'attr-value': { color: '#5A8C5A' },
  keyword: { color: '#CC6600' },
  function: { color: '#2D2D2D', fontWeight: '600' },
  'class-name': { color: '#2D2D2D', fontWeight: '600' },
  regex: { color: '#B5695A' },
  important: { color: '#CC6600', fontWeight: 'bold' },
  variable: { color: '#2D2D2D' },
  deleted: { color: '#B5695A' },
}

interface SyntaxViewerProps {
  content: string
  filename: string
  className?: string
}

export function SyntaxViewer({ content, filename, className }: SyntaxViewerProps) {
  const ext = getExtension(filename)
  const language = extensionToLanguage(ext)

  return (
    <div className={cn('h-full overflow-auto bg-card', className)}>
      <CodeBlock
        code={content}
        language={language}
        showLineNumbers
        theme={warmSyntaxTheme}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: '15px',
          lineHeight: '1.6',
          padding: '1.5rem 1rem',
          background: '#ffffff',
          minHeight: '100%',
        }}
        lineNumberStyle={{
          color: '#999999',
          minWidth: '3em',
          paddingRight: '1.5em',
          userSelect: 'none',
        }}
      />
    </div>
  )
}
