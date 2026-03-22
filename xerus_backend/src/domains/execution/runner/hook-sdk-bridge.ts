// Hook SDK Bridge
// Bridges internal HookHandler/HookResult types to SDK-compatible hook format.
// SDK hooks expect HookCallbackMatcher[] per HookEvent.
// This module wraps our handlers so they can be passed to SDK options.hooks.

import type { HookEvent, HookHandler, HookResult, BaseHookInput } from '../hooks/hooks.types';
import type { StdoutEmitter } from './stdout-emitter';
import type {
    HookEvent as SDKHookEvent,
    HookCallbackMatcher,
    HookCallback as SDKHookCallback,
    HookJSONOutput,
    HookInput as SDKHookInput,
} from '@anthropic-ai/claude-agent-sdk';

// -----------------------------------------------------------------------------
// SDK-compatible hooks record type
// -----------------------------------------------------------------------------

/**
 * SDK options.hooks record: event name -> array of callback matchers.
 * Matches SDK's Partial<Record<HookEvent, HookCallbackMatcher[]>>.
 */
export type SDKHooksRecord = Partial<Record<SDKHookEvent, HookCallbackMatcher[]>>;

// -----------------------------------------------------------------------------
// Bridge Functions
// -----------------------------------------------------------------------------

/**
 * Convert internal HookResult to SDK SyncHookJSONOutput format.
 * Maps internal hook_specific_output fields to SDK decision fields.
 *
 * Supported mappings:
 * - PreToolUse: permission_decision -> decision (approve/block)
 * - PostToolUse: additional_context -> additionalContext (context steering)
 * - UserPromptSubmit: additional_context -> additionalContext (context pointer)
 */
function bridgeResult(_hookEvent: string, result: HookResult): HookJSONOutput {
    const output = result.hook_specific_output;
    const jsonOutput: HookJSONOutput = {};

    // Map PreToolUseOutput to SDK decision format.
    // 'allow' and 'ask' both map to 'approve': 'ask' tools pass PreToolUse
    // and are paused by the PermissionRequest handler instead.
    // Only 'deny' maps to 'block' (tool not allowed for this agent).
    if (output && 'permission_decision' in output) {
        jsonOutput.decision = output.permission_decision === 'deny' ? 'block' : 'approve';
        jsonOutput.reason = output.permission_decision_reason;
    }

    // Map additional_context to SDK additionalContext.
    // PostToolUseOutput has it in hook_specific_output.additional_context
    // UserPromptSubmitHandlerResult has it directly on result.additional_context
    const outputCtx = output && 'additional_context' in output ? output.additional_context : undefined;
    const resultCtx = (result as unknown as Record<string, unknown>).additional_context;
    const additionalContext = outputCtx ?? resultCtx;
    if (additionalContext && typeof additionalContext === 'string') {
        (jsonOutput as Record<string, unknown>).additionalContext = additionalContext;
    }

    return jsonOutput;
}

/**
 * Coerce SDK input (Record<string, unknown>) to BaseHookInput.
 * The SDK provides raw JSON; this bridge ensures required fields have defaults.
 */
function coerceToHookInput(raw: Record<string, unknown>): BaseHookInput {
    return {
        session_id: String(raw.session_id ?? ''),
        transcript_path: String(raw.transcript_path ?? ''),
        cwd: String(raw.cwd ?? ''),
        ...raw,
    } as BaseHookInput;
}

/**
 * Wrap internal HookHandler array into SDK HookCallbackMatcher[].
 * Creates a single matcher with one callback that executes all handlers in sequence.
 * Callback signature matches SDK: (input, toolUseID, { signal }) => Promise<HookJSONOutput>
 */
function wrapHandlers(
    hookEvent: string,
    handlers: HookHandler[],
    emitter: StdoutEmitter,
    agentSlug: string,
): HookCallbackMatcher[] {
    const callback: SDKHookCallback = async (
        input: SDKHookInput,
        _toolUseID: string | undefined,
        _options: { signal: AbortSignal },
    ): Promise<HookJSONOutput> => {
        const start = Date.now();
        let lastResult: HookResult | undefined;
        let success = true;
        let errorMsg: string | undefined;
        const hookInput = coerceToHookInput(input as unknown as Record<string, unknown>);

        try {
            for (const handler of handlers) {
                lastResult = await handler(hookInput);
            }
        } catch (err) {
            success = false;
            errorMsg = err instanceof Error ? err.message : String(err);
            throw err;
        } finally {
            const durationMs = Date.now() - start;
            emitter.hookLog(hookEvent, agentSlug, durationMs, success, errorMsg);
        }

        return lastResult
            ? bridgeResult(hookEvent, lastResult)
            : {};
    };

    return [{ hooks: [callback] }];
}

/**
 * Bridge all internal hook handlers to SDK options.hooks format.
 * Each HookEvent with registered handlers gets a HookCallbackMatcher[]
 * that executes handlers in sequence with duration logging.
 */
export function bridgeToSDKHooks(
    handlers: Partial<Record<HookEvent, HookHandler[]>>,
    emitter: StdoutEmitter,
    agentSlug: string,
): SDKHooksRecord {
    const sdkHooks: SDKHooksRecord = {};

    for (const [event, handlerList] of Object.entries(handlers)) {
        if (!handlerList || handlerList.length === 0) {
            continue;
        }

        sdkHooks[event as SDKHookEvent] = wrapHandlers(event, handlerList, emitter, agentSlug);
    }

    return sdkHooks;
}
