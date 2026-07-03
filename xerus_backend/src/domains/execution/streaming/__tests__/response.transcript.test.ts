// Response Contract Tests — Transcript Serialization and Sequence Tracker

import {
    serializeTranscriptPage,
    SequenceTracker,
} from '../response.contract';
import type { StreamEventType } from '../../types';

describe('serializeTranscriptPage', () => {
    it('should serialize transcript page with events', () => {
        const events = [
            {
                id: 1,
                execution_id: 'exec-t-1',
                event_type: 'meta' as StreamEventType,
                event_data: { model: 'claude-opus-4-6' },
                sequence_number: 1,
                created_at: '2025-02-14T10:00:00Z',
            },
            {
                id: 2,
                execution_id: 'exec-t-1',
                event_type: 'token' as StreamEventType,
                event_data: { text: 'Hello' },
                sequence_number: 2,
                created_at: '2025-02-14T10:00:01Z',
            },
        ];

        const result = serializeTranscriptPage({
            executionId: 'exec-t-1',
            events,
            total: 10,
            limit: 2,
            offset: 0,
        });

        expect(result.execution_id).toBe('exec-t-1');
        expect(result.events).toHaveLength(2);
        expect(result.events[0].event_type).toBe('meta');
        expect(result.events[1].event_type).toBe('token');
        expect(result.pagination.total).toBe(10);
        expect(result.pagination.limit).toBe(2);
        expect(result.pagination.offset).toBe(0);
        expect(result.pagination.has_more).toBe(true);
    });

    it('should set has_more to false when all events returned', () => {
        const result = serializeTranscriptPage({
            executionId: 'exec-t-2',
            events: [],
            total: 5,
            limit: 100,
            offset: 0,
        });

        expect(result.pagination.has_more).toBe(false);
    });

    it('should calculate has_more correctly with offset', () => {
        const result = serializeTranscriptPage({
            executionId: 'exec-t-3',
            events: [
                {
                    id: 3,
                    execution_id: 'exec-t-3',
                    event_type: 'done' as StreamEventType,
                    event_data: {},
                    sequence_number: 3,
                    created_at: '2025-02-14T10:00:02Z',
                },
            ],
            total: 3,
            limit: 1,
            offset: 2,
        });

        expect(result.pagination.has_more).toBe(false);
    });
});

describe('SequenceTracker', () => {
    it('should start at 0', () => {
        const tracker = new SequenceTracker();
        expect(tracker.current()).toBe(0);
    });

    it('should increment and return new value', () => {
        const tracker = new SequenceTracker();
        expect(tracker.next()).toBe(1);
        expect(tracker.next()).toBe(2);
        expect(tracker.next()).toBe(3);
    });

    it('should report current without incrementing', () => {
        const tracker = new SequenceTracker();
        tracker.next();
        tracker.next();
        expect(tracker.current()).toBe(2);
        expect(tracker.current()).toBe(2);
    });

    it('should reset to 0', () => {
        const tracker = new SequenceTracker();
        tracker.next();
        tracker.next();
        tracker.reset();
        expect(tracker.current()).toBe(0);
        expect(tracker.next()).toBe(1);
    });
});
