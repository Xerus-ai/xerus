// Channel CLAUDE.md Template Tests
// Tests for channel-specific CLAUDE.md generation
// Reference: xerus-y5v.4.173

import { generateChannelClaudeMd } from '../channel-claude-md.template';
import type { ChannelClaudeMdParams } from '../channel-claude-md.template';

describe('generateChannelClaudeMd', () => {
    const DEFAULT_PARAMS: ChannelClaudeMdParams = {
        projectName: 'marketing',
        projectDescription: 'Marketing department',
        channelName: 'marketing-seo',
        channelPurpose: 'SEO optimization and content strategy',
        agentRole: 'SEO Specialist',
    };

    it('should include channel name as heading', () => {
        const result = generateChannelClaudeMd(DEFAULT_PARAMS);
        expect(result).toContain('# #marketing-seo');
    });

    it('should include channel purpose', () => {
        const result = generateChannelClaudeMd(DEFAULT_PARAMS);
        expect(result).toContain('SEO optimization and content strategy');
    });

    it('should include project name section', () => {
        const result = generateChannelClaudeMd(DEFAULT_PARAMS);
        expect(result).toContain('## Project: marketing');
    });

    it('should include project description', () => {
        const result = generateChannelClaudeMd(DEFAULT_PARAMS);
        expect(result).toContain('Marketing department');
    });

    it('should include agent role', () => {
        const result = generateChannelClaudeMd(DEFAULT_PARAMS);
        expect(result).toContain('## Your Role');
        expect(result).toContain('SEO Specialist');
    });

    it('should include channel directory structure', () => {
        const result = generateChannelClaudeMd(DEFAULT_PARAMS);
        expect(result).toContain('output/deliverables/');
        expect(result).toContain('scratch/');
    });

    it('should include shared resources when provided', () => {
        const params: ChannelClaudeMdParams = {
            ...DEFAULT_PARAMS,
            sharedResources: [
                'drive/brand-guide.md',
                'drive/seo-playbook.md',
            ],
        };
        const result = generateChannelClaudeMd(params);
        expect(result).toContain('## Resources');
        expect(result).toContain('drive/brand-guide.md');
        expect(result).toContain('drive/seo-playbook.md');
    });

    it('should omit resources section when no shared resources', () => {
        const result = generateChannelClaudeMd(DEFAULT_PARAMS);
        expect(result).not.toContain('## Resources');
    });

    it('should omit resources section for empty array', () => {
        const params: ChannelClaudeMdParams = {
            ...DEFAULT_PARAMS,
            sharedResources: [],
        };
        const result = generateChannelClaudeMd(params);
        expect(result).not.toContain('## Resources');
    });

    it('should default agent role to "Team member" when empty', () => {
        const params: ChannelClaudeMdParams = {
            ...DEFAULT_PARAMS,
            agentRole: '',
        };
        const result = generateChannelClaudeMd(params);
        expect(result).toContain('Team member');
    });

    it('should handle empty channel purpose gracefully', () => {
        const params: ChannelClaudeMdParams = {
            ...DEFAULT_PARAMS,
            channelPurpose: '',
        };
        const result = generateChannelClaudeMd(params);
        expect(result).toContain('# #marketing-seo');
        expect(result).toContain('## Project: marketing');
    });

    it('should handle empty project description gracefully', () => {
        const params: ChannelClaudeMdParams = {
            ...DEFAULT_PARAMS,
            projectDescription: '',
        };
        const result = generateChannelClaudeMd(params);
        expect(result).toContain('## Project: marketing');
        expect(result).toContain('## Your Role');
    });
});
