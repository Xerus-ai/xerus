// Platform Tools Domain - Public API (barrel)
// Extracted from execution domain: platform/, orchestrator/, internal-mcp/

// Platform: tool schemas, types, registry, and HITL rules
export {
    TOOL_CATEGORIES as PLATFORM_TOOL_CATEGORIES,
    PLATFORM_TOOL_SCHEMAS,
    TOOL_METADATA,
    getToolSchema,
    getToolMetadata,
    getToolSchemasByCategory,
    isRegisteredTool,
    getRequiredFields,
    evaluateHitlRule,
    getHitlRequirement,
    buildHitlReason,
} from './platform';
export type { ToolCategory as PlatformToolCategory } from './platform';

// Orchestrator: tool filter and agent registry
export * from './orchestrator';

// Internal MCP: router and types
export { internalMcpRouter } from './internal-mcp';
export type { InternalMcpRequest, McpToolResult } from './internal-mcp';
