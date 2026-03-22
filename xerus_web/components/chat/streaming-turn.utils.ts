import type { TurnPart } from './streaming-turn.types'

function createFinalTextPart(text: string): TurnPart {
  return {
    id: `part-final-text-${Date.now()}`,
    type: 'text',
    text,
  }
}

function createFinalReasoningPart(text: string): TurnPart {
  return {
    id: `part-final-reasoning-${Date.now()}`,
    type: 'reasoning',
    text,
  }
}

export function extractTextFromParts(parts?: TurnPart[]): string {
  if (!parts || parts.length === 0) return ''

  return parts
    .filter((part): part is Extract<TurnPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

export function finalizeTurnParts(parts: TurnPart[], finalText?: string): TurnPart[] {
  const canonicalText = finalText ?? extractTextFromParts(parts)
  const reasoningText = parts
    .filter((part): part is Extract<TurnPart, { type: 'reasoning' }> => part.type === 'reasoning')
    .map((part) => part.text)
    .join('')
  const toolParts = parts.filter((part): part is Extract<TurnPart, { type: 'tool' }> => part.type === 'tool')
  const stableParts: TurnPart[] = []

  if (reasoningText) {
    stableParts.push(createFinalReasoningPart(reasoningText))
  }

  stableParts.push(...toolParts)

  if (canonicalText) {
    stableParts.push(createFinalTextPart(canonicalText))
  }

  return stableParts
}
