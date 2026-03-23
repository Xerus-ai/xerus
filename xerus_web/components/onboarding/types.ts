export interface OnboardingMessage {
  id: string
  role: 'assistant' | 'user'
  content: string
  source: 'template' | 'stream'
  streaming?: boolean
  ui?: {
    type: 'quick-reply' | 'workspace-setup' | 'agent-select'
        | 'schedule-picker' | 'summary'
    props: Record<string, unknown>
    collapsed?: boolean
    collapsedText?: string
  }
}

export interface OnboardingTemplateMessage {
  role: 'assistant'
  content: string
  ui?: OnboardingMessage['ui']
}
