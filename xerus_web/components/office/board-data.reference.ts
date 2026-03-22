/**
 * REFERENCE FILE - DO NOT IMPORT IN PRODUCTION CODE
 *
 * This file preserves the original dummy data that was used during UI development
 * for TaskDetailSheet subtask names, notes, and file attachments.
 */

export const DUMMY_SUBTASK_NAMES: Record<string, string[]> = {
  'demo-1': ['Define onboarding user flow', 'Design agent preset templates', 'Build walkthrough stepper UI', 'Write onboarding API endpoints', 'Add progress tracking', 'QA and polish animations'],
  'demo-2': ['Research drag-and-drop libraries', 'Design upload component mockup', 'Build file validation logic', 'Add progress indicator UI'],
  'demo-3': ['Design snapshot data model', 'Set up S3 bucket and policies', 'Build snapshot create/restore API', 'Add workspace diff viewer', 'Write integration tests', 'Add snapshot retention policy', 'Build restore confirmation UI', 'Document snapshot lifecycle'],
  'demo-4': ['Design credit ledger schema', 'Build usage tracking middleware', 'Implement balance management API', 'Add low-balance alert system', 'Build billing dashboard UI', 'Write Stripe webhook handler', 'Add usage analytics queries'],
  'demo-5': ['Design heartbeat state machine', 'Build cron scheduler integration', 'Implement snapshot service', 'Add event-triggered wakeups', 'Write concurrency lock tests'],
  'demo-6': ['Set up SSE endpoint handler', 'Build event serializer', 'Implement client reconnection', 'Add backpressure handling'],
  'demo-7': ['Research Pipedream MCP protocol', 'Design MCP server config schema', 'Build connection manager', 'Add tool discovery endpoint', 'Implement auth token refresh', 'Write E2E integration tests'],
  'demo-8': ['Set up Firebase admin SDK', 'Build JWT validation middleware', 'Add token refresh logic', 'Implement session management', 'Write security test suite'],
  'demo-9': ['Design marketplace schema', 'Build agent catalog API', 'Implement one-click clone', 'Add agent preview cards', 'Build category filters', 'Add search and ranking', 'Write marketplace tests', 'Add featured agents section'],
  'demo-10': ['Set up Daytona SDK client', 'Build sandbox provisioning API', 'Implement lifecycle management', 'Add volume mount system', 'Build preview URL routing', 'Write health check probes', 'Add auto-stop/archive timers', 'Implement cold storage archival', 'Build sandbox metrics dashboard', 'Write load test suite'],
  'demo-11': ['Design avatar generation pipeline', 'Build robot mascot renderer', 'Add model badge overlay system'],
  'demo-12': ['Design RBAC permission model', 'Build workspace sharing API', 'Implement role assignment UI', 'Add invitation system', 'Build access audit log', 'Design shared agent permissions', 'Implement workspace switcher', 'Add collaborative editing locks', 'Write permission test suite', 'Build admin dashboard', 'Add billing for shared workspaces', 'Document sharing architecture'],
  'demo-13': ['Design metrics collection schema', 'Build token usage tracker', 'Implement cost breakdown API', 'Add task completion rate calculator', 'Build analytics dashboard UI', 'Write data aggregation queries'],
}

export const DUMMY_SUBTASK_NOTES: Record<string, Record<number, string>> = {
  'demo-1': { 0: 'Note: Include both first-time and returning user paths' },
  'demo-3': { 2: 'Blocker: Need S3 bucket permissions from infra team' },
  'demo-4': { 5: 'Note: Stripe test mode keys required for local dev' },
  'demo-7': { 0: 'Note: MCP spec is still in draft - check for updates' },
  'demo-10': { 3: 'Blocker: Daytona volume API changed in v0.38 - migration needed' },
}

export const DUMMY_FILES: Record<string, { name: string; size: string; type: string }[]> = {
  'demo-1': [{ name: 'onboarding-flow.pdf', size: '2.1 MB', type: 'pdf' }, { name: 'agent-presets.json', size: '48 KB', type: 'json' }],
  'demo-3': [{ name: 'snapshot-architecture.pdf', size: '1.5 MB', type: 'pdf' }],
  'demo-4': [{ name: 'billing-spec.pdf', size: '3.2 MB', type: 'pdf' }, { name: 'credit-model.xlsx', size: '890 KB', type: 'xls' }, { name: 'stripe-flow.png', size: '420 KB', type: 'img' }],
  'demo-8': [{ name: 'auth-flow-diagram.png', size: '580 KB', type: 'img' }, { name: 'security-audit.pdf', size: '1.1 MB', type: 'pdf' }],
  'demo-10': [{ name: 'daytona-sdk-ref.pdf', size: '4.2 MB', type: 'pdf' }, { name: 'sandbox-metrics.csv', size: '120 KB', type: 'csv' }, { name: 'lifecycle-diagram.png', size: '350 KB', type: 'img' }, { name: 'load-test-results.json', size: '2.8 MB', type: 'json' }],
}
