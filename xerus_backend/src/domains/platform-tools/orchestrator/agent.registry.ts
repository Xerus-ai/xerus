// Agent Registry (DEPRECATED)
// This module was part of the pre-CLI-native Agent SDK execution path.
// After the CLI-native pivot:
//   - Agent config lives in config.json on sandbox filesystem (source of truth)
//   - Agent registry (DB) is a thin slug/id/type lookup via agent-registry.repository.ts
//   - Pipedream MCP servers are synced into .mcp.json by mcp-config.service.ts
//   - SDK_TOOLS are defined in execution/types.ts as NATIVE_SDK_TOOLS
//
// All functions previously here (buildSDKAgentConfig, buildMCPServers, etc.)
// were dead code — never imported after the CLI-native pivot.
// Deleted in cleanup: 2026-04-03.
