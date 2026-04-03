// Sandbox Provider Factory
// Creates sandbox providers based on configuration
// Default: Daytona (persistence, volumes, preview URLs, SDK runs inside)

import { SandboxProvider, ProviderType } from './sandbox-provider.interface';

// Provider factory configuration
export interface ProviderFactoryConfig {
    defaultProvider?: ProviderType;
}

// Default configuration - Daytona is the only production provider
const DEFAULT_CONFIG: ProviderFactoryConfig = {
    defaultProvider: 'daytona',
};

// Cached provider instances (singleton per type)
const providerCache = new Map<ProviderType, SandboxProvider>();

// Create a sandbox provider
export function createProvider(type?: ProviderType): SandboxProvider {
    const providerType = type || DEFAULT_CONFIG.defaultProvider || 'daytona';

    // Return cached instance if available
    const cached = providerCache.get(providerType);
    if (cached) {
        return cached;
    }

    // Create new provider
    const provider = instantiateProvider(providerType);
    providerCache.set(providerType, provider);

    return provider;
}

// Check if Daytona is configured
export function isDaytonaConfigured(): boolean {
    return !!process.env.DAYTONA_API_KEY;
}

// Get the default provider
export function getDefaultProvider(): SandboxProvider {
    return createProvider();
}

// Clear the provider cache (for testing)
export function clearProviderCache(): void {
    providerCache.clear();
}

// Instantiate a provider by type
function instantiateProvider(type: ProviderType): SandboxProvider {
    if (type !== 'daytona') {
        throw new Error(`Unsupported provider type: ${type}. Only 'daytona' is supported.`);
    }

    // Lazy import to avoid loading Daytona SDK at module evaluation time
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DaytonaProvider } = require('./daytona.provider');
    return new DaytonaProvider();
}
