// MCP Tool Definitions
// Schema definitions for all 39 backend-coupled platform tools.
// Split into two arrays by category, merged into TOOLS for registration.

import { SESSION_PLATFORM_TOOLS } from './mcp-tools-session';
import { RESOURCE_MANAGEMENT_TOOLS } from './mcp-tools-resources';

export const TOOLS = [...SESSION_PLATFORM_TOOLS, ...RESOURCE_MANAGEMENT_TOOLS];
