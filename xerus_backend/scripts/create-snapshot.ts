// Create Xerus custom Daytona snapshot
// Pre-installs runner dependencies so sandbox creation is instant
//
// Usage: npm run snapshot:create
// Requires: DAYTONA_API_KEY and DAYTONA_API_URL env vars
//
// This is a one-time setup. Re-run only when runner deps change.
//
// MINIO HOST RESOLUTION:
// The Daytona API returns S3 push credentials with storageUrl=http://minio:9000
// (Docker-internal hostname). When this script runs on the HOST machine, "minio"
// does not resolve. The SDK uploads build context to this URL, causing
// "getaddrinfo ENOTFOUND minio".
//
// Fix: Set MINIO_ENDPOINT_OVERRIDE=http://localhost:9000 in .env (dev) or use
// the actual MinIO host (prod). This script patches the SDK's getPushAccess
// response to replace the Docker-internal URL with the host-reachable one.

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { Daytona } from '@daytonaio/sdk';
import { Image } from '@daytonaio/sdk';

const SNAPSHOT_NAME = 'xerus-sandbox';

/**
 * Patches the Daytona SDK's object storage API to rewrite the Docker-internal
 * MinIO URL (http://minio:9000) with a host-reachable URL.
 *
 * The Daytona API's S3_ENDPOINT is set to http://minio:9000 for inter-container
 * communication. When the SDK calls getPushAccess(), it receives this URL and
 * tries to upload build context from the host machine, which fails because
 * "minio" is not a resolvable hostname outside Docker.
 *
 * This wraps the objectStorageApi.getPushAccess method on the SnapshotService
 * to rewrite storageUrl in the response before the SDK uses it.
 */
function patchMinioEndpoint(daytona: Daytona, overrideUrl: string): void {
    // Access the private objectStorageApi on the SnapshotService instance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshotService = daytona.snapshot as any;
    const originalApi = snapshotService.objectStorageApi;

    if (!originalApi || typeof originalApi.getPushAccess !== 'function') {
        throw new Error(
            'Cannot patch MinIO endpoint: objectStorageApi.getPushAccess not found on SnapshotService. '
            + 'The Daytona SDK internals may have changed.',
        );
    }

    const originalGetPushAccess = originalApi.getPushAccess.bind(originalApi);

    originalApi.getPushAccess = async (...args: unknown[]) => {
        const response = await originalGetPushAccess(...args);

        const originalUrl = response.data.storageUrl;
        if (originalUrl && originalUrl.includes('minio')) {
            response.data.storageUrl = overrideUrl;
            console.log(`  Patched storageUrl: ${originalUrl} -> ${overrideUrl}`);
        }

        return response;
    };
}

async function createSnapshot(): Promise<void> {
    const apiKey = process.env.DAYTONA_API_KEY;
    const apiUrl = process.env.DAYTONA_API_URL;

    if (!apiKey) { console.error('DAYTONA_API_KEY is required'); process.exit(1); }
    if (!apiUrl) { console.error('DAYTONA_API_URL is required'); process.exit(1); }

    const daytona = new Daytona({ apiKey, apiUrl });

    // Patch the MinIO endpoint if MINIO_ENDPOINT_OVERRIDE is set.
    // Required when running on the host machine against a Docker Compose Daytona stack,
    // because the API returns http://minio:9000 (Docker-internal) for S3 push access.
    const minioOverride = process.env.MINIO_ENDPOINT_OVERRIDE;
    if (minioOverride) {
        patchMinioEndpoint(daytona, minioOverride);
        console.log(`MinIO endpoint override: ${minioOverride}`);
    } else {
        console.warn(
            'WARNING: MINIO_ENDPOINT_OVERRIDE not set. If MinIO is running in Docker, '
            + 'set MINIO_ENDPOINT_OVERRIDE=http://localhost:9000 in .env to avoid '
            + '"getaddrinfo ENOTFOUND minio" errors.',
        );
    }

    console.log(`Building snapshot '${SNAPSHOT_NAME}'...`);

    const dockerfilePath = path.join(__dirname, '..', 'docker', 'Dockerfile.xerus-snapshot');

    // fromDockerfile auto-extracts COPY sources from the Dockerfile using its
    // parent directory as build context. runner-package.json is in the same docker/ dir.
    const image = Image.fromDockerfile(dockerfilePath);

    const snapshot = await daytona.snapshot.create(
        {
            name: SNAPSHOT_NAME,
            image,
            resources: { cpu: 2, memory: 4, disk: 20 },
            entrypoint: ['sleep', 'infinity'],
        },
        {
            onLogs: (msg: string) => process.stdout.write(msg),
            timeout: 600, // 10 minutes for build
        },
    );

    console.log(`\nSnapshot '${SNAPSHOT_NAME}' created successfully!`);
    console.log(`  ID: ${snapshot.id}`);
    console.log(`  State: ${snapshot.state}`);
    console.log(`\nUpdate .env: DAYTONA_SNAPSHOT=${SNAPSHOT_NAME}`);
}

createSnapshot().catch((err) => {
    console.error('Failed to create snapshot:', err.message || err);
    process.exit(1);
});
