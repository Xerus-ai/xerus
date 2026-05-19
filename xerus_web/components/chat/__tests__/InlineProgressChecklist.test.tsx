import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InlineProgressChecklist } from '../InlineProgressChecklist'
import type { ExecutionStep } from '../types'

function makeStep(overrides: Partial<ExecutionStep> = {}): ExecutionStep {
  return {
    id: 'subagent-1',
    name: 'Research Agent',
    status: 'active',
    ...overrides,
  }
}

describe('InlineProgressChecklist', () => {
  it('renders nothing when no subagent steps exist', () => {
    const steps: ExecutionStep[] = [
      { id: 'step-1', name: 'Regular step', status: 'active' },
    ]
    const { container } = render(<InlineProgressChecklist steps={steps} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing with empty steps array', () => {
    const { container } = render(<InlineProgressChecklist steps={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows progress text for subagent steps', () => {
    const steps: ExecutionStep[] = [
      makeStep({ id: 'subagent-1', name: 'Agent A', status: 'completed' }),
      makeStep({ id: 'subagent-2', name: 'Agent B', status: 'active' }),
      makeStep({ id: 'subagent-3', name: 'Agent C', status: 'active' }),
    ]
    render(<InlineProgressChecklist steps={steps} />)
    expect(screen.getByText('1 of 3 tasks done')).toBeInTheDocument()
  })

  it('renders each subagent step as a checklist item', () => {
    const steps: ExecutionStep[] = [
      makeStep({ id: 'subagent-1', name: 'Agent A', status: 'active' }),
      makeStep({ id: 'delegation-1', name: 'Agent B', status: 'completed' }),
      makeStep({ id: 'subagent-2', name: 'Agent C', status: 'failed' }),
    ]
    render(<InlineProgressChecklist steps={steps} />)
    expect(screen.getByText('Agent A')).toBeInTheDocument()
    expect(screen.getByText('Agent B')).toBeInTheDocument()
    expect(screen.getByText('Agent C')).toBeInTheDocument()
  })

  it('filters out non-subagent steps', () => {
    const steps: ExecutionStep[] = [
      makeStep({ id: 'subagent-1', name: 'Sub Agent', status: 'active' }),
      makeStep({ id: 'step-1', name: 'Regular Step', status: 'active' }),
    ]
    render(<InlineProgressChecklist steps={steps} />)
    expect(screen.getByText('Sub Agent')).toBeInTheDocument()
    expect(screen.queryByText('Regular Step')).not.toBeInTheDocument()
  })

  it('shows Stop All button when there are active tasks and onStopAll is provided', () => {
    const onStopAll = vi.fn()
    const steps: ExecutionStep[] = [
      makeStep({ id: 'subagent-1', name: 'Agent A', status: 'active' }),
    ]
    render(<InlineProgressChecklist steps={steps} onStopAll={onStopAll} />)
    const stopButton = screen.getByText('Stop All')
    expect(stopButton).toBeInTheDocument()
    fireEvent.click(stopButton)
    expect(onStopAll).toHaveBeenCalledOnce()
  })

  it('hides Stop All button when all tasks are done', () => {
    const onStopAll = vi.fn()
    const steps: ExecutionStep[] = [
      makeStep({ id: 'subagent-1', name: 'Agent A', status: 'completed' }),
    ]
    render(<InlineProgressChecklist steps={steps} onStopAll={onStopAll} />)
    expect(screen.queryByText('Stop All')).not.toBeInTheDocument()
  })

  it('counts failed tasks in done total', () => {
    const steps: ExecutionStep[] = [
      makeStep({ id: 'subagent-1', name: 'Agent A', status: 'completed' }),
      makeStep({ id: 'subagent-2', name: 'Agent B', status: 'failed' }),
      makeStep({ id: 'subagent-3', name: 'Agent C', status: 'active' }),
    ]
    render(<InlineProgressChecklist steps={steps} />)
    expect(screen.getByText('2 of 3 tasks done')).toBeInTheDocument()
  })
})
