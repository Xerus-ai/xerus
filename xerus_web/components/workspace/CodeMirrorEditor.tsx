'use client'

import { useEffect, useRef, useCallback } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput, LanguageSupport } from '@codemirror/language'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { cn } from '@/lib/utils'

// Language imports - loaded lazily
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { python } from '@codemirror/lang-python'
import { xml } from '@codemirror/lang-xml'
import { yaml } from '@codemirror/lang-yaml'

// ---------- Theme ----------

const xerusTheme = EditorView.theme({
  '&': {
    fontSize: '13px',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    height: '100%',
  },
  '.cm-content': {
    padding: '16px 0',
    caretColor: '#FF6600',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#FF6600',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: '#FF660020',
  },
  '.cm-activeLine': {
    backgroundColor: '#FF660008',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#FF660008',
  },
  '.cm-gutters': {
    backgroundColor: '#FAFAF8',
    color: '#999',
    border: 'none',
    borderRight: '1px solid #E8E6E0',
    paddingRight: '4px',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px 0 16px',
    minWidth: '40px',
  },
  '.cm-foldGutter .cm-gutterElement': {
    padding: '0 4px',
  },
  '.cm-matchingBracket': {
    backgroundColor: '#FF660030',
    outline: 'none',
  },
  '.cm-searchMatch': {
    backgroundColor: '#FF660030',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: '#FF660050',
  },
  '.cm-selectionMatch': {
    backgroundColor: '#FF660015',
  },
  '.cm-tooltip': {
    border: '1px solid #E8E6E0',
    borderRadius: '8px',
    backgroundColor: '#fff',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  },
  '.cm-tooltip-autocomplete': {
    '& > ul > li[aria-selected]': {
      backgroundColor: '#FF660015',
    },
  },
})

// ---------- Language detection ----------

function getLanguageSupport(filename: string): LanguageSupport | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'js':
    case 'jsx':
      return javascript({ jsx: true })
    case 'ts':
    case 'tsx':
      return javascript({ jsx: true, typescript: true })
    case 'json':
      return json()
    case 'md':
    case 'txt':
      return markdown()
    case 'html':
    case 'htm':
      return html()
    case 'css':
      return css()
    case 'py':
      return python()
    case 'xml':
    case 'svg':
      return xml()
    case 'yaml':
    case 'yml':
      return yaml()
    default:
      return null
  }
}

// ---------- Component ----------

interface CodeMirrorEditorProps {
  value: string
  onChange: (value: string) => void
  readOnly?: boolean
  filename: string
  onSave?: () => void
  className?: string
}

export function CodeMirrorEditor({
  value,
  onChange,
  readOnly = false,
  filename,
  onSave,
  className,
}: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const readOnlyCompartment = useRef(new Compartment())
  const languageCompartment = useRef(new Compartment())

  // Stable callback refs to avoid recreating the editor
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return

    const lang = getLanguageSupport(filename)

    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          onSaveRef.current?.()
          return true
        },
      },
    ])

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString())
      }
    })

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        rectangularSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        foldGutter(),
        history(),
        highlightSelectionMatches(),
        autocompletion(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        xerusTheme,
        saveKeymap,
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
        languageCompartment.current.of(lang ? [lang] : []),
        updateListener,
        EditorView.lineWrapping,
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Only run on mount - value updates handled separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update readOnly when it changes
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(readOnly)),
    })
  }, [readOnly])

  // Update language when filename changes
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const lang = getLanguageSupport(filename)
    view.dispatch({
      effects: languageCompartment.current.reconfigure(lang ? [lang] : []),
    })
  }, [filename])

  // Sync external value changes (e.g., file load) without resetting cursor
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const currentDoc = view.state.doc.toString()
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      })
    }
  }, [value])

  return (
    <div
      ref={containerRef}
      className={cn(
        'h-full overflow-hidden [&_.cm-editor]:h-full [&_.cm-editor]:outline-none [&_.cm-scroller]:overflow-auto',
        readOnly && '[&_.cm-content]:cursor-default [&_.cm-activeLine]:bg-transparent',
        className,
      )}
    />
  )
}
