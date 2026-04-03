// Memory Tools Tests
// Tests error classes, singleton lifecycle, and service contract compliance

import {
    MemoryService,
    getMemoryService,
    resetMemoryService,
    WorkspaceNotFoundError,
    InvalidScopeError,
    ScopeAccessDeniedError,
} from '../memory.tools';
import type { MemoryServicePort } from '../../platform-tool.types';

// -----------------------------------------------------------------------------
// Error Classes
// -----------------------------------------------------------------------------

describe('WorkspaceNotFoundError', () => {
    it('should set name and message', () => {
        const error = new WorkspaceNotFoundError('user-xyz');
        expect(error.name).toBe('WorkspaceNotFoundError');
        expect(error.message).toBe('Workspace not found for user: user-xyz');
        expect(error).toBeInstanceOf(Error);
    });
});

describe('InvalidScopeError', () => {
    it('should set name and message without scopeId', () => {
        const error = new InvalidScopeError('invalid');
        expect(error.name).toBe('InvalidScopeError');
        expect(error.message).toBe('Invalid scope: invalid');
        expect(error).toBeInstanceOf(Error);
    });

    it('should set name and message with scopeId', () => {
        const error = new InvalidScopeError('project', 'proj-42');
        expect(error.name).toBe('InvalidScopeError');
        expect(error.message).toBe('Invalid scope: project with id proj-42');
    });
});

describe('ScopeAccessDeniedError', () => {
    it('should set name and message', () => {
        const error = new ScopeAccessDeniedError('channel', 'ch-99');
        expect(error.name).toBe('ScopeAccessDeniedError');
        expect(error.message).toBe('Access denied to channel with id ch-99');
        expect(error).toBeInstanceOf(Error);
    });
});

// -----------------------------------------------------------------------------
// Service Contract Compliance
// -----------------------------------------------------------------------------

describe('MemoryService', () => {
    it('should implement MemoryServicePort interface', () => {
        const service = new MemoryService();
        const port: MemoryServicePort = service;
        expect(typeof port.queryMemory).toBe('function');
        expect(typeof port.writeMemory).toBe('function');
        expect(typeof port.analyzeMemoryPatterns).toBe('function');
    });
});

// -----------------------------------------------------------------------------
// Singleton Lifecycle
// -----------------------------------------------------------------------------

describe('getMemoryService / resetMemoryService', () => {
    afterEach(() => {
        resetMemoryService();
    });

    it('should return same instance on repeated calls', () => {
        const a = getMemoryService();
        const b = getMemoryService();
        expect(a).toBe(b);
    });

    it('should return new instance after reset', () => {
        const a = getMemoryService();
        resetMemoryService();
        const b = getMemoryService();
        expect(a).not.toBe(b);
    });

    it('should return MemoryService instance', () => {
        const service = getMemoryService();
        expect(service).toBeInstanceOf(MemoryService);
    });
});
