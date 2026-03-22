// Platform Tool Types Tests
import {
    ALL_PLATFORM_TOOL_NAMES,
    ALL_TOOL_NAMES,
    TOOL_CATEGORIES,
} from '../platform-tool.types';
import { PLATFORM_TOOLS } from '../../agents/xerus-master.types';

describe('Platform Tool Types', () => {
    describe('ALL_PLATFORM_TOOL_NAMES', () => {
        it('should contain all 32 platform tool names', () => {
            expect(ALL_PLATFORM_TOOL_NAMES).toHaveLength(32);
        });

        it('should match PLATFORM_TOOLS values', () => {
            const expected = Object.values(PLATFORM_TOOLS);
            expect(ALL_PLATFORM_TOOL_NAMES).toEqual(expected);
        });

        it('every name should start with platform.', () => {
            for (const name of ALL_PLATFORM_TOOL_NAMES) {
                expect(name.startsWith('platform.')).toBe(true);
            }
        });
    });

    describe('ALL_TOOL_NAMES', () => {
        it('should contain all 32 tool names (platform only)', () => {
            expect(ALL_TOOL_NAMES).toHaveLength(32);
        });

        it('should contain only platform tool names', () => {
            const platformCount = ALL_TOOL_NAMES.filter(n => n.startsWith('platform.')).length;
            const systemCount = ALL_TOOL_NAMES.filter(n => n.startsWith('system.')).length;
            expect(platformCount).toBe(32);
            expect(systemCount).toBe(0);
        });
    });

    describe('TOOL_CATEGORIES', () => {
        it('should have 12 categories', () => {
            expect(TOOL_CATEGORIES).toHaveLength(12);
        });

        it('should contain expected category names', () => {
            expect(TOOL_CATEGORIES).toContain('agent_management');
            expect(TOOL_CATEGORIES).toContain('knowledge_base');
            expect(TOOL_CATEGORIES).toContain('channels_tasks');
            expect(TOOL_CATEGORIES).toContain('skills');
            expect(TOOL_CATEGORIES).toContain('tools_integrations');
            expect(TOOL_CATEGORIES).toContain('status');
            expect(TOOL_CATEGORIES).toContain('heartbeat');
            expect(TOOL_CATEGORIES).toContain('delegation');
            expect(TOOL_CATEGORIES).toContain('session_control');
            expect(TOOL_CATEGORIES).toContain('memory');
            expect(TOOL_CATEGORIES).toContain('triggers');
            expect(TOOL_CATEGORIES).toContain('outputs');
        });
    });
});
