// Connected-accounts reconciliation.
// connected_accounts is otherwise only written by one fire-and-forget webhook, so a
// single missed delivery is a permanent gap. Reconciling against Pipedream (the source
// of truth) on every sandbox MCP sync converges the table and automatically backfills
// every connection lost to the old webhook parse bug — no manual repair.

import type { BackendClient, Account } from '@pipedream/sdk';
import { toolsRepository } from './repository';
import type { SaveConnectionInput } from './types';

const MAX_PAGES = 100;
const PAGE_LIMIT = 100;

/**
 * Fetch ALL accounts Pipedream reports for an external user, following pagination.
 * The complete set must be assembled before the DB is touched — a partial fetch would
 * drive the convergence delete and drop live rows — so any Pipedream error throws here.
 */
async function fetchAllPipedreamAccounts(pipedream: BackendClient, externalUserId: string): Promise<Account[]> {
    const all: Account[] = [];
    let after: string | undefined;
    let page = 0;
    do {
        const response = await pipedream.getAccounts({
            external_user_id: externalUserId,
            after,
            limit: PAGE_LIMIT,
        });
        const data = response.data || [];
        all.push(...data);
        after = data.length > 0 ? response.page_info?.end_cursor : undefined;
        page++;
    } while (after && page < MAX_PAGES);
    return all;
}

/**
 * Converge a user's connected_accounts with Pipedream's authoritative account list.
 * Returns counts of rows added/removed and the final total for the user.
 */
export async function reconcileConnectedAccounts(
    pipedream: BackendClient,
    userId: string,
): Promise<{ added: number; removed: number; total: number }> {
    const remoteAccounts = await fetchAllPipedreamAccounts(pipedream, userId);

    const connections: SaveConnectionInput[] = remoteAccounts.map((account) => ({
        user_id: userId,
        pipedream_account_id: String(account.id),
        app_slug: account.app.name_slug,
        app_name: account.name,
    }));

    return toolsRepository.reconcileConnections(userId, connections);
}
