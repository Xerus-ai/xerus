// Inter-Agent Messaging Service
// File-based @mention parsing and message routing

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ParsedMention {
    target: string;
    message: string;
    startIndex: number;
    endIndex: number;
}

export interface InboxMessage {
    from_agent_slug: string;
    to_agent_slug: string;
    content: string;
    workspace_path: string;
    metadata?: Record<string, unknown>;
}

export interface RouteResult {
    inbox_path: string;
}

export class UnknownAgentError extends Error {
    constructor(public readonly slug: string) {
        super(`Unknown target agent: ${slug}`);
        this.name = 'UnknownAgentError';
    }
}

export interface AgentInfo {
    id: number;
    slug: string;
    model: string;
}

export interface MessagingWorkspaceWriter {
    writeFile(path: string, content: string): Promise<void>;
    appendFile(path: string, content: string): Promise<void>;
    mkdir(path: string): Promise<void>;
}

export interface AgentResolver {
    resolveAgent(slug: string): Promise<AgentInfo | null>;
}

export interface MessageRouterDeps {
    workspaceWriter: MessagingWorkspaceWriter;
    agentResolver: AgentResolver;
}

// -----------------------------------------------------------------------------
// MentionParser
// -----------------------------------------------------------------------------

export class MentionParser {
    // Match @mention but not email addresses
    // Email pattern: word@word.word
    // Mention pattern: @word at start of string or after whitespace
    private readonly mentionPattern = /(?:^|[\s])@([a-zA-Z][a-zA-Z0-9_-]*)/g;

    parseMentions(text: string): ParsedMention[] {
        const mentions: ParsedMention[] = [];
        const matches = [...text.matchAll(this.mentionPattern)];

        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            const target = match[1];
            const startIndex = match.index! + (match[0].startsWith('@') ? 0 : 1);

            // Extract message: text after @mention until next @mention or end
            const mentionEnd = startIndex + target.length + 1; // +1 for @
            const nextMentionStart = i < matches.length - 1
                ? matches[i + 1].index! + (matches[i + 1][0].startsWith('@') ? 0 : 1)
                : text.length;

            const messageText = text.slice(mentionEnd, nextMentionStart).trim();

            mentions.push({
                target,
                message: messageText,
                startIndex,
                endIndex: nextMentionStart,
            });
        }

        return mentions;
    }
}

// -----------------------------------------------------------------------------
// MessageRouter
// -----------------------------------------------------------------------------

export class MessageRouter {
    private readonly deps: MessageRouterDeps;
    private readonly parser: MentionParser;

    constructor(deps: MessageRouterDeps) {
        this.deps = deps;
        this.parser = new MentionParser();
    }

    async routeMessage(message: InboxMessage): Promise<RouteResult> {
        // Resolve target agent
        const targetAgent = await this.deps.agentResolver.resolveAgent(message.to_agent_slug);

        if (!targetAgent) {
            throw new UnknownAgentError(message.to_agent_slug);
        }

        // Generate inbox path and ensure directory exists
        const inboxPath = this.generateInboxPath(message.workspace_path, message.to_agent_slug);
        const inboxDir = this.getInboxDirectory(message.workspace_path, message.to_agent_slug);
        await this.deps.workspaceWriter.mkdir(inboxDir);

        // Format message content
        const formattedMessage = this.formatInboxMessage(message);

        // Append to inbox file (let errors propagate - fail-fast)
        await this.deps.workspaceWriter.appendFile(inboxPath, formattedMessage);

        return {
            inbox_path: inboxPath,
        };
    }

    async routeMentions(
        text: string,
        fromAgentSlug: string,
        workspacePath: string
    ): Promise<RouteResult[]> {
        const mentions = this.parser.parseMentions(text);
        const results: RouteResult[] = [];

        for (const mention of mentions) {
            const message: InboxMessage = {
                from_agent_slug: fromAgentSlug,
                to_agent_slug: mention.target,
                content: mention.message,
                workspace_path: workspacePath,
            };

            const result = await this.routeMessage(message);
            results.push(result);
        }

        return results;
    }

    // -------------------------------------------------------------------------
    // Private Methods
    // -------------------------------------------------------------------------

    private generateInboxPath(workspacePath: string, targetSlug: string): string {
        return `${workspacePath}/agents/${targetSlug}/inbox/inbox.md`;
    }

    private getInboxDirectory(workspacePath: string, targetSlug: string): string {
        return `${workspacePath}/agents/${targetSlug}/inbox`;
    }

    private formatInboxMessage(message: InboxMessage): string {
        const timestamp = new Date().toISOString();
        const lines: string[] = [
            '',
            '---',
            '',
            `**From**: ${message.from_agent_slug}`,
            `**Time**: ${timestamp}`,
            '',
            message.content,
            '',
        ];

        return lines.join('\n');
    }
}

// -----------------------------------------------------------------------------
// Factory Functions
// -----------------------------------------------------------------------------

export function createMentionParser(): MentionParser {
    return new MentionParser();
}

export function createMessageRouter(deps: MessageRouterDeps): MessageRouter {
    return new MessageRouter(deps);
}
