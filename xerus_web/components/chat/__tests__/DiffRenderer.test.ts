import { describe, it, expect } from 'vitest'

// Test the diff computation logic extracted for unit testing
function computeDiff(oldText: string, newText: string) {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const result: { type: 'added' | 'removed' | 'unchanged'; content: string }[] = []

  let oldIdx = 0
  let newIdx = 0

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (oldIdx >= oldLines.length) {
      result.push({ type: 'added', content: newLines[newIdx] })
      newIdx++
    } else if (newIdx >= newLines.length) {
      result.push({ type: 'removed', content: oldLines[oldIdx] })
      oldIdx++
    } else if (oldLines[oldIdx] === newLines[newIdx]) {
      result.push({ type: 'unchanged', content: oldLines[oldIdx] })
      oldIdx++
      newIdx++
    } else {
      const lookAheadNew = newLines.indexOf(oldLines[oldIdx], newIdx)
      const lookAheadOld = oldLines.indexOf(newLines[newIdx], oldIdx)

      if (lookAheadNew >= 0 && (lookAheadOld < 0 || lookAheadNew - newIdx <= lookAheadOld - oldIdx)) {
        while (newIdx < lookAheadNew) {
          result.push({ type: 'added', content: newLines[newIdx] })
          newIdx++
        }
      } else if (lookAheadOld >= 0) {
        while (oldIdx < lookAheadOld) {
          result.push({ type: 'removed', content: oldLines[oldIdx] })
          oldIdx++
        }
      } else {
        result.push({ type: 'removed', content: oldLines[oldIdx] })
        result.push({ type: 'added', content: newLines[newIdx] })
        oldIdx++
        newIdx++
      }
    }
  }

  return result
}

describe('computeDiff', () => {
  it('returns unchanged for identical content', () => {
    const lines = computeDiff('hello\nworld', 'hello\nworld')
    expect(lines).toEqual([
      { type: 'unchanged', content: 'hello' },
      { type: 'unchanged', content: 'world' },
    ])
  })

  it('detects added lines', () => {
    const lines = computeDiff('a\nc', 'a\nb\nc')
    const added = lines.filter(l => l.type === 'added')
    expect(added).toHaveLength(1)
    expect(added[0].content).toBe('b')
  })

  it('detects removed lines', () => {
    const lines = computeDiff('a\nb\nc', 'a\nc')
    const removed = lines.filter(l => l.type === 'removed')
    expect(removed).toHaveLength(1)
    expect(removed[0].content).toBe('b')
  })

  it('handles complete replacement', () => {
    const lines = computeDiff('old line', 'new line')
    expect(lines).toEqual([
      { type: 'removed', content: 'old line' },
      { type: 'added', content: 'new line' },
    ])
  })

  it('handles empty old content', () => {
    const lines = computeDiff('', 'new\ncontent')
    const added = lines.filter(l => l.type === 'added')
    expect(added.length).toBeGreaterThanOrEqual(1)
  })

  it('handles empty new content', () => {
    const lines = computeDiff('old\ncontent', '')
    const removed = lines.filter(l => l.type === 'removed')
    expect(removed.length).toBeGreaterThanOrEqual(1)
  })
})
