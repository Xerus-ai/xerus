import { execSync } from 'child_process';
import * as path from 'path';
import { TARGETS, TEST_USER_EMAIL, TOKEN_SCRIPT } from './config';
import { TestResult } from './client';
import { runSmoke } from './tier1-smoke';
import { runContract } from './tier2-contract';
import { runFlows } from './tier3-flows';

function getToken(email: string): string {
    const scriptPath = path.resolve(__dirname, '../../', TOKEN_SCRIPT);
    try {
        const token = execSync(`node "${scriptPath}" "${email}"`, {
            cwd: path.resolve(__dirname, '../../'),
            timeout: 30_000,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();

        if (!token || token.length < 50) {
            throw new Error(`Token too short (${token.length} chars)`);
        }
        return token;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`\nFailed to get auth token: ${msg}`);
        console.error('Ensure GOOGLE_APPLICATION_CREDENTIALS is set in .env.local');
        process.exit(1);
    }
}

function parseArgs(): { target: string; tier: string; email: string } {
    const args = process.argv.slice(2);
    let target = 'prod';
    let tier = 'all';
    let email = TEST_USER_EMAIL;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--target' && args[i + 1]) target = args[++i];
        else if (args[i] === '--tier' && args[i + 1]) tier = args[++i];
        else if (args[i] === '--email' && args[i + 1]) email = args[++i];
        else if (args[i] === '--help') {
            console.log(`
Usage: npx ts-node tests/e2e/runner.ts [options]

Options:
  --target <prod|local>           API target (default: prod)
  --tier <smoke|contract|flow|all> Test tier (default: all)
  --email <email>                  Test user email (default: ${TEST_USER_EMAIL})
  --help                           Show this help
`);
            process.exit(0);
        }
    }

    if (!TARGETS[target]) {
        console.error(`Unknown target: ${target}. Use: ${Object.keys(TARGETS).join(', ')}`);
        process.exit(1);
    }

    return { target, tier, email };
}

async function main(): Promise<void> {
    const { target, tier, email } = parseArgs();
    const baseUrl = TARGETS[target];

    console.log('╔══════════════════════════════════════╗');
    console.log('║   Xerus API Regression Suite         ║');
    console.log('╚══════════════════════════════════════╝');
    console.log(`Target:  ${target} (${baseUrl})`);
    console.log(`Tier:    ${tier}`);
    console.log(`User:    ${email}`);
    console.log('');

    // Auth
    console.log('Authenticating...');
    const token = getToken(email);
    console.log(`Token acquired (${token.length} chars)\n`);

    const allResults: TestResult[] = [];
    let totalPassed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    // Tier 1: Smoke
    if (tier === 'smoke' || tier === 'all') {
        const smoke = await runSmoke(baseUrl, token, target);
        allResults.push(...smoke.results);
        totalPassed += smoke.passed;
        totalFailed += smoke.failed;
        totalSkipped += smoke.skipped;
    }

    // Tier 2: Contract
    if (tier === 'contract' || tier === 'all') {
        const contract = await runContract(baseUrl, token);
        allResults.push(...contract.results);
        totalPassed += contract.passed;
        totalFailed += contract.failed;
    }

    // Tier 3: Flows
    if (tier === 'flow' || tier === 'all') {
        const flows = await runFlows(baseUrl, token);
        allResults.push(...flows.results);
        totalPassed += flows.passed;
        totalFailed += flows.failed;
    }

    // Summary
    console.log('\n╔══════════════════════════════════════╗');
    console.log('║   SUMMARY                            ║');
    console.log('╚══════════════════════════════════════╝');
    console.log(`Total:   ${totalPassed + totalFailed + totalSkipped}`);
    console.log(`Passed:  ${totalPassed}`);
    console.log(`Failed:  ${totalFailed}`);
    console.log(`Skipped: ${totalSkipped}`);

    if (totalFailed > 0) {
        console.log('\n--- FAILURES ---');
        for (const r of allResults.filter(r => !r.passed)) {
            console.log(`  ${r.name}: ${r.method} ${r.path} (${r.status}) — ${r.error}`);
            if (r.body) {
                const preview = JSON.stringify(r.body).slice(0, 200);
                console.log(`    Response: ${preview}`);
            }
        }
    }

    console.log(`\nResult: ${totalFailed === 0 ? 'ALL PASSED' : 'FAILURES DETECTED'}`);
    process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('Runner crashed:', err);
    process.exit(2);
});
