import { createBackendClient, type BackendClient } from '@pipedream/sdk';

let client: BackendClient | null = null;

const PIPEDREAM_ENV_VARS = [
    'PIPEDREAM_CLIENT_ID',
    'PIPEDREAM_CLIENT_SECRET',
    'PIPEDREAM_PROJECT_ID',
    'PIPEDREAM_PROJECT_ENVIRONMENT',
] as const;

const PLACEHOLDER_PATTERNS: RegExp[] = [
    /^your[-_]/i,
    /placeholder/i,
    /^x{3,}$/i,
    /^todo$/i,
    /^changeme$/i,
];

function isPlaceholderValue(value: string | undefined): boolean {
    if (value === undefined) return true;
    const trimmed = value.trim();
    if (trimmed === '') return true;
    return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function findInvalidPipedreamEnvVars(): string[] {
    return PIPEDREAM_ENV_VARS.filter((name) => isPlaceholderValue(process.env[name]));
}

export function getPipedreamClient(): BackendClient {
    if (!client) {
        const clientId = process.env.PIPEDREAM_CLIENT_ID;
        const clientSecret = process.env.PIPEDREAM_CLIENT_SECRET;
        const projectId = process.env.PIPEDREAM_PROJECT_ID;
        const environment = process.env.PIPEDREAM_PROJECT_ENVIRONMENT as 'development' | 'production';

        if (!clientId || !clientSecret || !projectId || !environment) {
            throw new Error('Missing Pipedream configuration');
        }

        client = createBackendClient({
            environment,
            projectId,
            credentials: { clientId, clientSecret },
        });
    }
    return client;
}

