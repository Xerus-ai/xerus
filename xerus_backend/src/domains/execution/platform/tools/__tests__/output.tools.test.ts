// Output Tools Tests
// Tests error classes, singleton lifecycle, and service contract compliance

import {
    OutputService,
    getOutputService,
    resetOutputService,
    WorkspaceNotFoundError,
    InvalidDateRangeError,
} from '../output.tools';
import type { OutputServicePort } from '../../platform-tool.types';

// -----------------------------------------------------------------------------
// Error Classes
// -----------------------------------------------------------------------------

describe('WorkspaceNotFoundError', () => {
    it('should set name and message', () => {
        const error = new WorkspaceNotFoundError('user-abc');
        expect(error.name).toBe('WorkspaceNotFoundError');
        expect(error.message).toBe('Workspace not found for user: user-abc');
        expect(error).toBeInstanceOf(Error);
    });
});

describe('InvalidDateRangeError', () => {
    it('should set name and message with date range', () => {
        const error = new InvalidDateRangeError('2025-02-01', '2025-01-01');
        expect(error.name).toBe('InvalidDateRangeError');
        expect(error.message).toBe('Invalid date range: 2025-02-01 to 2025-01-01');
        expect(error).toBeInstanceOf(Error);
    });
});

// -----------------------------------------------------------------------------
// Service Contract Compliance
// -----------------------------------------------------------------------------

describe('OutputService', () => {
    it('should implement OutputServicePort interface', () => {
        const service = new OutputService();
        const port: OutputServicePort = service;
        expect(typeof port.searchOutputs).toBe('function');
    });
});

// -----------------------------------------------------------------------------
// Singleton Lifecycle
// -----------------------------------------------------------------------------

describe('getOutputService / resetOutputService', () => {
    afterEach(() => {
        resetOutputService();
    });

    it('should return same instance on repeated calls', () => {
        const a = getOutputService();
        const b = getOutputService();
        expect(a).toBe(b);
    });

    it('should return new instance after reset', () => {
        const a = getOutputService();
        resetOutputService();
        const b = getOutputService();
        expect(a).not.toBe(b);
    });

    it('should return OutputService instance', () => {
        const service = getOutputService();
        expect(service).toBeInstanceOf(OutputService);
    });
});
