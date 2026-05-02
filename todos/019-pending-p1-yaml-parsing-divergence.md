---
status: pending
priority: p1
issue_id: "019"
tags: [code-review, architecture, dry, correctness]
dependencies: []
---

# P1: Four Divergent YAML Parsers with Inconsistent Behavior

## Problem Statement

Four independent `agent.yaml` parsers exist across two repos, each with different regex patterns, indentation handling, and field extraction. They will produce different results for the same input. The `yaml` npm package is **already a dependency** (`parse-frontmatter.ts`), making the "avoid YAML dep" rationale invalid.

**Critical bug**: `agent-config-resolver.ts:34` uses `\s+` (requires leading whitespace) while `agent-filesystem.repository.ts:101` uses `\s*` (allows zero whitespace). A root-level `adapter_type: codex` in agent.yaml is correctly parsed by the repository but **silently ignored** by the resolver, causing codex agents to run under the wrong claudecode adapter.

## Findings

### Implementation A: agent-filesystem.repository.ts:97-135
- Regex: `/^\s*([\w.]+)\s*:\s*"?([^"]*)"?\s*$/`
- Handles any indentation level (correct)
- Reads 12+ fields

### Implementation B: agent-config-resolver.ts:34-35
- Regex: `/^\s+adapter_type:\s*"?(\w+)"?/m` (BUG: requires `\s+`)
- Only reads 2 fields (adapter_type, preferred)
- Root-level keys silently missed

### Implementation C: sync-agents-md.py:37-52
- Uses `line.startswith("  display_name:")` — requires exactly 2-space indent
- Won't match 4-space or tab indented lines

### Implementation D: scaffold-sync-hook.sh:103-112
- Uses bash `case` pattern matching with literal 2-space prefix
- Most fragile implementation

## Proposed Solutions

### Option A: Use existing `yaml` npm package (Recommended)
- Extract shared `parseAgentYaml()` utility in `src/shared/agent-yaml-parser.ts`
- Use `js-yaml` (already in dependency tree via `parse-frontmatter.ts`)
- Both TS consumers call the shared utility
- Effort: Small | Risk: Low

### Option B: Consolidate regex parsers
- Create one canonical regex parser, share between both TS files
- Fix `\s+` → `\s*` in config-resolver immediately
- Keep Python/Bash as separate but document the subset
- Effort: Small | Risk: Medium (still fragile)

## Acceptance Criteria
- [ ] Single YAML parsing implementation for TypeScript backend
- [ ] Root-level `adapter_type: codex` correctly parsed by resolver
- [ ] Python and Bash parsers documented as subset parsers
- [ ] Test case for root-level vs nested YAML keys

## Work Log
- 2026-05-02: Identified by typescript-reviewer, code-reviewer, pattern-recognition-specialist, architecture-strategist
