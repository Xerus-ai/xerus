// CLI Stream Router
// Handles Claude Code --output-format stream-json events:
// stream_event, system, assistant, result, user

import { logger } from '../../utils/logger';
import type { PipelineContext, ResolvedExecutionDeps } from './execution-pipeline.types';
import type { StreamEventType } from './types';
import { updateSdkSessionId } from '../conversations/workspace-db.service';

const log = logger('CLIStream');

export async function handleCliStreamEvent(
    eventType: string,
    d: Record<string, unknown>,
    ctx: PipelineContext,
    deps: ResolvedExecutionDeps,
): Promise<boolean> {
    switch (eventType) {
        case 'user':
            return true;

        case 'stream_event': {
            const nestedEvent = d.event as Record<string, unknown> | undefined;
            if (!nestedEvent) return true;

            const streamType = nestedEvent.type as string | undefined;
            const contentBlock = nestedEvent.content_block as Record<string, unknown> | undefined;
            const delta = nestedEvent.delta as Record<string, unknown> | undefined;

            if (streamType === 'content_block_delta' && delta) {
                if (delta.type === 'text_delta' && typeof delta.text === 'string') {
                    ctx.responseChunks.push(delta.text);
                    ctx.stream.send('token' as StreamEventType, { text: delta.text, tokenCount: 0 });
                } else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
                    ctx.thinkingChunks.push(delta.thinking);
                    ctx.stream.send('reasoning' as StreamEventType, { thought: delta.thinking });
                }
            } else if (streamType === 'content_block_start' && contentBlock) {
                if (contentBlock.type === 'tool_use') {
                    ctx.toolCallCount++;
                    const callId = (contentBlock.id as string) || `tc-${ctx.toolCallCount}`;
                    const toolName = (contentBlock.name as string) || 'unknown';
                    ctx.toolCallDetails.push({ call_id: callId, tool_name: toolName, arguments: {}, started_at: Date.now() });
                    ctx.toolCallMap.set(callId, ctx.toolCallDetails[ctx.toolCallDetails.length - 1]);
                    ctx.stream.send('tool_call' as StreamEventType, { toolName, arguments: {}, callId });
                }
            }
            return true;
        }

        case 'system': {
            const subtype = d.subtype as string | undefined;
            if (subtype === 'init') {
                const cliSessionId = d.session_id as string | undefined;
                if (cliSessionId && ctx.conversationId && ctx.sandboxId) {
                    const provider = deps.sandboxService.getDaytonaProvider();
                    await updateSdkSessionId(provider, ctx.sandboxId, ctx.conversationId, cliSessionId);
                    ctx.sdkSessionId = cliSessionId;
                }
                log.debug('CLI init', { model: d.model, tools_count: (d.tools as string[] | undefined)?.length });
            } else if (subtype === 'hook_started' || subtype === 'hook_response') {
                log.debug('CLI hook event', { hook_name: d.hook_name, subtype });
            } else {
                log.debug('CLI system event', { subtype });
            }
            return true;
        }

        case 'assistant': {
            const msg = d.message as Record<string, unknown> | undefined;
            if (msg) {
                const content = msg.content as Array<Record<string, unknown>> | undefined;
                if (content) {
                    for (const block of content) {
                        switch (block.type) {
                            case 'text': {
                                const text = block.text as string;
                                if (text) {
                                    ctx.responseText = text;
                                    if (ctx.responseChunks.length === 0) {
                                        ctx.responseChunks.push(text);
                                        ctx.stream.send('token' as StreamEventType, { text, tokenCount: ctx.outputTokens });
                                    }
                                }
                                break;
                            }
                            case 'tool_use': {
                                const callId = (block.id as string) || `tc-${ctx.toolCallCount + 1}`;
                                const toolName = (block.name as string) || 'unknown';
                                const args = (block.input as Record<string, unknown>) || {};
                                if (!ctx.toolCallMap.has(callId)) {
                                    ctx.toolCallCount++;
                                    ctx.toolCallDetails.push({ call_id: callId, tool_name: toolName, arguments: args, started_at: Date.now() });
                                    ctx.toolCallMap.set(callId, ctx.toolCallDetails[ctx.toolCallDetails.length - 1]);
                                    ctx.stream.send('tool_call' as StreamEventType, { toolName, arguments: args, callId });
                                } else {
                                    const tracked = ctx.toolCallMap.get(callId)!;
                                    tracked.arguments = args;
                                    if (Object.keys(args).length > 0) {
                                        ctx.stream.send('tool_call' as StreamEventType, { toolName, arguments: args, callId });
                                    }
                                }
                                break;
                            }
                            case 'tool_result': {
                                const callId = (block.tool_use_id as string) || '';
                                const resultContent = block.content;
                                const resultText = typeof resultContent === 'string'
                                    ? resultContent
                                    : Array.isArray(resultContent)
                                        ? (resultContent as Array<{ type: string; text?: string }>).filter(b => b.type === 'text').map(b => b.text).join('\n')
                                        : '';
                                const tracked = ctx.toolCallMap.get(callId);
                                const durationMs = tracked ? Date.now() - tracked.started_at : 0;
                                if (tracked) { tracked.result = resultText; tracked.success = true; tracked.duration_ms = durationMs; }
                                ctx.stream.send('tool_result' as StreamEventType, { callId, result: resultText, durationMs, success: true });
                                break;
                            }
                            case 'thinking': {
                                const thought = (block.thinking as string) || (block.text as string) || '';
                                if (thought) {
                                    if (ctx.thinkingChunks.length === 0) {
                                        ctx.thinkingChunks.push(thought);
                                        ctx.stream.send('reasoning' as StreamEventType, { thought });
                                    }
                                }
                                break;
                            }
                            default:
                                break;
                        }
                    }
                }
                const usage = msg.usage as Record<string, number> | undefined;
                if (usage) {
                    ctx.inputTokens += usage.input_tokens || 0;
                    ctx.outputTokens += usage.output_tokens || 0;
                }
            }
            return true;
        }

        case 'result': {
            const isError = d.is_error as boolean | undefined;
            const result = d.result as string | undefined;
            const totalCost = d.total_cost_usd as number | undefined;
            const numTurns = d.num_turns as number | undefined;

            if (result && !isError) {
                ctx.responseText = result;
            }
            if (totalCost) {
                ctx.creditsUsed = totalCost;
            }

            const usage = d.usage as Record<string, number> | undefined;
            if (usage) {
                ctx.inputTokens = usage.input_tokens || ctx.inputTokens;
                ctx.outputTokens = usage.output_tokens || ctx.outputTokens;
            }

            log.info('CLI result', {
                is_error: isError,
                num_turns: numTurns,
                cost_usd: totalCost,
                session_id: d.session_id,
                duration_ms: d.duration_ms,
            });
            return true;
        }

        default:
            return false;
    }
}
