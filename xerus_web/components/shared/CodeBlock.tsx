'use client'

import React, { Suspense, lazy } from 'react'

const SyntaxHighlighter = lazy(() =>
  import('react-syntax-highlighter').then(mod => ({
    default: mod.Prism
  }))
)

const loadOneDark = () =>
  import('react-syntax-highlighter/dist/esm/styles/prism/one-dark').then(mod => mod.default)

interface CodeBlockProps {
  code: string
  language?: string
  showLineNumbers?: boolean
  /** Custom Prism theme object — when omitted, loads oneDark lazily */
  theme?: Record<string, React.CSSProperties>
  /** Maps to SyntaxHighlighter customStyle */
  customStyle?: React.CSSProperties
  /** Maps to SyntaxHighlighter className */
  className?: string
  /** Maps to SyntaxHighlighter PreTag */
  preTag?: string
  /** Maps to SyntaxHighlighter lineNumberStyle */
  lineNumberStyle?: React.CSSProperties
  /** Maps to SyntaxHighlighter startingLineNumber */
  startingLineNumber?: number
}

export function CodeBlock({
  code,
  language = 'text',
  showLineNumbers = false,
  theme: themeProp,
  customStyle,
  className,
  preTag,
  lineNumberStyle,
  startingLineNumber,
}: CodeBlockProps) {
  const [loadedOneDark, setLoadedOneDark] = React.useState<Record<string, React.CSSProperties> | null>(null)

  // Only load oneDark lazily when no custom theme is provided
  React.useEffect(() => {
    if (!themeProp) {
      loadOneDark().then(setLoadedOneDark)
    }
  }, [themeProp])

  const resolvedTheme = themeProp ?? loadedOneDark

  const highlighterProps: Record<string, unknown> = {
    language,
    showLineNumbers,
  }
  if (resolvedTheme) highlighterProps.style = resolvedTheme
  if (customStyle) highlighterProps.customStyle = customStyle
  if (className) highlighterProps.className = className
  if (preTag) highlighterProps.PreTag = preTag
  if (lineNumberStyle) highlighterProps.lineNumberStyle = lineNumberStyle
  if (startingLineNumber !== undefined) highlighterProps.startingLineNumber = startingLineNumber

  return (
    <Suspense fallback={
      <pre className="bg-[#1E1E1E] text-gray-300 p-4 rounded-xl text-sm font-mono overflow-x-auto">
        <code>{code}</code>
      </pre>
    }>
      {resolvedTheme ? (
        <SyntaxHighlighter {...highlighterProps}>
          {code}
        </SyntaxHighlighter>
      ) : (
        <pre className="bg-[#1E1E1E] text-gray-300 p-4 rounded-xl text-sm font-mono overflow-x-auto">
          <code>{code}</code>
        </pre>
      )}
    </Suspense>
  )
}
