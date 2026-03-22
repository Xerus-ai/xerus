import { createBackendClient, type BackendClient } from '@pipedream/sdk';

let client: BackendClient | null = null;

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

