import { slugify } from '../../../shared/slugify';

describe('slugify', () => {
    it('converts name with spaces to hyphenated lowercase', () => {
        expect(slugify('DataDog Dan')).toBe('datadog-dan');
    });

    it('converts clone name with parentheses', () => {
        expect(slugify('DataDog Dan (Copy)')).toBe('datadog-dan-copy');
    });

    it('handles special characters', () => {
        expect(slugify('My Agent! @#$% v2.0')).toBe('my-agent-v2-0');
    });

    it('handles multiple consecutive spaces and dashes', () => {
        expect(slugify('hello   ---   world')).toBe('hello-world');
    });

    it('handles leading and trailing special characters', () => {
        expect(slugify('---hello---')).toBe('hello');
    });

    it('handles uppercase input', () => {
        expect(slugify('UPPERCASE NAME')).toBe('uppercase-name');
    });

    it('returns empty string for empty input', () => {
        expect(slugify('')).toBe('');
    });

    it('returns empty string for only special characters', () => {
        expect(slugify('!@#$%^&*()')).toBe('');
    });

    it('handles single word', () => {
        expect(slugify('agent')).toBe('agent');
    });

    it('handles numbers', () => {
        expect(slugify('Agent 42 Pro')).toBe('agent-42-pro');
    });

    it('returns empty string for non-ASCII characters only', () => {
        expect(slugify('😀😁🎉')).toBe('');
    });

    it('strips non-ASCII but keeps ASCII parts', () => {
        expect(slugify('Hello 世界 Agent')).toBe('hello-agent');
    });
});
