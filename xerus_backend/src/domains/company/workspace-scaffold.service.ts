// Workspace Scaffold Service
// Creates project and channel files from .xerus/templates/ on the sandbox.
// Called by company.routes.ts when domains/channels are created via API.

import { SANDBOX_CONFIG } from '../sandbox-infra/sandbox/sandbox.config';
import type { DaytonaProvider } from '../sandbox-infra/sandbox';
import { logger } from '../../utils/logger';

const log = logger('WorkspaceScaffold');

const WS = SANDBOX_CONFIG.workspacePath;
const TEMPLATE_BASE = `${WS}/.xerus/templates`;

interface ScaffoldVars {
    [key: string]: string;
}

async function tryReadTemplate(provider: DaytonaProvider, sandboxId: string, path: string): Promise<string | null> {
    try {
        return await provider.readFile(sandboxId, path);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('ENOENT') || msg.includes('No such file') || msg.includes('not found')) {
            return null;
        }
        throw err;
    }
}

function substituteVars(template: string, vars: ScaffoldVars): string {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
        result = result.replaceAll(`{{${key}}}`, value);
    }
    return result;
}

async function writeIfMissing(
    provider: DaytonaProvider,
    sandboxId: string,
    filePath: string,
    content: string,
): Promise<boolean> {
    try {
        await provider.readFile(sandboxId, filePath);
        return false;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('ENOENT') || msg.includes('No such file') || msg.includes('not found')) {
            await provider.writeFile(sandboxId, filePath, content);
            return true;
        }
        throw err;
    }
}

export async function scaffoldProject(
    provider: DaytonaProvider,
    sandboxId: string,
    domainSlug: string,
    vars: ScaffoldVars,
): Promise<void> {
    const projectDir = `${WS}/projects/${domainSlug}`;
    const templateDir = `${TEMPLATE_BASE}/project`;

    const templateVars: ScaffoldVars = {
        PROJECT_NAME: vars.PROJECT_NAME || domainSlug,
        PROJECT_MISSION: vars.PROJECT_MISSION || `Project: ${domainSlug}`,
        OBJECTIVE_1: vars.OBJECTIVE_1 || 'Define objectives',
        ...vars,
    };

    const claudeMdTmpl = await tryReadTemplate(provider, sandboxId, `${templateDir}/CLAUDE.md.tmpl`);
    if (claudeMdTmpl) {
        const content = substituteVars(claudeMdTmpl, templateVars);
        const written = await writeIfMissing(provider, sandboxId, `${projectDir}/CLAUDE.md`, content);
        if (written) log.info('Scaffolded project CLAUDE.md', { domain: domainSlug });
    }
}

export async function scaffoldChannel(
    provider: DaytonaProvider,
    sandboxId: string,
    domainSlug: string,
    channelSlug: string,
    vars: ScaffoldVars,
): Promise<void> {
    const channelDir = `${WS}/projects/${domainSlug}/channels/${channelSlug}`;
    const templateDir = `${TEMPLATE_BASE}/channel`;

    const now = new Date().toISOString();
    const templateVars: ScaffoldVars = {
        CHANNEL_NAME: vars.CHANNEL_NAME || channelSlug,
        CHANNEL_MISSION: vars.CHANNEL_MISSION || `Channel: ${channelSlug}`,
        TIMEZONE: vars.TIMEZONE || 'UTC',
        CREATED_AT: vars.CREATED_AT || now,
        DAILY_OUTPUT: vars.DAILY_OUTPUT || 'Updates and deliverables',
        ...vars,
    };

    const templates: Array<{ tmpl: string; target: string }> = [
        { tmpl: 'CLAUDE.md.tmpl', target: 'CLAUDE.md' },
        { tmpl: 'context.md.tmpl', target: 'context.md' },
        { tmpl: 'shift.yaml.tmpl', target: 'shift.yaml' },
        { tmpl: 'AGENTS.md.tmpl', target: 'AGENTS.md' },
    ];

    const written: string[] = [];
    for (const { tmpl, target } of templates) {
        const content = await tryReadTemplate(provider, sandboxId, `${templateDir}/${tmpl}`);
        if (content) {
            const rendered = substituteVars(content, templateVars);
            const created = await writeIfMissing(provider, sandboxId, `${channelDir}/${target}`, rendered);
            if (created) written.push(target);
        }
    }

    if (written.length > 0) {
        log.info('Scaffolded channel files', { domain: domainSlug, channel: channelSlug, files: written });
    }
}
