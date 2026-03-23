import { createFrontendClient, BrowserClient } from '@pipedream/sdk/browser'
import { auth } from '@/utils/firebase'
import { apiCall } from './api/client'
import { getWebUrl } from '@/utils/context-detection'

let sharedClient: BrowserClient | null = null

// Token callback for Pipedream SDK
async function fetchPipedreamToken(opts: { externalUserId: string }) {
    const response = await apiCall(`/tools/connect-token`, {
        method: 'POST',
        body: JSON.stringify({
            external_user_id: opts.externalUserId,
            allowed_origins: [getWebUrl()],
        })
    })
    const result = await response.json()

    // Backend returns { statusCode, message, data: { token, expires_at, connect_url } }
    // SDK needs { token, expires_at, connect_link_url }
    return {
        token: result.data.token,
        expires_at: result.data.expires_at,
        connect_link_url: result.data.connect_url || ''
    }
}

/**
 * Get or create the shared Pipedream client instance
 * This ensures all hooks use the same client with shared state
 * Recreates client if user changes to ensure correct externalUserId
 */
export function getSharedPipedreamClient(): BrowserClient {
    const userId = auth.currentUser?.uid

    if (!userId) {
        throw new Error('User must be authenticated to use Pipedream Connect')
    }

    // Recreate client if user changed (or client doesn't exist)
    const currentUserId = (sharedClient as any)?._externalUserId
    if (!sharedClient || currentUserId !== userId) {
        const environment = (process.env.NEXT_PUBLIC_PIPEDREAM_ENVIRONMENT || 'production') as 'production' | 'development'

        sharedClient = createFrontendClient({
            environment,
            externalUserId: userId,
            tokenCallback: fetchPipedreamToken,
        });

        // Store userId for comparison (SDK doesn't expose it)
        (sharedClient as any)._externalUserId = userId
    }

    return sharedClient
}

/**
 * Reset the shared client (useful for logout or user change)
 */
export function resetSharedPipedreamClient() {
    sharedClient = null
}
