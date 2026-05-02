import { parse as parseYaml } from 'yaml';

export interface AgentYamlFields {
    name: string;
    display_name: string;
    description: string;
    role: string;
    preferred: string;
    adapter_type: string;
    autonomy_level: string;
    domain: string;
    primary_channel: string;
    mascot: string;
    created_at: string;
}

export function parseAgentYamlFields(raw: string): Partial<AgentYamlFields> {
    const doc = parseYaml(raw) as Record<string, unknown> | null;
    if (!doc || typeof doc !== 'object') return {};

    const metadata = (typeof doc.metadata === 'object' && doc.metadata !== null ? doc.metadata : {}) as Record<string, unknown>;
    const modelSection = (typeof doc.model === 'object' && doc.model !== null ? doc.model : {}) as Record<string, unknown>;

    const str = (v: unknown): string => (typeof v === 'string' ? v : '');

    return {
        name: str(doc.name),
        display_name: str(metadata.display_name),
        description: str(doc.description),
        role: str(metadata.role),
        preferred: str(modelSection.preferred),
        adapter_type: str(metadata.adapter_type),
        autonomy_level: str(metadata.autonomy_level),
        domain: str(metadata.domain),
        primary_channel: str(metadata.primary_channel),
        mascot: str(metadata.mascot),
        created_at: str(metadata.created_at),
    };
}
