// MCP Tool Definitions — Resource Management Tools
// Tools 19-39: agents, KB, channels, tasks, skills, memory, outputs, lifecycle.

export const RESOURCE_MANAGEMENT_TOOLS = [
    {
        name: 'search_agents',
        description: 'Search agents by name, capability, or category.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                query: { type: 'string', description: 'Search query' },
                scope: { type: 'string', enum: ['mine', 'marketplace', 'all'], description: 'Search scope' },
                category: { type: 'string', description: 'Filter by agent category' },
            },
            required: ['query'],
        },
    },
    {
        name: 'clone_agent',
        description: 'Clone an agent template to create a customized agent.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                source_agent_id: { type: 'string', description: 'ID of the agent to clone' },
                name: { type: 'string', description: 'Name for the new agent' },
                customizations: { type: 'object', description: 'Optional customizations for the cloned agent' },
            },
            required: ['source_agent_id', 'name'],
        },
    },
    {
        name: 'create_agent',
        description: 'Create a new agent with custom configuration.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                name: { type: 'string', description: 'Agent display name' },
                slug: { type: 'string', description: 'URL-safe identifier (auto-generated if omitted)' },
                description: { type: 'string', description: 'What this agent does' },
                system_prompt: { type: 'string', description: 'System prompt defining agent behavior and identity' },
                model_id: { type: 'string', description: 'LLM model (default: claude-sonnet)' },
                autonomy_level: { type: 'string', enum: ['supervised', 'semi_autonomous', 'autonomous'], description: 'How much human oversight the agent requires' },
                tool_slugs: { type: 'array', items: { type: 'string' }, description: 'Pipedream app slugs to assign' },
                skill_slugs: { type: 'array', items: { type: 'string' }, description: 'Skill slugs to install on the agent' },
                kb_collection_ids: { type: 'array', items: { type: 'string' }, description: 'KB collections to assign' },
                channels: { type: 'array', items: { type: 'string' }, description: 'Channel slugs to add the agent to so it is visible in those channels. Without this the agent is created but appears in no channel.' },
                primary_channel: { type: 'string', description: 'Slug of the agent primary channel (made the channel lead if the channel has none). Defaults to the first entry of channels.' },
            },
            required: ['name', 'description', 'system_prompt'],
        },
    },
    {
        name: 'update_agent',
        description: 'Update an existing agent configuration (name, description, system prompt, model, autonomy level).',
        inputSchema: {
            type: 'object' as const,
            properties: {
                agent_id: { type: 'string', description: 'ID of the agent to update' },
                name: { type: 'string', description: 'New agent display name' },
                description: { type: 'string', description: 'New agent description' },
                system_prompt: { type: 'object', description: 'System prompt fields to update (partial update)' },
                model_id: { type: 'string', description: 'LLM model override' },
                autonomy_level: { type: 'string', enum: ['supervised', 'semi_autonomous', 'autonomous'], description: 'Autonomy level override' },
            },
            required: ['agent_id'],
        },
    },
    {
        name: 'search_kb',
        description: 'Search knowledge base documents.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                query: { type: 'string', description: 'Search query' },
                collection_id: { type: 'string', description: 'Limit search to a specific collection' },
                limit: { type: 'number', description: 'Maximum number of results (default 10)' },
            },
            required: ['query'],
        },
    },
    {
        name: 'upload_kb',
        description: 'Upload a document to the knowledge base.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                title: { type: 'string', description: 'Document title' },
                content: { type: 'string', description: 'Document content (text/markdown)' },
                file_path: { type: 'string', description: 'Path to file in workspace (alternative to content)' },
                collection_id: { type: 'string', description: 'Target KB collection (uses default if omitted)' },
            },
            required: ['title'],
        },
    },
    {
        name: 'assign_kb',
        description: 'Assign a knowledge base document or collection to an agent.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                agent_id: { type: 'string', description: 'Target agent ID' },
                document_id: { type: 'string', description: 'KB document to assign' },
                collection_id: { type: 'string', description: 'Or assign an entire collection' },
                permission: { type: 'string', enum: ['read', 'read_write'], description: 'Access permission level' },
            },
            required: ['agent_id'],
        },
    },
    {
        name: 'create_channel',
        description: 'Create a channel in the inbox for organizing agent work.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                name: { type: 'string', description: 'Channel name (e.g., seo, content, bugs)' },
                project_id: { type: 'string', description: 'Parent project (uses default if omitted)' },
                description: { type: 'string', description: 'Channel description' },
                agent_ids: { type: 'array', items: { type: 'string' }, description: 'Agent IDs to add initially' },
            },
            required: ['name'],
        },
    },
    {
        name: 'add_to_channel',
        description: 'Add an agent to a channel.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                channel_id: { type: 'string', description: 'Channel ID' },
                agent_id: { type: 'string', description: 'Agent ID to add' },
                role: { type: 'string', enum: ['member', 'lead'], description: 'Role in the channel' },
            },
            required: ['channel_id', 'agent_id'],
        },
    },
    {
        name: 'create_task',
        description: 'Create a task in a channel with agent assignments. ALWAYS assign agents and use the correct channel.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                channel_id: { type: 'string', description: 'Channel to create the task in (must match the assigned agent\'s channel)' },
                title: { type: 'string', description: 'Task title' },
                description: { type: 'string', description: 'Task description (inline text or brief summary)' },
                description_file: { type: 'string', description: 'Path to a markdown file with detailed task description (relative to workspace root). If provided, file content becomes the full description and the file is attached to the task.' },
                assigned_agent_ids: { type: 'array', items: { type: 'string' }, description: 'Agent slugs to assign. REQUIRED — unassigned tasks are invisible to agents.' },
                priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Task priority' },
                subtasks: { type: 'array', items: { type: 'string' }, description: 'Checklist items for the task' },
            },
            required: ['channel_id', 'title', 'assigned_agent_ids'],
        },
    },
    {
        name: 'update_task',
        description: 'Update an existing task: change status, add a comment, or attach deliverables. Use this to mark tasks done and report results.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                task_id: { type: 'string', description: 'The task ID to update' },
                status: { type: 'string', enum: ['open', 'in_progress', 'completed', 'blocked'], description: 'New task status' },
                comment: { type: 'string', description: 'Comment to add to the task (visible to user)' },
                attachments: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, path: { type: 'string' }, type: { type: 'string' } }, required: ['name', 'path'] }, description: 'Files to attach (deliverables, reports)' },
            },
            required: ['task_id'],
        },
    },
    {
        name: 'search_skills',
        description: 'Search skills by name, capability, or category.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                query: { type: 'string', description: 'Search query' },
                scope: { type: 'string', enum: ['system', 'marketplace', 'mine', 'all'], description: 'Search scope' },
            },
            required: ['query'],
        },
    },
    {
        name: 'create_skill',
        description: 'Create a new skill with instructions and optional scripts.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                name: { type: 'string', description: 'Skill name (lowercase, hyphenated)' },
                description: { type: 'string', description: 'When to use this skill' },
                instructions: { type: 'string', description: 'SKILL.md content (full instructions)' },
                agent_id: { type: 'string', description: 'Assign to a specific agent (optional)' },
                category: { type: 'string', description: 'Skill category' },
            },
            required: ['name', 'description', 'instructions'],
        },
    },
    {
        name: 'write_memory',
        description: 'Write a memory entry with explicit scope.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                content: { type: 'string', description: 'Memory content to store' },
                scope: { type: 'string', enum: ['company', 'project', 'channel', 'agent'], description: 'Memory scope' },
                scope_id: { type: 'string', description: 'ID of the scope entity' },
                memory_type: { type: 'string', description: 'Type of memory (e.g., session_memory, learned_preference)' },
                file_path: { type: 'string', description: 'Optional custom file path within .memory/' },
            },
            required: ['content', 'scope'],
        },
    },
    {
        name: 'search_outputs',
        description: 'Search the output registry by task, agent, type, or date range.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                task_id: { type: 'string', description: 'Associate results with this task ID' },
                agent_id: { type: 'string', description: 'Filter by agent ID' },
                output_type: { type: 'string', description: 'Filter by output type (e.g., file, artifact, report)' },
                date_from: { type: 'string', description: 'Start date (ISO 8601 format)' },
                date_to: { type: 'string', description: 'End date (ISO 8601 format)' },
                limit: { type: 'number', description: 'Maximum number of results (default 20)' },
            },
        },
    },
    {
        name: 'delete_agent',
        description: 'Delete an agent by ID or slug. Removes agent config, soul files, and registry entry.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                agent_id: { type: 'string', description: 'Agent ID to delete' },
                agent_slug: { type: 'string', description: 'Agent slug to delete (alternative to agent_id)' },
            },
        },
    },
    {
        name: 'list_agents',
        description: 'List all agents accessible to the current user. No search required.',
        inputSchema: {
            type: 'object' as const,
            properties: {},
        },
    },
    {
        name: 'list_domains',
        description: 'List all projects and domains in the workspace.',
        inputSchema: {
            type: 'object' as const,
            properties: {},
        },
    },
    {
        name: 'install_skill',
        description: 'Install a marketplace skill onto an agent.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                skill_slug: { type: 'string', description: 'Skill slug to install' },
                agent_id: { type: 'string', description: 'Agent to install the skill on (optional)' },
            },
            required: ['skill_slug'],
        },
    },
    {
        name: 'uninstall_skill',
        description: 'Remove a skill from an agent.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                skill_slug: { type: 'string', description: 'Skill slug to uninstall' },
                agent_id: { type: 'string', description: 'Agent to remove the skill from (optional)' },
            },
            required: ['skill_slug'],
        },
    },
    {
        name: 'cancel_execution',
        description: 'Cancel a running execution session. Sends termination signal to the agent process.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                session_id: { type: 'string', description: 'Execution session ID to cancel' },
            },
            required: ['session_id'],
        },
    },
];
