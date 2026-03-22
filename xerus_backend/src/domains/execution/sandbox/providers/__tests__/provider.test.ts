// Sandbox Provider Tests
// Unit tests for provider interface and factory

import {
    SandboxProvider,
    ProviderSandbox,
    CreateProviderSandboxOptions,
    ProviderSandboxStatus,
    ProviderCapabilities,
    PROVIDER_TYPES,
} from '../sandbox-provider.interface';
import { clearProviderCache, createProvider, isDaytonaConfigured } from '../provider-factory';

// Check if Daytona API key is available for integration tests
const DAYTONA_API_KEY = process.env.DAYTONA_API_KEY;
const RUN_DAYTONA_TESTS = Boolean(DAYTONA_API_KEY);

describe('SandboxProvider interface', () => {
    it('defines required methods', () => {
        const provider: SandboxProvider = {
            name: 'test',
            capabilities: {
                supportsPause: true,
                supportsResume: true,
                supportsTimeout: true,
                maxLifetimeMs: 3600000,
            },
            create: async () => ({ sandboxId: 'test-123' }),
            connect: async () => ({ sandboxId: 'test-123' }),
            pause: async () => {},
            kill: async () => {},
            getStatus: async () => ({ state: 'running' as const, sandboxId: 'test-123' }),
        };

        expect(provider.name).toBe('test');
        expect(typeof provider.create).toBe('function');
        expect(typeof provider.connect).toBe('function');
        expect(typeof provider.pause).toBe('function');
        expect(typeof provider.kill).toBe('function');
        expect(typeof provider.getStatus).toBe('function');
    });
});

describe('PROVIDER_TYPES', () => {
    it('includes daytona as only provider', () => {
        expect(PROVIDER_TYPES).toContain('daytona');
    });

    it('has exactly 1 provider type', () => {
        expect(PROVIDER_TYPES.length).toBe(1);
    });

    it('does not include e2b (removed Feb 2025)', () => {
        expect(PROVIDER_TYPES).not.toContain('e2b');
    });
});

describe('ProviderCapabilities', () => {
    it('defines capability structure', () => {
        const capabilities: ProviderCapabilities = {
            supportsPause: true,
            supportsResume: true,
            supportsTimeout: true,
            maxLifetimeMs: 86400000,
        };

        expect(capabilities.supportsPause).toBe(true);
        expect(capabilities.supportsResume).toBe(true);
        expect(capabilities.supportsTimeout).toBe(true);
        expect(capabilities.maxLifetimeMs).toBe(86400000);
    });
});

describe('ProviderSandbox', () => {
    it('has sandboxId and optional metadata', () => {
        const sandbox: ProviderSandbox = {
            sandboxId: 'sandbox-abc-123',
            metadata: { user_id: 'user-1' },
        };

        expect(sandbox.sandboxId).toBe('sandbox-abc-123');
        expect(sandbox.metadata?.user_id).toBe('user-1');
    });

    it('allows sandbox without metadata', () => {
        const sandbox: ProviderSandbox = {
            sandboxId: 'sandbox-abc-123',
        };

        expect(sandbox.sandboxId).toBe('sandbox-abc-123');
        expect(sandbox.metadata).toBeUndefined();
    });
});

describe('CreateProviderSandboxOptions', () => {
    it('has optional snapshot, timeout, envVars, and metadata', () => {
        const options: CreateProviderSandboxOptions = {
            snapshot: 'daytona-medium',
            timeoutMs: 300000,
            envVars: { NODE_ENV: 'production' },
            metadata: { user_id: 'user-1' },
        };

        expect(options.snapshot).toBe('daytona-medium');
        expect(options.timeoutMs).toBe(300000);
        expect(options.envVars?.NODE_ENV).toBe('production');
        expect(options.metadata?.user_id).toBe('user-1');
    });

    it('allows empty options', () => {
        const options: CreateProviderSandboxOptions = {};

        expect(options.snapshot).toBeUndefined();
        expect(options.timeoutMs).toBeUndefined();
    });
});

describe('ProviderSandboxStatus', () => {
    it('has required sandboxId and state', () => {
        const status: ProviderSandboxStatus = {
            sandboxId: 'sandbox-123',
            state: 'running',
        };

        expect(status.sandboxId).toBe('sandbox-123');
        expect(status.state).toBe('running');
    });

    it('can include optional createdAt and metadata', () => {
        const status: ProviderSandboxStatus = {
            sandboxId: 'sandbox-123',
            state: 'paused',
            createdAt: new Date(),
            metadata: { user_id: 'user-1' },
        };

        expect(status.state).toBe('paused');
        expect(status.createdAt).toBeInstanceOf(Date);
        expect(status.metadata?.user_id).toBe('user-1');
    });
});

describe('Provider Factory', () => {
    beforeEach(() => {
        clearProviderCache();
    });

    afterEach(() => {
        clearProviderCache();
    });

    it('clearProviderCache does not throw', () => {
        expect(() => clearProviderCache()).not.toThrow();
    });

    it('isDaytonaConfigured returns boolean based on env var', () => {
        const result = isDaytonaConfigured();
        expect(typeof result).toBe('boolean');
    });

    it('createProvider throws for docker (not supported)', () => {
        expect(() => createProvider('docker' as any)).toThrow("Unsupported provider type: docker. Only 'daytona' is supported.");
    });

    it('createProvider throws for local (not supported)', () => {
        expect(() => createProvider('local' as any)).toThrow("Unsupported provider type: local. Only 'daytona' is supported.");
    });
});

// Daytona Provider Integration Tests - only run when API key is available
const describeDaytona = RUN_DAYTONA_TESTS ? describe : describe.skip;

describeDaytona('DaytonaProvider Integration', () => {
    // Increase timeout for real API calls
    jest.setTimeout(120000);

    it('creates provider via factory', () => {
        const provider = createProvider('daytona');
        expect(provider.name).toBe('daytona');
        expect(provider.capabilities.supportsPause).toBe(true);
        expect(provider.capabilities.supportsResume).toBe(true);
    });
});

// Full lifecycle integration tests - creates real sandbox, costs money
// Run with: npm test -- --testPathPatterns="provider.test" --testNamePattern="Lifecycle"
describeDaytona('DaytonaProvider Lifecycle Integration', () => {
    // These tests run sequentially on a single sandbox
    jest.setTimeout(180000); // 3 minutes for full lifecycle

    // Import DaytonaProvider directly for extended methods
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DaytonaProvider } = require('../daytona.provider');

    let provider: InstanceType<typeof DaytonaProvider>;
    let sandboxId: string | null = null;

    beforeAll(() => {
        provider = new DaytonaProvider();
    });

    afterAll(async () => {
        // Cleanup: always try to kill the sandbox
        if (sandboxId) {
            try {
                await provider.kill(sandboxId);
                console.log(`[Cleanup] Sandbox ${sandboxId} deleted`);
            } catch (error) {
                console.warn(`[Cleanup] Failed to delete sandbox ${sandboxId}:`, error);
            }
        }
    });

    it('creates a real sandbox', async () => {
        const result = await provider.create({
            metadata: { test: 'xerus-integration-test' },
        });

        expect(result.sandboxId).toBeDefined();
        expect(typeof result.sandboxId).toBe('string');
        expect(result.sandboxId.length).toBeGreaterThan(0);

        sandboxId = result.sandboxId;
        console.log(`[Test] Created sandbox: ${sandboxId}`);
    });

    it('gets sandbox status as running', async () => {
        expect(sandboxId).not.toBeNull();

        const status = await provider.getStatus(sandboxId!);

        expect(status).not.toBeNull();
        expect(status!.sandboxId).toBe(sandboxId);
        expect(status!.state).toBe('running');
    });

    it('executes a shell command', async () => {
        expect(sandboxId).not.toBeNull();

        const result = await provider.executeCommand(sandboxId!, 'echo "Hello from Daytona"');

        expect(result.exitCode).toBe(0);
        expect(result.result).toContain('Hello from Daytona');
    });

    it('executes Python code', async () => {
        expect(sandboxId).not.toBeNull();

        const result = await provider.executeCode(sandboxId!, 'print(2 + 2)');

        expect(result).toContain('4');
    });

    it('creates and reads a file via shell', async () => {
        expect(sandboxId).not.toBeNull();

        const testContent = 'Hello from Xerus integration test!';
        const testPath = '/tmp/xerus-test.txt';

        // Create file using echo command (avoids SDK uploadFile limitation)
        const createResult = await provider.executeCommand(
            sandboxId!,
            `echo '${testContent}' > ${testPath}`
        );
        expect(createResult.exitCode).toBe(0);

        // Read it back via command
        const result = await provider.executeCommand(sandboxId!, `cat ${testPath}`);

        expect(result.exitCode).toBe(0);
        expect(result.result).toContain(testContent);
    });

    it('pauses the sandbox (stop)', async () => {
        expect(sandboxId).not.toBeNull();

        await provider.pause(sandboxId!);

        // Wait a moment for state to propagate
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const status = await provider.getStatus(sandboxId!);
        expect(status).not.toBeNull();
        expect(status!.state).toBe('paused');
    });

    it('resumes the sandbox (start)', async () => {
        expect(sandboxId).not.toBeNull();

        await provider.start(sandboxId!);

        // Wait for sandbox to be ready
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const status = await provider.getStatus(sandboxId!);
        expect(status).not.toBeNull();
        expect(status!.state).toBe('running');
    });

    it('verifies file persists after pause/resume', async () => {
        expect(sandboxId).not.toBeNull();

        const result = await provider.executeCommand(sandboxId!, 'cat /tmp/xerus-test.txt');

        expect(result.exitCode).toBe(0);
        expect(result.result).toContain('Hello from Xerus integration test!');
    });

    it('kills the sandbox', async () => {
        expect(sandboxId).not.toBeNull();

        await provider.kill(sandboxId!);

        // Wait for deletion
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // getStatus throws SandboxNotFoundError after deletion
        await expect(provider.getStatus(sandboxId!)).rejects.toThrow('not found');

        // Clear sandboxId so afterAll doesn't try to delete again
        sandboxId = null;
    });
});

// Log whether Daytona tests are being run
if (!RUN_DAYTONA_TESTS) {
    console.log('[ProviderTests] DAYTONA_API_KEY not set - skipping Daytona integration tests');
}
