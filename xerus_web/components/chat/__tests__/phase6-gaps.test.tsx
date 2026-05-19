import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { resolveToolIcon } from '../tool-icon.utils'
import { DiffRenderer } from '../DiffRenderer'
import { GuidanceInterventionCard } from '../GuidanceInterventionCard'
import { SubagentWorkPanel } from '../SubagentWorkPanel'
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

describe('tool-icon.utils: sendmessage mapping', () => {
  it('maps sendmessage to agent icon', () => {
    expect(resolveToolIcon('sendmessage')).toBe('agent')
    expect(resolveToolIcon('SendMessage')).toBe('agent')
  })

  it('maps askuserquestion to question icon', () => {
    expect(resolveToolIcon('AskUserQuestion')).toBe('question')
  })

  it('maps Agent to agent icon', () => {
    expect(resolveToolIcon('Agent')).toBe('agent')
  })
})

describe('DiffRenderer edge cases', () => {
  it('renders empty diff for identical content', () => {
    render(<DiffRenderer oldContent={'same'} newContent={'same'} />)
    expect(screen.getByText('+0')).toBeInTheDocument()
    expect(screen.getByText('-0')).toBeInTheDocument()
  })

  it('handles empty old content (all added)', () => {
    render(<DiffRenderer oldContent={''} newContent={'new line'} />)
    expect(screen.getByText('+1')).toBeInTheDocument()
  })

  it('handles empty new content (all removed)', () => {
    render(<DiffRenderer oldContent={'old line'} newContent={''} />)
    expect(screen.getByText('-1')).toBeInTheDocument()
  })

  it('handles multiline diff correctly', () => {
    const old = 'line1\nline2\nline3'
    const newer = 'line1\nchanged\nline3\nline4'
    render(<DiffRenderer oldContent={old} newContent={newer} />)
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.getByText('-1')).toBeInTheDocument()
  })
})

describe('GuidanceInterventionCard: custom input flow', () => {
  it('form mode: typing custom text clears selected option', () => {
    const onRespond = vi.fn()
    render(
      <GuidanceInterventionCard
        question="Pick one"
        timeout_seconds={120}
        scenario="test"
        tool_name="test"
        agent_slug="test"
        ui_hint="form"
        options={['A', 'B']}
        onRespond={onRespond}
      />
    )
    fireEvent.click(screen.getByText('A'))
    expect(screen.getByText('Submit')).toBeInTheDocument()

    const input = screen.getByPlaceholderText('Or type your own answer...')
    fireEvent.change(input, { target: { value: 'custom' } })
    expect(screen.queryByText('Submit')).not.toBeInTheDocument()
  })

  it('form mode: enter key submits custom text', () => {
    const onRespond = vi.fn()
    render(
      <GuidanceInterventionCard
        question="Pick one"
        timeout_seconds={120}
        scenario="test"
        tool_name="test"
        agent_slug="test"
        ui_hint="form"
        onRespond={onRespond}
      />
    )
    const input = screen.getByPlaceholderText('Or type your own answer...')
    fireEvent.change(input, { target: { value: 'my answer' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRespond).toHaveBeenCalledWith(true, 'my answer')
  })

  it('deny button always available in form mode', () => {
    render(
      <GuidanceInterventionCard
        question="Pick one"
        timeout_seconds={120}
        scenario="test"
        tool_name="test"
        agent_slug="test"
        ui_hint="form"
        onRespond={vi.fn()}
      />
    )
    expect(screen.getByText('Deny')).toBeInTheDocument()
  })
})

describe('SubagentWorkPanel: expand/collapse all children', () => {
  it('expand all button not shown when no children exist', () => {
    const steps: ExecutionStep[] = [
      { id: 'subagent-1', name: 'Agent A', status: 'active' },
    ]
    render(<SubagentWorkPanel steps={steps} />)
    expect(screen.queryByLabelText('Expand all')).not.toBeInTheDocument()
  })

  it('shows progress percentage correctly at 0%', () => {
    const steps: ExecutionStep[] = [
      { id: 'subagent-1', name: 'Agent A', status: 'active' },
      { id: 'subagent-2', name: 'Agent B', status: 'active' },
    ]
    const { container } = render(<SubagentWorkPanel steps={steps} />)
    const bar = container.querySelector('[style*="width: 0%"]')
    expect(bar).toBeTruthy()
  })

  it('shows progress percentage correctly at 100%', () => {
    const steps: ExecutionStep[] = [
      { id: 'subagent-1', name: 'Agent A', status: 'completed' },
      { id: 'subagent-2', name: 'Agent B', status: 'completed' },
    ]
    render(<SubagentWorkPanel steps={steps} />)
    expect(screen.getByText('Agents done')).toBeInTheDocument()
  })
})
