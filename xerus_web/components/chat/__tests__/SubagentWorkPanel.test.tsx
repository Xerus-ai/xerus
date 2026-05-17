import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SubagentWorkPanel } from '../SubagentWorkPanel'
import type { ExecutionStep } from '../types'

// Mock the MascotAvatar component since it may have complex dependencies
vi.mock('@/components/agents/MascotAvatar', () => ({
  MascotAvatar: ({ size }: { config: string; size: number }) => (
    <div data-testid="mascot-avatar" style={{ width: size, height: size }} />
  ),
}))

// Mock isMascotConfig
vi.mock('@/lib/mascot-config', () => ({
  isMascotConfig: (val: string | null | undefined) =>
    typeof val === 'string' && val.startsWith('mascot:'),
}))

function makeStep(overrides: Partial<ExecutionStep> = {}): ExecutionStep {
  return {
    id: 'subagent-1',
    name: 'Research Agent',
    status: 'active',
    ...overrides,
  }
}

describe('SubagentWorkPanel', () => {
  it('renders nothing when no subagent steps exist', () => {
    const steps: ExecutionStep[] = [
      { id: 'step-1', name: 'Regular step', status: 'active' },
      { id: 'tool-2', name: 'Tool step', status: 'completed' },
    ]
    const { container } = render(<SubagentWorkPanel steps={steps} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing with empty steps array', () => {
    const { container } = render(<SubagentWorkPanel steps={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders active count when subagent steps are running', () => {
    const steps: ExecutionStep[] = [
      makeStep({ id: 'subagent-1', name: 'Research Agent', status: 'active' }),
      makeStep({ id: 'subagent-2', name: 'Writer Agent', status: 'active' }),
      makeStep({ id: 'subagent-3', name: 'Reviewer Agent', status: 'completed' }),
    ]
    render(<SubagentWorkPanel steps={steps} />)
    expect(screen.getByText('2 agents working')).toBeInTheDocument()
    expect(screen.getByText('1 completed')).toBeInTheDocument()
  })

  it('renders singular agent text for single active agent', () => {
    const steps: ExecutionStep[] = [
      makeStep({ id: 'subagent-1', name: 'Research Agent', status: 'active' }),
    ]
    render(<SubagentWorkPanel steps={steps} />)
    expect(screen.getByText('1 agent working')).toBeInTheDocument()
  })

  it('shows completed state when all subagents done', () => {
    const steps: ExecutionStep[] = [
      makeStep({ id: 'subagent-1', name: 'Research Agent', status: 'completed', startTime: 1000, endTime: 3500 }),
      makeStep({ id: 'subagent-2', name: 'Writer Agent', status: 'failed' }),
    ]
    render(<SubagentWorkPanel steps={steps} />)
    expect(screen.getByText('Agents done')).toBeInTheDocument()
    // Should NOT show "completed" count text when no active agents
    expect(screen.queryByText(/completed/)).not.toBeInTheDocument()
  })

  it('filters only subagent-prefixed and delegation-prefixed step IDs', () => {
    const steps: ExecutionStep[] = [
      makeStep({ id: 'subagent-1', name: 'Sub Agent', status: 'active' }),
      makeStep({ id: 'delegation-1', name: 'Delegated Agent', status: 'active' }),
      makeStep({ id: 'regular-1', name: 'Regular Step', status: 'active' }),
      makeStep({ id: 'tool-1', name: 'Tool Step', status: 'active' }),
    ]
    render(<SubagentWorkPanel steps={steps} />)
    // Only subagent-1 and delegation-1 should be counted
    expect(screen.getByText('2 agents working')).toBeInTheDocument()
    // Regular and tool steps should not appear in the panel
    expect(screen.queryByText('Regular Step')).not.toBeInTheDocument()
    expect(screen.queryByText('Tool Step')).not.toBeInTheDocument()
    // But filtered steps should appear
    expect(screen.getByText('Sub Agent')).toBeInTheDocument()
    expect(screen.getByText('Delegated Agent')).toBeInTheDocument()
  })

  it('shows duration for completed subagent steps', () => {
    const steps: ExecutionStep[] = [
      makeStep({
        id: 'subagent-1',
        name: 'Fast Agent',
        status: 'completed',
        startTime: 1000,
        endTime: 3500,
      }),
    ]
    render(<SubagentWorkPanel steps={steps} />)
    expect(screen.getByText('2.5s')).toBeInTheDocument()
  })

  it('shows "done" for completed steps without timing', () => {
    const steps: ExecutionStep[] = [
      makeStep({ id: 'subagent-1', name: 'Agent', status: 'completed' }),
    ]
    render(<SubagentWorkPanel steps={steps} />)
    expect(screen.getByText('done')).toBeInTheDocument()
  })

  it('toggles expanded/collapsed state on header click', () => {
    const steps: ExecutionStep[] = [
      makeStep({ id: 'subagent-1', name: 'Visible Agent', status: 'active' }),
    ]
    render(<SubagentWorkPanel steps={steps} />)
    // Initially expanded (component default)
    expect(screen.getByText('Visible Agent')).toBeInTheDocument()

    // Click to collapse
    const button = screen.getByRole('button')
    fireEvent.click(button)
    expect(screen.queryByText('Visible Agent')).not.toBeInTheDocument()

    // Click to expand again
    fireEvent.click(button)
    expect(screen.getByText('Visible Agent')).toBeInTheDocument()
  })
})
