---
status: pending
priority: p1
issue_id: billing-polar-004
tags: [code-review, agent-native, platform-tools]
---
# Billing Tool Unreachable: `get_billing_status` Not Wired to MCP Server

## Problem Statement
`get_billing_status` is registered in all 4 backend type definition files but is NOT present in the MCP server TOOLS array or the internal MCP routes. Agents running inside the Daytona sandbox cannot call it. The tool implementation at `billing.tools.ts` is complete and functional, but nothing invokes it -- the wiring between the MCP server and the tool handler is missing. This means agents cannot check a user's billing status, plan type, or credit balance, breaking any agent workflow that depends on billing awareness.

## Findings
- `execution/runner/mcp-server.ts` lines 82-301: The TOOLS array defines all available MCP tools. `get_billing_status` is NOT present in this array.
- `platform-tools/internal-mcp/index.ts`: No billing route is registered. The internal MCP router has no POST handler for billing operations.
- `xerus-workspace/.claude/agents/xerus-master/CLAUDE.md`: No billing section documenting the tool for agents.
- Backend type files (4 locations): `get_billing_status` is defined in type interfaces, confirming it was designed to be a platform tool.
- `billing.tools.ts`: Complete implementation exists -- the handler is written and functional, just not mounted.
- Flagged by: agent-native-reviewer, architecture-strategist (2 agents)

## Proposed Solutions

### Option A: Full MCP Wiring (Recommended)
Complete the wiring chain: (A) Add `get_billing_status` tool definition to MCP server TOOLS array, (B) Create `internal-mcp/billing.routes.ts` with POST handler, (C) Mount billing routes in `internal-mcp/index.ts`, (D) Update agent CLAUDE.md and TOOL_GUIDE.md with billing tool documentation.
- **Pros**: Complete solution, follows existing patterns for other tools.
- **Cons**: Touches multiple files across repos.

### Option B: Direct Route Without MCP
Add a direct REST endpoint that agents can call without going through MCP.
- **Pros**: Simpler implementation.
- **Cons**: Breaks the MCP-based tool architecture pattern, creates inconsistency with other tools.

## Acceptance Criteria
- [ ] `get_billing_status` appears in the MCP server TOOLS array with correct schema (name, description, input_schema)
- [ ] `internal-mcp/billing.routes.ts` exists with POST handler that invokes `billing.tools.ts`
- [ ] Billing routes are mounted in `internal-mcp/index.ts`
- [ ] Agent inside Daytona sandbox can call `get_billing_status` and receive `plan_type`, `credits`, `subscription_status`
- [ ] Agent CLAUDE.md documents the billing tool with usage examples
- [ ] TOOL_GUIDE.md includes `get_billing_status` in the tool reference
- [ ] Integration test: MCP client sends `get_billing_status` request and receives valid response
