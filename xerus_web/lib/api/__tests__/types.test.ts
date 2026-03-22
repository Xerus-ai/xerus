import { describe, it, expect } from 'vitest';
import {
  isValidThinkingLevel,
  isValidAutonomyLevel,
  VALID_THINKING_LEVELS,
  VALID_AUTONOMY_LEVELS,
} from '../types';

describe('isValidThinkingLevel', () => {
  it('accepts all valid thinking levels', () => {
    for (const level of VALID_THINKING_LEVELS) {
      expect(isValidThinkingLevel(level)).toBe(true);
    }
  });

  it('rejects invalid string values', () => {
    expect(isValidThinkingLevel('extreme')).toBe(false);
    expect(isValidThinkingLevel('LOW')).toBe(false);
    expect(isValidThinkingLevel('Medium')).toBe(false);
    expect(isValidThinkingLevel('')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isValidThinkingLevel(null)).toBe(false);
    expect(isValidThinkingLevel(undefined)).toBe(false);
    expect(isValidThinkingLevel(0)).toBe(false);
    expect(isValidThinkingLevel(true)).toBe(false);
    expect(isValidThinkingLevel({})).toBe(false);
    expect(isValidThinkingLevel([])).toBe(false);
  });

  it('narrows the type correctly (type guard)', () => {
    const input: unknown = 'high';
    if (isValidThinkingLevel(input)) {
      // TypeScript should narrow this to ThinkingLevel
      const level: 'low' | 'medium' | 'high' = input;
      expect(level).toBe('high');
    }
  });
});

describe('isValidAutonomyLevel', () => {
  it('accepts all valid autonomy levels', () => {
    for (const level of VALID_AUTONOMY_LEVELS) {
      expect(isValidAutonomyLevel(level)).toBe(true);
    }
  });

  it('rejects invalid string values', () => {
    expect(isValidAutonomyLevel('full_auto')).toBe(false);
    expect(isValidAutonomyLevel('SUPERVISED')).toBe(false);
    expect(isValidAutonomyLevel('semiautonomous')).toBe(false);
    expect(isValidAutonomyLevel('semi-autonomous')).toBe(false);
    expect(isValidAutonomyLevel('')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isValidAutonomyLevel(null)).toBe(false);
    expect(isValidAutonomyLevel(undefined)).toBe(false);
    expect(isValidAutonomyLevel(1)).toBe(false);
    expect(isValidAutonomyLevel(false)).toBe(false);
  });

  it('narrows the type correctly (type guard)', () => {
    const input: unknown = 'autonomous';
    if (isValidAutonomyLevel(input)) {
      const level: 'supervised' | 'semi_autonomous' | 'autonomous' = input;
      expect(level).toBe('autonomous');
    }
  });
});

describe('VALID_THINKING_LEVELS constant', () => {
  it('contains exactly 3 levels', () => {
    expect(VALID_THINKING_LEVELS).toHaveLength(3);
  });

  it('contains low, medium, high', () => {
    expect(VALID_THINKING_LEVELS).toContain('low');
    expect(VALID_THINKING_LEVELS).toContain('medium');
    expect(VALID_THINKING_LEVELS).toContain('high');
  });
});

describe('VALID_AUTONOMY_LEVELS constant', () => {
  it('contains exactly 3 levels', () => {
    expect(VALID_AUTONOMY_LEVELS).toHaveLength(3);
  });

  it('contains supervised, semi_autonomous, autonomous', () => {
    expect(VALID_AUTONOMY_LEVELS).toContain('supervised');
    expect(VALID_AUTONOMY_LEVELS).toContain('semi_autonomous');
    expect(VALID_AUTONOMY_LEVELS).toContain('autonomous');
  });
});
