# Xerus E2E Test Plan — Zero-Person Company Validation

## Overview

Xerus is "Slack for AI agents" — a platform where users build an AI workforce that runs a company on autopilot. This test plan validates the **complete lifecycle** of setting up and operating a zero-person company, from the perspective of both **humans** (via UI/API) and **agents** (via xerus-master executing inside the sandbox).

**Test User**: `hcard360@gmail.com` (UID: `CpRZJgiNSwgSc0EYdu7T9eDIkIg2`)
**Model**: `gemma-4-31b-it:free` (Google Gemma 4 31B — free tier, no credits consumed)
**Backend**: `http://localhost:5001/api/v1`
**Frontend**: `http://localhost:3002`
**Sandbox**: Daytona (workspace `t`, sandbox `fad03d3b-a32b-4251-b675-14ba36c66a0c`)

---

## Part 1: Foundation — Authentication & User State

### 1.1 Auth Flow (Human)
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 1.1.1 | Unauthenticated user redirected to /login | UI GET /chat | Redirect to /login |
| 1.1.2 | Login page renders with Google button | UI GET /login | Google OAuth button visible |
| 1.1.3 | Firebase token exchange works | API POST /users/find-or-create | 200, returns user object |
| 1.1.4 | Session persists across navigation | UI navigate /chat → /inbox → /workspace | No re-auth prompts |
| 1.1.5 | Auth header rejected when expired | API GET /users/me with bad token | 401 Unauthorized |
| 1.1.6 | User profile loads correctly | API GET /users/me | email=hcard360@gmail.com, plan=pro |

### 1.2 User State Verification
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 1.2.1 | Credits available | API GET /users/credits | credits_available >= 0 |
| 1.2.2 | Workspace exists | DB query workspaces | sandbox_id present, status=running |
| 1.2.3 | Plan type matches | API GET /users/me | plan_type=pro |

---

## Part 2: Workspace & Company Setup

### 2.1 Project (Domain) Management — Human Path
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 2.1.1 | List existing domains | API GET /company/domains | 200, array of domains |
| 2.1.2 | Create project "[E2E] Acme Corp" | API POST /company/domains `{name: "[E2E] Acme Corp", description: "AI-powered note-taking startup"}` | 201, domain with slug |
| 2.1.3 | Domain visible in UI sidebar | UI /inbox | "[E2E] Acme Corp" in left sidebar |
| 2.1.4 | Auto-created #general channel | API GET /company/domains | Domain has channel "general" |
| 2.1.5 | Project overview loads | API GET /company/domains/:id/overview | Returns project metadata |
| 2.1.6 | Create 2nd channel "#engineering" | API POST /company/domains/:id/channels `{name: "engineering", description: "Core product development"}` | 201, channel created |
| 2.1.7 | Create 3rd channel "#marketing" | API POST /company/domains/:id/channels `{name: "marketing", description: "Growth and content"}` | 201, channel created |
| 2.1.8 | Update channel description | API PATCH /company/channels/:id `{description: "Updated desc"}` | 200, description updated |
| 2.1.9 | Channels visible in inbox sidebar | UI /inbox | 3 channels nested under project |

### 2.2 Project Setup — Agent Path (via xerus-master)
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 2.2.1 | Agent creates project via chat | Chat: "Create a project called [E2E] Agent Project for our data team" | xerus-master creates domain via platform tools |
| 2.2.2 | Agent creates channel in project | Chat: "Add a #data-pipeline channel to [E2E] Agent Project" | Channel created, scaffolding generated |
| 2.2.3 | Verify scaffolding on sandbox | API/sandbox check | `projects/{slug}/channels/{channel}/CLAUDE.md` exists |

---

## Part 3: Agent Lifecycle

### 3.1 Browse & Import Marketplace Agents — Human Path
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 3.1.1 | List marketplace agents | API GET /agents/marketplace | Returns 14 agents across 7 categories |
| 3.1.2 | View marketplace agent detail | API GET /agents/:slug (maven-max) | Returns agent config, SOUL.md content |
| 3.1.3 | Clone "Maven Max" to workspace | API POST /agents/maven-max/clone | 201, agent registered in agent_registry |
| 3.1.4 | Clone "Wordsmith Wally" | API POST /agents/wordsmith-wally/clone | 201, registered |
| 3.1.5 | Clone "DataDog Dan" | API POST /agents/datadog-dan/clone | 201, registered |
| 3.1.6 | List my agents | API GET /agents/mine | Returns 3 cloned agents + any system agents |
| 3.1.7 | Agent detail page loads | UI /ai-agents/:id | Shows SOUL.md, description, channels |
| 3.1.8 | Agent visible in workspace grid | UI /workspace → agents tab | Card grid shows cloned agents |

### 3.2 Create Custom Agent — Human Path
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 3.2.1 | Create agent via API | API POST /agents `{name: "[E2E] Growth Hacker", slug: "e2e-growth-hacker", description: "Custom growth agent", model: "gemma-4-31b-it:free"}` | 201, agent created |
| 3.2.2 | Update agent config | API PATCH /agents/:id `{description: "Updated description"}` | 200, config updated |
| 3.2.3 | Agent appears in list | API GET /agents | Includes "e2e-growth-hacker" |

### 3.3 Create Agent — Agent Path (via xerus-master)
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 3.3.1 | Agent creates new agent via chat | Chat: "Create a research agent called [E2E] Insight Bot that specializes in market analysis" | xerus-master uses agent-creation skill to create agent |
| 3.3.2 | Verify agent files on sandbox | Sandbox check | `agents/e2e-insight-bot/SOUL.md` exists with personality |
| 3.3.3 | Agent registered in DB | DB check agent_registry | Slug "e2e-insight-bot" exists for user |

### 3.4 Agent Channel Assignment
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 3.4.1 | Assign Maven Max to #general | API POST /agents/:id/channels `{channelSlug: "general"}` | 200, assigned |
| 3.4.2 | Assign Wordsmith Wally to #marketing | API POST /agents/:id/channels `{channelSlug: "marketing"}` | 200, assigned |
| 3.4.3 | Assign DataDog Dan to #engineering | API POST /agents/:id/channels `{channelSlug: "engineering"}` | 200, assigned |
| 3.4.4 | Set Maven Max as lead of #general | API POST /agents/:id/channels/general/primary | 200, set as lead |
| 3.4.5 | List channel agents | API GET /company/channels/:id/agents | Returns assigned agents with roles |
| 3.4.6 | Remove agent from channel | API DELETE /agents/:id/channels/marketing | 200, removed |
| 3.4.7 | Re-assign after removal | API POST /agents/:id/channels `{channelSlug: "marketing"}` | 200, re-assigned |
| 3.4.8 | Channel agents visible in inbox UI | UI /inbox/[domain]/general | Agent avatars shown in header |

---

## Part 4: Knowledge & Skills

### 4.1 Knowledge Documents — Human Path
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 4.1.1 | Upload PDF to drive | API (workspace file upload) | File stored in drive/ |
| 4.1.2 | Upload markdown doc | API (workspace file upload) | File stored in drive/ |
| 4.1.3 | Upload CSV data file | API (workspace file upload) | File stored in drive/ |
| 4.1.4 | Upload image (PNG) | API (workspace file upload) | File stored in drive/ |
| 4.1.5 | Connect knowledge to agent | API POST /agents/:id/knowledge `{path: "drive/company-research.pdf"}` | Knowledge linked to agent |
| 4.1.6 | File browser shows uploads | UI /workspace → drive tab | All uploaded files visible |
| 4.1.7 | File content viewable | UI click file in drive | Editor/preview opens with content |

### 4.2 Skills — Human Path
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 4.2.1 | List available skills | API GET /skills | Returns marketplace + installed skills |
| 4.2.2 | View skill detail | API GET /skills/:slug | Returns SKILL.md content |
| 4.2.3 | Install skill to agent | API POST /skills/:slug/install | Skill installed |
| 4.2.4 | List skill files | API GET /skills/:slug/files | Returns file list |
| 4.2.5 | Uninstall skill | API DELETE /skills/:slug/install | Skill removed |
| 4.2.6 | Skills visible in UI | UI /skills | Skill cards rendered |
| 4.2.7 | Skill detail page | UI /skills/:slug | Shows description, files, install status |

### 4.3 Tools — Human Path
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 4.3.1 | List available tools (Pipedream) | API GET /tools | Returns tool/app list |
| 4.3.2 | View tool detail | API GET /tools/:slug | Returns tool schema |
| 4.3.3 | Assign tool to agent | API POST /agents/:id/tools `{appSlug: "firecrawl"}` | Tool assigned |
| 4.3.4 | List agent tools | API GET /agents/:id/tools | Returns assigned tools |
| 4.3.5 | Remove tool from agent | API DELETE /agents/:id/tools/:slug | Tool removed |
| 4.3.6 | Tools visible in UI | UI /tools | Tool cards rendered |

---

## Part 5: Chat — Direct Agent Conversation

### 5.1 Conversation CRUD
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 5.1.1 | Create new conversation | API POST /execute/conversations `{agent: "xerus-master"}` | 201, returns conversation ID |
| 5.1.2 | List conversations | API GET /execute/conversations | Array includes new conversation |
| 5.1.3 | Get conversation by ID | API GET /execute/conversations/:id | Returns conversation with metadata |
| 5.1.4 | Rename conversation | API PATCH /execute/conversations/:id `{title: "[E2E] Test Chat"}` | 200, title updated |
| 5.1.5 | Delete conversation | API DELETE /execute/conversations/:id | 200, soft-deleted |

### 5.2 Chat Plumbing — SSE & Message Flow
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 5.2.1 | Send simple text message | API POST /execute/conversations/:id/messages `{content: "Hello"}` | 202 Accepted (async) |
| 5.2.2 | SSE token issued for stream | API POST /execute/sse-token | Returns ephemeral token |
| 5.2.3 | SSE stream connects | API GET /execute/conversations/:id/stream | Connection opens, events flow |
| 5.2.4 | agent_message event received | Listen on SSE stream | Event with `type: "agent_message"`, non-empty `content` |
| 5.2.5 | tool_use events received | Listen on SSE stream (complex query) | Event with `type: "tool_use"`, tool name + args |
| 5.2.6 | session_complete event | Listen until done | Event with `type: "session_complete"` or stream closes |
| 5.2.7 | Conversation history preserved | API GET /execute/conversations/:id | Messages array has user + agent messages in order |

### 5.3 Chat UI Chrome
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 5.3.1 | Message input renders | UI /chat | Composer input visible, placeholder text |
| 5.3.2 | Agent selector works | UI /chat | Dropdown lists xerus-master + cloned agents |
| 5.3.3 | Streaming text animation | UI send message | Response streams character-by-character, not block |
| 5.3.4 | Tool use displayed in UI | UI send complex query | Tool calls shown as collapsible cards |
| 5.3.5 | Conversation persists on reload | UI reload /chat?c=:id | Same conversation loads with full history |
| 5.3.6 | New conversation button | UI click new chat | Fresh conversation starts, old one in sidebar |
| 5.3.7 | Conversation list in sidebar | UI /chat | Previous conversations listed with titles |

### 5.4 Agent Behavior: Session Lifecycle

These scenarios verify that the agent's session hooks, context loading, and operational protocol work correctly.

| # | Scenario | Prompt | Expected Agent Behavior | Verification |
|---|----------|--------|------------------------|--------------|
| 5.4.1 | **Session start hook fires** | Any message to xerus-master | `session-start.sh` runs: initializes DBs, starts scheduler daemon, generates `.task-context.md` | Check sandbox: `.memory/agents/xerus-master/.task-context.md` exists after execution |
| 5.4.2 | **Task context loaded** | "What are your current tasks?" | Agent reads `.task-context.md` and reports status (READY/BLOCKED/IDLE/NO TASKS) | Response mentions task status classification, not a hallucination |
| 5.4.3 | **SOP followed — context gathering** | "What do you know about this workspace?" | Agent reads `CLAUDE.md`, `drive/company.md`, `.memory/agents/xerus-master/working.md` | Response references actual workspace structure, company vision, not generic filler |
| 5.4.4 | **Session end persists state** | Complete any chat session | `session-end.sh` fires: writes `working.md` summary, updates `expertise.md`, git-commits `.memory/` | Check sandbox: `working.md` updated with session summary, `.memory/.git` has new commit |

### 5.5 Agent Behavior: Memory Read & Write

| # | Scenario | Prompt | Expected Agent Behavior | Verification |
|---|----------|--------|------------------------|--------------|
| 5.5.1 | **Memory write — working.md** | "Remember that our target market is solo entrepreneurs who take meeting notes" | Agent writes this fact to `.memory/agents/xerus-master/working.md` or `.memory/company/vision.md` | Read sandbox file: contains "solo entrepreneurs" / "meeting notes" |
| 5.5.2 | **Memory read — cross-session recall** | (New session) "What did I tell you about our target market?" | Agent reads `.memory/` files, finds the persisted fact from 5.5.1 | Response includes "solo entrepreneurs" without re-prompting the fact |
| 5.5.3 | **User preference persistence** | "I prefer bullet-point summaries, not paragraphs. Keep replies under 200 words." | Agent writes to `.memory/user/preferences.md` | Read file: contains communication preferences |
| 5.5.4 | **Preference honored in response** | (New session) "Give me a market overview for AI note-taking" | Agent reads `preferences.md`, responds with bullet points, under 200 words | Response format matches stored preferences |
| 5.5.5 | **Entity memory — company** | "Our main competitor is Notion AI. They raised $200M and have 30M users." | Agent creates `.memory/entities/companies/notion-ai.md` with structured profile, INSERTs to `company.db` competitors table | File exists with backlinks; DB row exists |
| 5.5.6 | **Entity memory — recall** | "What do we know about Notion AI?" | Agent reads entity file, responds with stored facts | Response includes "$200M", "30M users" from persisted data |
| 5.5.7 | **Expertise tracking** | After 3+ sessions involving research tasks | `expertise.md` updated with learned patterns (e.g., "skilled at market research, competitor analysis") | Read file: contains skill entries |

### 5.6 Agent Behavior: Skill Invocation

| # | Scenario | Prompt | Expected Agent Behavior | Verification |
|---|----------|--------|------------------------|--------------|
| 5.6.1 | **data-steward — 3-layer persist** | "Research the top 3 AI note-taking apps and store the findings" | Agent follows data-steward protocol: (1) writes to `data/company.db` research_reports, (2) creates `.memory/entities/products/` files for each app, (3) INSERTs entity_registry rows | DB has research_reports row; entity files exist with backlinks |
| 5.6.2 | **channel-manager — standup** | (In channel context) "Run a standup for #general" | Agent reads `output/posts.jsonl`, gathers recent activity, reports completed/in-progress/blocked per team member | Response includes structured standup: what's done, what's active, blockers |
| 5.6.3 | **agent-creation — create agent** | "Create a social media agent called BuzzBot that monitors Twitter and Reddit for brand mentions" | Agent invokes agent-creation skill: generates SOUL.md (personality), system-prompt.md (goals/constraints), HEARTBEAT.md (schedules), STATUS.md, BOOTSTRAP.md, RELATIONSHIPS.md | 6 files created in `agents/buzzbot/`; agent registered in workspace.db |
| 5.6.4 | **agent-creation — soul quality** | Inspect the SOUL.md from 5.6.3 | SOUL.md has: identity section, character traits, tone/voice, expertise areas — not a generic template fill | SOUL.md is >200 words, mentions Twitter/Reddit monitoring, has unique personality |
| 5.6.5 | **workspace-sync — detect drift** | Add an agent via API but don't scaffold files, then ask "Sync the workspace" | Agent detects drift between DB and filesystem, creates missing files | Missing agent files scaffolded, `.claude/agents/{slug}.md` subagent definition written |
| 5.6.6 | **housekeeping — post-task cleanup** | After task completion, check workspace state | Agent cleans old scratch files, rotates activity log if oversized, verifies data integrity | No stale files in scratch/; activity.jsonl within size limit |

### 5.7 Agent Behavior: Delegation & Multi-Agent Coordination

| # | Scenario | Prompt | Expected Agent Behavior | Verification |
|---|----------|--------|------------------------|--------------|
| 5.7.1 | **Master delegates to specialist** | "Research AI note-taking market trends and write a blog post about them" | xerus-master delegates: (1) research → Maven Max, (2) writing → Wordsmith Wally. Does NOT do the work itself. | SSE stream shows delegation events; subagent tasks created in channel |
| 5.7.2 | **Delegation respects policy** | Same as above | Master follows DELEGATION_POLICY.md: max depth 3, max concurrent 5, includes full context for subagent | No circular delegation; subagent receives enough context to work independently |
| 5.7.3 | **Cross-channel coordination** | "Have the marketing team write content about the engineering team's latest feature" | Master writes coordination message to marketing channel's `output/posts.jsonl` with `message_type: "coordination"`, `target_agent: "wordsmith-wally"` | posts.jsonl in marketing channel has coordination entry |
| 5.7.4 | **Agent refuses out-of-scope work** | Ask Maven Max (researcher) to "deploy the application to production" | Agent recognizes this is outside its role/capabilities, declines or escalates to xerus-master | Response says "this is outside my scope" or delegates upward |
| 5.7.5 | **Budget inheritance** | Check delegation chain budget | Subagent inherits 50% of parent's remaining budget per DELEGATION_POLICY | Execution session metadata shows correct budget cap |

### 5.8 Agent Behavior: Heartbeat & Scheduling

| # | Scenario | Prompt | Expected Agent Behavior | Verification |
|---|----------|--------|------------------------|--------------|
| 5.8.1 | **Register heartbeat schedules** | Create an agent with HEARTBEAT.md containing "daily 9:00 am: Check inbox and triage tasks" | `register-heartbeat-schedules.py` parses HEARTBEAT.md, INSERTs cron expression `0 9 * * *` into `workspace.db` heartbeat_schedules table | DB row: agent_slug, cron_expression = `0 9 * * *`, task_description |
| 5.8.2 | **Scheduler daemon running** | Check after session start | Scheduler daemon started by session-start.sh, polls every 30s | PID file exists at `.xerus/runner/scheduler.pid`; process alive |
| 5.8.3 | **Schedule creation via chat** | "Schedule Maven Max to run a market scan every Monday at 10am" | Agent creates schedule entry in workspace.db: `0 10 * * 1` for maven-max | DB has schedule row with correct cron + agent slug |
| 5.8.4 | **Schedule list** | "What schedules are active?" | Agent queries workspace.db heartbeat_schedules, reports all active schedules with next_run_at | Response lists schedules with human-readable times |
| 5.8.5 | **Stale run detection** | If a scheduled run's PID is dead | Scheduler's `reapStaleRuns()` marks it as `failed` | schedule_runs row: status = `failed`, error = "Process exited unexpectedly" |
| 5.8.6 | **Schedule CRUD** | "Cancel Maven Max's Monday scan" / "Change it to Wednesdays" | Agent updates/deletes schedule in workspace.db | DB reflects change; old schedule gone or cron updated |

### 5.9 Agent Behavior: Tool Use & Platform Tools

| # | Scenario | Prompt | Expected Agent Behavior | Verification |
|---|----------|--------|------------------------|--------------|
| 5.9.1 | **File read tool** | "Read the company.md file" | Agent uses Read tool on `drive/company.md`, returns content | SSE shows tool_use event for Read; response includes file content |
| 5.9.2 | **File write tool** | "Write a competitive analysis to drive/competitor-analysis.md" | Agent uses Write tool, creates file in drive/ | File exists on sandbox with meaningful content |
| 5.9.3 | **Bash tool — non-destructive** | "List all files in the agents directory" | Agent uses Bash: `ls agents/` or `find agents/ -type f` | Response includes file listing; no write operations |
| 5.9.4 | **WebSearch tool** | "Search for recent AI note-taking app funding rounds" | Agent uses WebSearch, synthesizes results | SSE shows tool_use for WebSearch; response includes sourced findings |
| 5.9.5 | **Pre-tool-use hook — boundary enforcement** | Agent tries to write outside its channel | pre-tool-use.sh blocks the write | Agent receives block message, adjusts approach |
| 5.9.6 | **Post-tool-use tracking** | Any Write/Edit operation | post-tool-use.sh logs to `data/activity.jsonl` | Activity log has entry with timestamp, file path, agent slug |
| 5.9.7 | **Platform MCP — query_memory** | "Search my memory for anything about competitors" | Agent calls `query_memory` MCP tool with semantic search | Response includes relevant memories from pgvector search |
| 5.9.8 | **Platform MCP — send_notification** | Agent completes a significant task | Agent calls `send_notification` to alert user | Inbox item created with notification type |

### 5.10 Agent Behavior: HITL (Human-in-the-Loop) Approval

| # | Scenario | Prompt | Expected Agent Behavior | Verification |
|---|----------|--------|------------------------|--------------|
| 5.10.1 | **Approval request posted** | "Delete all files in the scratch directory" (destructive op) | Agent recognizes HITL-required action, writes to `.hitl_pending/{id}.json`, pauses execution | SSE event: `approval_request` with action description |
| 5.10.2 | **Approval UI renders** | Observe UI after approval request | Frontend shows [Approve] [Reject] buttons on the message | Buttons visible, clickable |
| 5.10.3 | **Approve → execution continues** | Click [Approve] | API POST /execute/:id/respond `{decision: "approve"}`, agent resumes from pause point, completes action | File approved for `.hitl_approved/`, agent continues, action executes |
| 5.10.4 | **Reject → graceful stop** | Click [Reject] on a different request | Agent receives rejection, acknowledges, does NOT execute the action | Agent response: "Understood, cancelling the operation" |
| 5.10.5 | **Timeout behavior** | Don't respond to approval request for extended period | Agent stays paused, does not proceed without approval | No action taken; execution session shows status = `paused` |

---

## Part 6: Inbox — Channel Communication

### 6.1 Channel Message Plumbing
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 6.1.1 | Post message to #general | API POST /company/channels/:id/messages `{content: "Team, let's plan our Q3 OKRs", sender_type: "user"}` | 201, message stored in workspace.db |
| 6.1.2 | Message stored in channel_messages | DB check workspace.db | Row with sender_type=user, content matches |
| 6.1.3 | Get channel message history | API GET /company/channels/:id/messages | Returns paginated messages, newest first |
| 6.1.4 | Message appears in activity feed | UI /inbox/[domain]/general → Activity tab | Message visible with user avatar |

### 6.2 Inbox Items & SSE
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 6.2.1 | Get SSE token | API POST /inbox/sse-token | Returns ephemeral token (short-lived) |
| 6.2.2 | SSE stream connects | API GET /inbox/sse?token=:token | Connection opens, keep-alive pings |
| 6.2.3 | List inbox items | API GET /inbox | Returns items with status (unread/read/actioned/archived) |
| 6.2.4 | Mark item as read | API PATCH /inbox/:itemId/read | Status changes to `read` |
| 6.2.5 | Archive item | API PATCH /inbox/:itemId/archive | Item archived, no longer in default list |
| 6.2.6 | Real-time inbox push | Post message → listen SSE | SSE fires event within seconds of message post |

### 6.3 Inbox UI Navigation
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 6.3.1 | Sidebar shows projects | UI /inbox | Left sidebar with project tree |
| 6.3.2 | Expand project shows channels | UI click project | Channels nested underneath with count badges |
| 6.3.3 | Click channel loads view | UI click #general | Activity tab loads with messages |
| 6.3.4 | Tab switching works | UI click Tasks / Activity / Deliverables | Content switches per tab |
| 6.3.5 | Agent avatars in channel header | UI channel view | Assigned agents shown with colored mascots |
| 6.3.6 | Blank state for empty channel | UI click new empty channel | Helpful prompt to add agents / post first message |

### 6.4 Agent Behavior: Channel Lead Responds

When a human posts in a channel, the channel **lead agent** should respond following the full operational protocol.

| # | Scenario | Prompt (posted to channel) | Expected Agent Behavior | Verification |
|---|----------|---------------------------|------------------------|--------------|
| 6.4.1 | **Lead agent auto-responds** | "Team, what's our status on the Q3 marketing plan?" | Channel lead (assigned as primary) wakes, reads channel context (CLAUDE.md, recent messages), responds with status summary | SSE delivers agent_message within timeout; sender = lead agent slug |
| 6.4.2 | **Lead reads channel CLAUDE.md** | "What are this channel's goals?" | Lead reads `projects/{domain}/channels/{channel}/CLAUDE.md` and responds with actual channel mission/OKRs | Response matches CLAUDE.md content, not a hallucination |
| 6.4.3 | **Lead reads recent posts** | "Summarize what the team has been working on" | Lead reads `output/posts.jsonl` (last N entries), synthesizes activity summary | Response references actual recent posts, agent names, deliverables |
| 6.4.4 | **Lead posts to output/posts.jsonl** | Any lead response | Lead writes its response to `output/posts.jsonl` as `message_type: "post"` | File on sandbox has new JSONL entry with agent_slug, content, timestamp |
| 6.4.5 | **Non-lead stays silent** | Post generic message (no @mention) | Only the lead agent responds, other assigned agents do NOT wake | Only 1 agent_message event in SSE; non-lead agents idle |

### 6.5 Agent Behavior: @Mention Routing

| # | Scenario | Prompt (posted to channel) | Expected Agent Behavior | Verification |
|---|----------|---------------------------|------------------------|--------------|
| 6.5.1 | **@mention overrides lead** | "@wordsmith-wally write a 500-word blog intro about AI note-taking" | Wordsmith Wally wakes (not lead), reads its SOUL.md (content creator identity), writes blog content | Response from wordsmith-wally, not from lead agent |
| 6.5.2 | **@mention with context** | "@maven-max what are the latest trends in productivity apps?" | Maven Max wakes, reads its expertise.md + .memory/ for prior research, performs research | Response includes research-grade analysis, cites sources if available |
| 6.5.3 | **@mention agent not in channel** | "@nonexistent-agent do something" | Message posted but no agent responds (or lead responds saying agent not found) | No agent_message from nonexistent-agent; graceful handling |
| 6.5.4 | **Multiple @mentions** | "@maven-max research competitors, @wordsmith-wally draft the summary" | Both agents wake sequentially or in parallel; each handles their part | Two agent responses, each from the correct agent |

### 6.6 Agent Behavior: Channel Coordination & Cross-Channel

| # | Scenario | Prompt (posted to channel) | Expected Agent Behavior | Verification |
|---|----------|---------------------------|------------------------|--------------|
| 6.6.1 | **Coordination message to teammate** | (In #general) "Have the marketing team prepare a launch announcement" | Lead agent writes coordination message to #marketing channel's `output/posts.jsonl` with `message_type: "coordination"`, `target_agent` in metadata | posts.jsonl in marketing channel has coordination entry; marketing lead wakes on next cycle |
| 6.6.2 | **Cross-channel task creation** | "Create a task for the engineering team to build the API" | Agent creates task in #engineering channel, assigns to appropriate agent | Task appears in engineering channel's Tasks tab |
| 6.6.3 | **Escalation to master** | Agent encounters blocker it can't resolve | Agent writes `metadata.requires_approval: true` or coordination message to master | Inbox item created; master notified |
| 6.6.4 | **Channel standup — data-driven** | "Run the weekly standup" | Lead uses channel-manager skill: reads posts.jsonl, gathers completed/in-progress/blocked, checks OKRs against CLAUDE.md metrics | Structured standup: tasks done, active work, blockers, OKR progress percentages |
| 6.6.5 | **Deliverable posted** | Agent completes a writing task | Agent writes file to `output/deliverables/{filename}`, posts message with `deliverable: true` metadata | File visible in Deliverables tab; message indicates deliverable |

### 6.7 Agent Behavior: Memory & Context in Channel Responses

| # | Scenario | Prompt (posted to channel) | Expected Agent Behavior | Verification |
|---|----------|---------------------------|------------------------|--------------|
| 6.7.1 | **Agent remembers channel history** | (After several messages) "What did we discuss earlier about our target market?" | Agent reads `.memory/` + channel message history, recalls prior conversation | Response references earlier messages accurately |
| 6.7.2 | **Agent reads company goals** | "How does our channel work align with company goals?" | Agent reads `drive/company.md` (company vision) + channel CLAUDE.md (channel goals), connects them | Response maps channel OKRs to company mission |
| 6.7.3 | **Working memory persists across channel sessions** | (First session) Discuss strategy. (Second session) "Continue where we left off" | Agent reads `working.md` from previous session, resumes context | Response picks up from prior discussion without re-explaining |
| 6.7.4 | **Handoff between shifts** | Agent session ends, new session starts later | session-end writes handoff to `.channel/state/handoffs/{timestamp}.md`; next session reads it | Handoff file exists; new session references prior shift's key decisions |

### 6.8 Agent Behavior: Data Steward Protocol in Channels

| # | Scenario | Prompt (posted to channel) | Expected Agent Behavior | Verification |
|---|----------|---------------------------|------------------------|--------------|
| 6.8.1 | **Research → 3-layer persist** | "Research the top 5 productivity apps and store findings" | Agent follows data-steward: (1) INSERT `research_reports` in company.db, (2) create `.memory/entities/products/` files per app, (3) INSERT `entity_registry` rows | All 3 layers populated; entity files have [[backlinks]] |
| 6.8.2 | **Metrics tracking** | "Track our weekly active users: 1,200 this week" | Agent INSERTs `metrics` row in company.db (metric_name, value, period) | DB has metrics row; dashboard data updated |
| 6.8.3 | **Entity recall from DB** | "What competitors have we researched?" | Agent queries company.db `competitors` table + `.memory/entities/companies/` | Response lists stored competitors with details from both sources |
| 6.8.4 | **Dashboard data generation** | After task completion | Agent writes `data/dashboard/{agent_slug}.json` with session stats | JSON file exists with task count, files written, session duration |

### 6.9 Agent Behavior: Heartbeat-Driven Channel Activity

| # | Scenario | Setup | Expected Agent Behavior | Verification |
|---|----------|-------|------------------------|--------------|
| 6.9.1 | **Scheduled standup fires** | Register heartbeat: "daily 9:00 am: Run channel standup" | At scheduled time, scheduler spawns agent session with standup prompt; agent reads channel state, posts standup to posts.jsonl | schedule_runs row: status = `succeeded`; new post in posts.jsonl |
| 6.9.2 | **Scheduled data collection** | Register: "every 6 hours: Check for new data and update reports" | Scheduler fires, agent checks data sources, updates company.db | New data rows if sources changed; activity.jsonl logged |
| 6.9.3 | **Idle agent follows HEARTBEAT.md** | Agent has no assigned tasks (IDLE state) | On wake, agent reads HEARTBEAT.md for self-prompted work (e.g., "review recent research for staleness") | Agent performs proactive work from heartbeat checklist |
| 6.9.4 | **Heartbeat evolves trust** | After 5+ successful automated runs | Agent's HEARTBEAT.md trust level noted; STATUS.md updated with track record | STATUS.md shows increased trust/confidence metrics |

---

## Part 7: Tasks & Kanban

### 7.1 Task CRUD — Human Path
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 7.1.1 | Create task in channel | API POST /company/channels/:id/tasks `{title: "[E2E] Research competitors", description: "Analyze top 5 AI note apps", assignee_agent_slug: "maven-max"}` | 201, task created |
| 7.1.2 | Create task with priority | API POST tasks `{title: "[E2E] Write blog post", priority: "high", assignee_agent_slug: "wordsmith-wally"}` | 201, priority set |
| 7.1.3 | List channel tasks | API GET /company/channels/:id/tasks | Returns task list |
| 7.1.4 | Get task by ID | API GET /company/tasks/:id | Returns full task detail |
| 7.1.5 | Update task status | API POST /company/tasks/:id/status `{status: "in_progress"}` | Status updated |
| 7.1.6 | Update task details | API PATCH /company/tasks/:id `{description: "Updated scope"}` | 200, updated |
| 7.1.7 | Tasks visible in Kanban | UI /inbox/[domain]/general → Tasks tab | Kanban columns show tasks in correct columns |
| 7.1.8 | List all user tasks | API GET /company/tasks | Returns cross-channel tasks |
| 7.1.9 | Get channel deliverables | API GET /company/channels/:id/deliverables | Returns deliverable files |

### 7.2 Task Lifecycle — Agent Execution

| # | Scenario | Setup | Expected Agent Behavior | Verification |
|---|----------|-------|------------------------|--------------|
| 7.2.1 | **Task context generated** | Create task assigned to Maven Max, trigger session | `generate-task-context.py` scans `.beads/issues.jsonl`, writes `.task-context.md` with status READY | .task-context.md shows task title, description, acceptance criteria |
| 7.2.2 | **Agent reads task and executes** | Task: "Research top 3 AI note apps" | Agent reads .task-context.md, performs research, writes findings to scratch/ or deliverables/ | Files created; research content is substantive |
| 7.2.3 | **Agent creates deliverable** | Task requires output file | Agent writes to `output/deliverables/{filename}` | File appears in deliverables tab via API GET /deliverables |
| 7.2.4 | **Agent closes task with bd** | Agent finishes work | Agent runs `bd close {task_id}` — pre-tool-use.sh validates deliverable exists and meets size | Task status changes to "done"; beads issue closed |
| 7.2.5 | **Blocked task — dependency chain** | Task B depends on Task A (not done) | .task-context.md marks Task B as BLOCKED; agent reports "blocked on {task_a}" and skips | Agent does NOT attempt blocked work; reports blocker |
| 7.2.6 | **Task delegation by master** | "Break down the launch plan into tasks for each team" | xerus-master creates subtasks, assigns to appropriate agents per channel | Multiple tasks created across channels with correct assignees |
| 7.2.7 | **Kanban board reflects status** | Tasks in various states | UI Tasks tab shows tasks in To Do / In Progress / Review / Done columns | Visual verification of Kanban state |

---

## Part 8: Company Goals & Bootstrapping

### 8.1 Company Vision Setup
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 8.1.1 | drive/company.md exists | Sandbox file check | Template company doc present |
| 8.1.2 | Update company vision via chat | Chat to xerus-master: "Our company builds AI-powered note-taking. Our Q3 goal is 10K users. Update the company goals." | Master updates drive/company.md |
| 8.1.3 | Company doc reflects changes | Read drive/company.md | Contains AI note-taking vision, 10K user goal |

### 8.2 Workspace Bootstrap Validation
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 8.2.1 | Root CLAUDE.md exists | Sandbox check | SOP present with session protocol, memory protocol, communication contract |
| 8.2.2 | .memory/ directory initialized | Sandbox check | Structure: agents/, user/, company/, entities/, shared/, archive/, index.md |
| 8.2.3 | data/workspace.db exists | Sandbox check | SQLite DB with agents, channels, heartbeat_schedules tables |
| 8.2.4 | data/company.db exists | Sandbox check | SQLite DB with research_reports, competitors, metrics tables |
| 8.2.5 | .xerus/ runtime present | Sandbox check | Runner (scheduler.ts, adapters/), templates/, IPC server |
| 8.2.6 | .claude/hooks/scripts/ populated | Sandbox check | 25 hook scripts: session-start.sh, session-end.sh, pre-tool-use.sh, etc. |
| 8.2.7 | .claude/skills/ populated | Sandbox check | 40+ skills including data-steward, channel-manager, agent-creation |
| 8.2.8 | .claude/rules/ present | Sandbox check | DELEGATION_POLICY.md, ROLE_CAPABILITIES.md, TOOL_AUTHORIZATION.md, TOOL_GUIDE.md |
| 8.2.9 | System agents registered | DB check agent_registry | xerus-master present for user |
| 8.2.10 | Marketplace submodules | Sandbox check | marketplace/agents/ and marketplace/skills/ directories |

### 8.3 Full Bootstrap — "Paperclip" Zero-Person Company Pattern

This is the capstone test: xerus-master sets up an entire company from a single instruction, demonstrating the CEO-delegates-to-department-heads pattern from Paperclip.

| # | Scenario | Prompt / Action | Expected Agent Behavior | Verification |
|---|----------|----------------|------------------------|--------------|
| 8.3.1 | **Company setup instruction** | Chat: "Set up Acme Notes as a zero-person company. We build AI note-taking for solo entrepreneurs. Goal: 10K users in 3 months. Create Engineering and Marketing departments with channels and hire appropriate agents." | Master follows BOOTSTRAP.md protocol: reads company.md template, asks clarifying questions or proceeds with provided info | Agent begins structured setup, not generic response |
| 8.3.2 | **Company vision documented** | (Verify after 8.3.1) | Master writes `drive/company.md` with: mission, target market (solo entrepreneurs), goal (10K users / 3 months), OKRs | File has structured vision doc, not template placeholders |
| 8.3.3 | **Projects created** | (Verify) | Master creates 2 projects: Engineering + Marketing (via platform tools) | API GET /company/domains returns both |
| 8.3.4 | **Channels populated** | (Verify) | Engineering: #general, #backend, #frontend. Marketing: #general, #content, #growth (or similar logical split) | Each project has 2-4 channels |
| 8.3.5 | **Channel CLAUDE.md scaffolded** | (Verify) | Each channel has CLAUDE.md with: mission, team, OKRs tied to company goals | Files on sandbox have meaningful content per channel |
| 8.3.6 | **Agents hired and assigned** | (Verify) | Master clones/creates appropriate agents: researchers → marketing, data → engineering. Each assigned to relevant channel | API GET /agents/mine shows new agents; channel agent lists populated |
| 8.3.7 | **Lead agents set** | (Verify) | Each channel has a primary agent designated | API GET /channels/:id/agents shows `is_primary: true` for one agent per channel |
| 8.3.8 | **Heartbeats registered** | (Verify) | Created agents have HEARTBEAT.md with scheduled tasks; schedules registered in workspace.db | heartbeat_schedules table has entries for each agent |
| 8.3.9 | **Memory initialized** | (Verify) | .memory/agents/{slug}/ directories created for each agent with working.md, expertise.md | Directories and base files exist |
| 8.3.10 | **Master reports structure** | Chat: "Give me an overview of our company structure" | Master queries workspace state, reports: projects, channels, agents, schedules in structured format | Response accurately lists the full org chart |
| 8.3.11 | **Agent can work immediately** | Post to a channel: "Start working on competitor analysis" | Assigned agent wakes, reads channel context + company.md, begins meaningful work | Agent response shows it understands the company context and channel mission |

---

## Part 9: Execution & Agent Operations

### 9.1 Execution Sessions
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 9.1.1 | List execution sessions | API GET /execute/sessions | Returns session history |
| 9.1.2 | SSE token for execution | API POST /execute/sse-token | Returns token |
| 9.1.3 | Execution stream works | API GET /execute/conversations/:id/stream | SSE events flow |

### 9.2 Agent Execution Validation
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 9.2.1 | Agent uses free model | DB check execution_sessions | model = gemma-4-31b-it:free |
| 9.2.2 | No credits deducted for free model | DB check credit_transactions | No deductions for free model runs |
| 9.2.3 | Agent response is coherent | Parse SSE response | Meaningful text, not error/gibberish |
| 9.2.4 | Agent session completes | DB check | Session status = completed |

---

## Part 10: Settings & Configuration

### 10.1 User Settings
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 10.1.1 | Settings page loads | UI /settings | Profile form visible |
| 10.1.2 | Update display name | API PATCH /users/me `{display_name: "[E2E] Test User"}` | 200, name updated |
| 10.1.3 | Models page loads | UI /settings/models | Model list visible |
| 10.1.4 | Model list from API | API GET /models | Returns available models including Gemma free |
| 10.1.5 | Billing page loads | UI /settings/billing | Subscription info visible |
| 10.1.6 | Get subscription status | API GET /billing/subscription | Returns plan details |
| 10.1.7 | API keys page loads | UI /settings/api-keys | Key management UI visible |
| 10.1.8 | Workspace settings loads | UI /settings/workspace | Workspace info visible |

### 10.2 Model Registry
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 10.2.1 | Free models available | API GET /models (filter free) | Gemma 4 31B free, Gemma 4 26B free listed |
| 10.2.2 | Model detail | API GET /models/google/gemma-4-31b-it:free | Returns full model spec |

---

## Part 11: Edge Cases & Error Handling

### 11.1 Negative Tests
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 11.1.1 | Create duplicate domain name | API POST /company/domains same name | 409 or validation error |
| 11.1.2 | Access other user's agent | API GET /agents/:other-user-id | 403 or 404 |
| 11.1.3 | Invalid agent slug on clone | API POST /agents/nonexistent/clone | 404 |
| 11.1.4 | Message to non-existent conversation | API POST /execute/conversations/fake-id/messages | 404 |
| 11.1.5 | Empty message content | API POST messages `{content: ""}` | 400 validation error |
| 11.1.6 | Create channel without domain | API POST /company/domains/fake/channels | 404 |
| 11.1.7 | Assign agent to non-existent channel | API POST /agents/:id/channels `{channelSlug: "fake"}` | 404 |

### 11.2 Rate Limiting
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 11.2.1 | Rapid domain creation | API POST /company/domains x10 fast | 429 after limit |
| 11.2.2 | Rapid message sending | API POST messages x20 fast | 429 after limit |

---

## Part 12: Cleanup

### 12.1 Test Data Removal
| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 12.1.1 | Delete test agents | API DELETE /agents/:id for each [E2E] agent | All removed |
| 12.1.2 | Delete test conversations | API DELETE /conversations/:id for each [E2E] | All removed |
| 12.1.3 | Delete test domains | Cleanup via DB | All [E2E] prefixed domains removed |
| 12.1.4 | Restore display name | API PATCH /users/me `{display_name: "HealthCard 360"}` | Original name restored |
| 12.1.5 | Verify clean state | API GET /agents/mine, /company/domains | No [E2E] remnants |

---

## Execution Order

The tests should run in this sequence (dependencies flow top-down):

```
Phase 1: Foundation
  1.1 Auth → 1.2 User State

Phase 2: Structure
  2.1 Create Projects/Channels (Human)
  2.2 Create Projects/Channels (Agent)

Phase 3: Agents
  3.1 Browse/Clone Marketplace → 3.2 Create Custom
  3.3 Agent Creates Agent → 3.4 Channel Assignment

Phase 4: Knowledge & Skills
  4.1 Upload Knowledge → 4.2 Install Skills → 4.3 Assign Tools

Phase 5: Chat (CRUD → Plumbing → UI → Behavioral)
  5.1 Conversation CRUD
  5.2 SSE & Message Flow
  5.3 Chat UI Chrome
  5.4 Session Lifecycle Behavior
  5.5 Memory Read/Write Behavior
  5.6 Skill Invocation Behavior
  5.7 Delegation & Multi-Agent
  5.8 Heartbeat & Scheduling
  5.9 Tool Use & Platform Tools
  5.10 HITL Approval Flow

Phase 6: Inbox (Plumbing → UI → Behavioral)
  6.1 Channel Message Plumbing
  6.2 Inbox Items & SSE
  6.3 Inbox UI Navigation
  6.4 Channel Lead Response Behavior
  6.5 @Mention Routing Behavior
  6.6 Cross-Channel Coordination
  6.7 Memory & Context in Channels
  6.8 Data Steward Protocol
  6.9 Heartbeat-Driven Channel Activity

Phase 7: Tasks
  7.1 Task CRUD → 7.2 Agent Task Execution Lifecycle

Phase 8: Company Bootstrap
  8.1 Vision Setup → 8.2 Workspace Validation (10 checks)
  8.3 Full Paperclip Pattern (11 scenarios)

Phase 9: Execution
  9.1 Sessions → 9.2 Agent Validation

Phase 10: Settings
  10.1 UI & API → 10.2 Models

Phase 11: Edge Cases
  11.1 Negative → 11.2 Rate Limits

Phase 12: Cleanup
```

---

## Test Categories

| Category | Count | Requires Sandbox | Requires Agent Execution |
|----------|-------|-----------------|-------------------------|
| **Auth & User** | 9 | No | No |
| **Projects/Channels** | 12 | Yes (scaffolding) | Optional |
| **Agent Lifecycle** | 19 | Yes | Some |
| **Knowledge/Skills/Tools** | 12 | Yes | No |
| **Chat — CRUD & Plumbing** | 12 | Yes | Yes |
| **Chat — UI Chrome** | 7 | Yes | No |
| **Chat — Session Lifecycle** | 4 | Yes | Yes |
| **Chat — Memory Behavior** | 7 | Yes | Yes |
| **Chat — Skill Invocation** | 6 | Yes | Yes |
| **Chat — Delegation** | 5 | Yes | Yes |
| **Chat — Heartbeat/Scheduling** | 6 | Yes | Yes |
| **Chat — Tool Use & Platform** | 8 | Yes | Yes |
| **Chat — HITL Approval** | 5 | Yes | Yes |
| **Inbox — Plumbing & UI** | 12 | Yes | Yes |
| **Inbox — Lead Response** | 5 | Yes | Yes |
| **Inbox — @Mention Routing** | 4 | Yes | Yes |
| **Inbox — Cross-Channel** | 5 | Yes | Yes |
| **Inbox — Memory in Channels** | 4 | Yes | Yes |
| **Inbox — Data Steward** | 4 | Yes | Yes |
| **Inbox — Heartbeat Activity** | 4 | Yes | Yes |
| **Tasks & Kanban** | 16 | Yes | Yes |
| **Company Bootstrap** | 24 | Yes | Yes |
| **Execution Validation** | 4 | Yes | Yes |
| **Settings & Models** | 10 | No | No |
| **Edge Cases** | 9 | No | No |
| **Cleanup** | 5 | No | No |
| **TOTAL** | **~212** | | |

### Behavioral Scenario Breakdown

| Behavioral Area | Scenarios | What They Prove |
|----------------|-----------|-----------------|
| **Session Protocol** | 5.4.x (4) | Hooks fire, context loads, state persists between sessions |
| **Memory System** | 5.5.x + 6.7.x (11) | Read/write/recall works across sessions, entities persist, handoffs work |
| **Skill Execution** | 5.6.x + 6.8.x (10) | data-steward 3-layer, channel-manager standup, agent-creation soul files |
| **Delegation** | 5.7.x + 6.6.x (10) | Master delegates, cross-channel coord, escalation, scope enforcement |
| **Heartbeat/Scheduling** | 5.8.x + 6.9.x (10) | Cron registration, scheduler daemon, idle agent behavior, schedule CRUD |
| **Tool Use** | 5.9.x (8) | File ops, WebSearch, pre/post hooks, boundary enforcement, MCP tools |
| **HITL** | 5.10.x (5) | Approval request → pause → approve/reject → resume/stop |
| **Channel Behavior** | 6.4.x + 6.5.x (9) | Lead auto-response, @mention routing, non-lead silence, multi-mention |
| **Paperclip Pattern** | 8.3.x (11) | Full company setup from single instruction, org chart, agents hired |
| **TOTAL BEHAVIORAL** | **~78** | |

---

## Prerequisites

1. **Backend running** on port 5001
2. **Frontend running** on port 3002
3. **Daytona sandbox** active for test user
4. **Firebase service account** at `e2e/xerus-d067d-firebase-adminsdk-*.json`
5. **Neon DB** accessible
6. **Free model** (gemma-4-31b-it:free) available in model_registry
