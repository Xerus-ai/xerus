// Session Control Tools Tests
// Tests error classes, singleton lifecycle, and service contract compliance

import {
    SessionControlService,
    getSessionControlService,
    resetSessionControlService,
    SessionNotFoundError,
    SessionNotPausedError,
    SessionAlreadyPausedError,
} from '../session-control.tools';
import type { SessionControlServicePort } from '../../platform-tool.types';

// -----------------------------------------------------------------------------
// Error Classes
// -----------------------------------------------------------------------------

describe('SessionNotFoundError', () => {
    it('should set name and message', () => {
        const error = new SessionNotFoundError('sess-abc');
        expect(error.name).toBe('SessionNotFoundError');
        expect(error.message).toBe('Execution session not found: sess-abc');
        expect(error).toBeInstanceOf(Error);
    });
});

describe('SessionNotPausedError', () => {
    it('should set name and message', () => {
        const error = new SessionNotPausedError('sess-xyz');
        expect(error.name).toBe('SessionNotPausedError');
        expect(error.message).toBe('Execution session is not paused: sess-xyz');
        expect(error).toBeInstanceOf(Error);
    });
});

describe('SessionAlreadyPausedError', () => {
    it('should set name and message', () => {
        const error = new SessionAlreadyPausedError('sess-123');
        expect(error.name).toBe('SessionAlreadyPausedError');
        expect(error.message).toBe('Execution session is already paused: sess-123');
        expect(error).toBeInstanceOf(Error);
    });
});

// -----------------------------------------------------------------------------
// Service Contract Compliance
// -----------------------------------------------------------------------------

describe('SessionControlService', () => {
    it('should implement SessionControlServicePort interface', () => {
        const service = new SessionControlService();
        const port: SessionControlServicePort = service;
        expect(typeof port.pauseExecution).toBe('function');
        expect(typeof port.resumeExecution).toBe('function');
        expect(typeof port.getSessionState).toBe('function');
    });
});

// -----------------------------------------------------------------------------
// Singleton Lifecycle
// -----------------------------------------------------------------------------

describe('getSessionControlService / resetSessionControlService', () => {
    afterEach(() => {
        resetSessionControlService();
    });

    it('should return same instance on repeated calls', () => {
        const a = getSessionControlService();
        const b = getSessionControlService();
        expect(a).toBe(b);
    });

    it('should return new instance after reset', () => {
        const a = getSessionControlService();
        resetSessionControlService();
        const b = getSessionControlService();
        expect(a).not.toBe(b);
    });

    it('should return SessionControlService instance', () => {
        const service = getSessionControlService();
        expect(service).toBeInstanceOf(SessionControlService);
    });
});
