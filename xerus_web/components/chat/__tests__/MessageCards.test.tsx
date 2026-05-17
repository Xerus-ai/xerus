import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TodoProgress, PlanCard, ArtifactCard } from '../MessageCards'
import type { TodoItem, WorkspaceArtifact } from '../chat-message.types'

// Mock MarkdownContent to avoid complex markdown rendering deps
vi.mock('../MarkdownContent', () => ({
  MarkdownContent: ({ content }: { content: string }) => (
    <div data-testid="markdown-content">{content}</div>
  ),
}))

describe('TodoProgress', () => {
  it('renders done/total count', () => {
    render(<TodoProgress done={3} total={5} />)
    expect(screen.getByText('3/5 todos done')).toBeInTheDocument()
  })

  it('shows complete styling when all done', () => {
    render(<TodoProgress done={5} total={5} />)
    expect(screen.getByText('5/5 todos done')).toBeInTheDocument()
  })

  it('does not expand when no items provided', () => {
    render(<TodoProgress done={2} total={4} />)
    const button = screen.getByRole('button')
    fireEvent.click(button)
    // No items should appear since items prop was not passed
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('expands to show items when clicked', () => {
    const items: TodoItem[] = [
      { id: '1', label: 'Setup database', done: true },
      { id: '2', label: 'Write tests', done: false },
      { id: '3', label: 'Deploy', done: false },
    ]
    render(<TodoProgress done={1} total={3} items={items} />)

    // Items should not be visible before expanding
    expect(screen.queryByText('Setup database')).not.toBeInTheDocument()

    // Click to expand
    fireEvent.click(screen.getByRole('button'))

    // Items should now be visible
    expect(screen.getByText('Setup database')).toBeInTheDocument()
    expect(screen.getByText('Write tests')).toBeInTheDocument()
    expect(screen.getByText('Deploy')).toBeInTheDocument()
  })

  it('collapses items on second click', () => {
    const items: TodoItem[] = [
      { id: '1', label: 'Task A', done: false },
    ]
    render(<TodoProgress done={0} total={1} items={items} />)

    const button = screen.getByRole('button')
    fireEvent.click(button)
    expect(screen.getByText('Task A')).toBeInTheDocument()

    fireEvent.click(button)
    expect(screen.queryByText('Task A')).not.toBeInTheDocument()
  })

  it('sets correct aria-expanded attribute', () => {
    const items: TodoItem[] = [{ id: '1', label: 'Task', done: false }]
    render(<TodoProgress done={0} total={1} items={items} />)

    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('PlanCard', () => {
  it('renders title', () => {
    render(<PlanCard title="Migration Plan" content="Step 1: backup" />)
    expect(screen.getByText('Migration Plan')).toBeInTheDocument()
  })

  it('renders content when expanded (default)', () => {
    render(<PlanCard title="Plan" content="Some plan content" />)
    expect(screen.getByTestId('markdown-content')).toHaveTextContent('Some plan content')
  })

  it('collapses content on header click', () => {
    render(<PlanCard title="Plan" content="Hidden content" />)
    // Initially expanded, content visible
    expect(screen.getByTestId('markdown-content')).toBeInTheDocument()

    // Click header area to collapse (the main button)
    const buttons = screen.getAllByRole('button')
    // The main toggle button is the one wrapping the header
    const toggleButton = buttons[0]
    fireEvent.click(toggleButton)

    expect(screen.queryByTestId('markdown-content')).not.toBeInTheDocument()
  })

  it('copy button copies content to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    render(<PlanCard title="Plan" content="Copy me" />)

    const copyButton = screen.getByLabelText('Copy plan')
    fireEvent.click(copyButton)

    expect(writeText).toHaveBeenCalledWith('Copy me')
  })

  it('calls onOpenInWorkspace with correct payload', () => {
    const handler = vi.fn()
    render(<PlanCard title="My Plan" content="Plan body" onOpenInWorkspace={handler} />)

    const openButton = screen.getByLabelText('Open in workspace')
    fireEvent.click(openButton)

    expect(handler).toHaveBeenCalledWith({
      type: 'plan',
      title: 'My Plan',
      content: 'Plan body',
    })
  })

  it('does not render open-in-workspace button without handler', () => {
    render(<PlanCard title="Plan" content="body" />)
    expect(screen.queryByLabelText('Open in workspace')).not.toBeInTheDocument()
  })
})

describe('ArtifactCard', () => {
  const baseArtifact: WorkspaceArtifact = {
    id: 'art-1',
    filename: 'index.ts',
    path: '/src/index.ts',
    lineCount: 42,
    description: 'Entry point',
  }

  it('renders filename and line count', () => {
    render(<ArtifactCard artifact={baseArtifact} />)
    expect(screen.getByText('index.ts')).toBeInTheDocument()
    expect(screen.getByText(/42 lines/)).toBeInTheDocument()
  })

  it('renders description', () => {
    render(<ArtifactCard artifact={baseArtifact} />)
    expect(screen.getByText(/Entry point/)).toBeInTheDocument()
  })

  it('does not show preview toggle when no preview data', () => {
    render(<ArtifactCard artifact={baseArtifact} />)
    expect(screen.queryByLabelText('Show preview')).not.toBeInTheDocument()
  })

  it('shows preview toggle when preview data exists', () => {
    const artifactWithPreview: WorkspaceArtifact = {
      ...baseArtifact,
      preview: 'const x = 1;',
    }
    render(<ArtifactCard artifact={artifactWithPreview} />)
    expect(screen.getByLabelText('Show preview')).toBeInTheDocument()
  })

  it('toggles preview visibility on button click', () => {
    const artifactWithPreview: WorkspaceArtifact = {
      ...baseArtifact,
      preview: 'export default function main() {}',
    }
    render(<ArtifactCard artifact={artifactWithPreview} />)

    // Preview not visible initially
    expect(screen.queryByText('export default function main() {}')).not.toBeInTheDocument()

    // Click to show preview
    fireEvent.click(screen.getByLabelText('Show preview'))
    expect(screen.getByText('export default function main() {}')).toBeInTheDocument()

    // Click to hide preview
    fireEvent.click(screen.getByLabelText('Hide preview'))
    expect(screen.queryByText('export default function main() {}')).not.toBeInTheDocument()
  })

  it('calls onOpenInWorkspace with artifact payload', () => {
    const handler = vi.fn()
    render(<ArtifactCard artifact={baseArtifact} onOpenInWorkspace={handler} />)

    const openButton = screen.getByLabelText('Open in workspace')
    fireEvent.click(openButton)

    expect(handler).toHaveBeenCalledWith({
      type: 'artifact',
      artifact: baseArtifact,
    })
  })

  it('does not render open-in-workspace button without handler', () => {
    render(<ArtifactCard artifact={baseArtifact} />)
    expect(screen.queryByLabelText('Open in workspace')).not.toBeInTheDocument()
  })
})
