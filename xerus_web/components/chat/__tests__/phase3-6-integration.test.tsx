import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InlineProgressChecklist } from '../InlineProgressChecklist'
import { SubagentWorkPanel } from '../SubagentWorkPanel'
import { GuidanceInterventionCard } from '../GuidanceInterventionCard'
import { AgentMessageCard } from '../AgentMessageCard'
import { DiffRenderer } from '../DiffRenderer'
import { PendingMessagesQueue } from '../PendingMessagesQueue'
import type { ExecutionStep } from '../types'

vi.mock('@/components/agents/MascotAvatar', () => ({
  MascotAvatar: ({ size }: { config: string; size: number }) => (
    <div data-testid="mascot-avatar" style={{ width: size, height: size }} />
  ),
}))
vi.mock('@/lib/mascot-config', () => ({
  isMascotConfig: (val: string | null | undefined) =>
    typeof val === 'string' && val.startsWith('mascot:'),
}))

function makeSubagentStep(overrides: Partial<ExecutionStep> = {}): ExecutionStep {
  return { id: 'subagent-1', name: 'Research Agent', status: 'active', ...overrides }
}

describe('Phase 3: Subagent Work Panel + Inline Progress', () => {
  it('SubagentWorkPanel shows progress bar when multiple agents active', () => {
    const steps: ExecutionStep[] = [
      makeSubagentStep({ id: 'subagent-1', name: 'Agent A', status: 'completed' }),
      makeSubagentStep({ id: 'subagent-2', name: 'Agent B', status: 'active' }),
      makeSubagentStep({ id: 'subagent-3', name: 'Agent C', status: 'active' }),
    ]
    const { container } = render(<SubagentWorkPanel steps={steps} />)
    const progressBar = container.querySelector('[style*="width: 33%"]')
    expect(progressBar).toBeTruthy()
  })

  it('SubagentWorkPanel panel variant has full height', () => {
    const steps: ExecutionStep[] = [
      makeSubagentStep({ id: 'subagent-1', name: 'Agent A', status: 'active' }),
    ]
    const { container } = render(<SubagentWorkPanel steps={steps} variant="panel" />)
    expect(container.querySelector('.h-full')).toBeTruthy()
  })

  it('SubagentWorkPanel copy summary button exists', () => {
    const steps: ExecutionStep[] = [
      makeSubagentStep({ id: 'subagent-1', name: 'Agent A', status: 'active' }),
    ]
    render(<SubagentWorkPanel steps={steps} />)
    expect(screen.getByLabelText('Copy summary')).toBeInTheDocument()
  })

  it('SubagentWorkPanel close button calls onClose', () => {
    const onClose = vi.fn()
    const steps: ExecutionStep[] = [
      makeSubagentStep({ id: 'subagent-1', name: 'Agent A', status: 'active' }),
    ]
    render(<SubagentWorkPanel steps={steps} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('InlineProgressChecklist shows correct progress', () => {
    const steps: ExecutionStep[] = [
      makeSubagentStep({ id: 'subagent-1', status: 'completed' }),
      makeSubagentStep({ id: 'subagent-2', status: 'active' }),
    ]
    render(<InlineProgressChecklist steps={steps} />)
    expect(screen.getByText('1 of 2 tasks done')).toBeInTheDocument()
  })
})

describe('Phase 4: HITL & AskUserQuestion', () => {
  const baseGuidanceProps = {
    question: 'Which approach?',
    timeout_seconds: 120,
    scenario: 'tool_use',
    tool_name: 'AskUserQuestion',
    agent_slug: 'test-agent',
    onRespond: vi.fn(),
  }

  it('GuidanceInterventionCard renders options as clickable buttons', () => {
    const onRespond = vi.fn()
    render(
      <GuidanceInterventionCard
        {...baseGuidanceProps}
        options={['Option A', 'Option B']}
        onRespond={onRespond}
      />
    )
    expect(screen.getByText('Option A')).toBeInTheDocument()
    expect(screen.getByText('Option B')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Option A'))
    expect(onRespond).toHaveBeenCalledWith(true, 'Option A')
  })

  it('GuidanceInterventionCard form mode shows selected state + Submit', () => {
    const onRespond = vi.fn()
    render(
      <GuidanceInterventionCard
        {...baseGuidanceProps}
        ui_hint="form"
        options={['Choice 1', 'Choice 2']}
        onRespond={onRespond}
      />
    )
    fireEvent.click(screen.getByText('Choice 1'))
    expect(screen.getByText('Submit')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Submit'))
    expect(onRespond).toHaveBeenCalledWith(true, 'Choice 1')
  })

  it('GuidanceInterventionCard form mode shows Discuss button when onSendMessage provided', () => {
    const onSendMessage = vi.fn()
    render(
      <GuidanceInterventionCard
        {...baseGuidanceProps}
        ui_hint="form"
        onSendMessage={onSendMessage}
      />
    )
    const discussBtn = screen.getByText('Discuss')
    expect(discussBtn).toBeInTheDocument()
    fireEvent.click(discussBtn)
    expect(onSendMessage).toHaveBeenCalledWith('Which approach?')
  })

  it('GuidanceInterventionCard timer shows warning colors', () => {
    render(
      <GuidanceInterventionCard
        {...baseGuidanceProps}
        timeout_seconds={25}
      />
    )
    const timerEl = screen.getByText('25s')
    expect(timerEl.closest('span')?.className).toContain('amber')
  })

  it('GuidanceInterventionCard timer shows urgent colors under 10s', () => {
    render(
      <GuidanceInterventionCard
        {...baseGuidanceProps}
        timeout_seconds={8}
      />
    )
    const timerEl = screen.getByText('8s')
    expect(timerEl.closest('span')?.className).toContain('rose')
  })

  it('AgentMessageCard renders from/to/content', () => {
    render(
      <AgentMessageCard
        fromAgent="ceo-agent"
        toChannel="sales"
        content="Review the pipeline"
      />
    )
    expect(screen.getByText('ceo-agent')).toBeInTheDocument()
    expect(screen.getByText('sales')).toBeInTheDocument()
    expect(screen.getByText('Review the pipeline')).toBeInTheDocument()
  })
})

describe('Phase 5: SendMessage SSE (frontend handling)', () => {
  it('AgentMessageCard renders without crashing for empty content', () => {
    const { container } = render(
      <AgentMessageCard fromAgent="agent-a" toChannel="general" content="" />
    )
    expect(container.querySelector('span')).toBeTruthy()
  })
})

describe('Phase 6: Polish & Integration', () => {
  it('DiffRenderer shows added/removed counts', () => {
    render(<DiffRenderer oldContent={'line1\nline2'} newContent={'line1\nline3\nline4'} />)
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.getByText('-1')).toBeInTheDocument()
  })

  it('DiffRenderer renders diff markers for changed content', () => {
    const { container } = render(<DiffRenderer oldContent={'old'} newContent={'new'} />)
    const addedMarker = container.querySelector('[class*="text-emerald"]')
    expect(addedMarker).toBeTruthy()
  })

  it('PendingMessagesQueue renders nothing for empty array', () => {
    const { container } = render(<PendingMessagesQueue messages={[]} onCancel={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })

  it('PendingMessagesQueue renders messages with cancel buttons', () => {
    const onCancel = vi.fn()
    render(<PendingMessagesQueue messages={['Hello', 'World']} onCancel={onCancel} />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('World')).toBeInTheDocument()
    expect(screen.getByText('2 queued')).toBeInTheDocument()
    const cancelBtns = screen.getAllByLabelText('Cancel queued message')
    expect(cancelBtns).toHaveLength(2)
    fireEvent.click(cancelBtns[0])
    expect(onCancel).toHaveBeenCalledWith(0)
  })

  it('SubagentWorkPanel collapse uses CSS transition (not conditional render)', () => {
    const steps: ExecutionStep[] = [
      makeSubagentStep({ id: 'subagent-1', name: 'Agent X', status: 'active' }),
    ]
    const { container } = render(<SubagentWorkPanel steps={steps} />)
    const stepList = container.querySelector('[class*="transition-all"]')
    expect(stepList).toBeTruthy()
  })

  it('GuidanceInterventionCard responsive layout uses sm breakpoint', () => {
    render(
      <GuidanceInterventionCard
        question="Test?"
        timeout_seconds={60}
        scenario="test"
        tool_name="test"
        agent_slug="test"
        onRespond={vi.fn()}
      />
    )
    const wrapper = screen.getByText('Test?').closest('[class*="sm:flex-row"]')
    expect(wrapper).toBeTruthy()
  })
})
