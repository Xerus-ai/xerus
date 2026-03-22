// Prompt Formatter Service
// Transforms raw prompts into structured 6-section markdown format using AI

import { generateJSON } from '../../shared/llm';

export interface FormattedPromptResult {
    system_prompt: string;
    personality_type: string;
    tags: string[];
}

const FORMATTER_SYSTEM_PROMPT = `You are an AI prompt engineer. Transform the user's rough prompt into a well-structured agent system prompt.

Use this structure (6 sections + optional Examples):

1. **## Identity** - WHO is this agent? Name, role, and mission in 2-3 sentences.
   Formula: "You are {name}, a {role} specialist. Your mission is to {purpose} by {method}."
2. **## Goals** - WHAT outcomes to achieve. Primary goal + 3-5 specific success criteria.
3. **## Capabilities** - SKIP this section. It is auto-populated at runtime from the agent's connected tools, skills, and knowledge base.
4. **## Guidelines** - HOW to work. 5-10 actionable behavioral rules (like onboarding a new hire).
5. **## Constraints** - What the agent must NOT do. 3-7 specific prohibitions with clear rationale.
6. **## Personality** - Communication style and tone.
   Format: "Style: {descriptor}\\nTone: {descriptor}\\n\\n- Behavioral note 1\\n- Behavioral note 2"
7. **## Examples** (Optional) - 1-3 examples of ideal input/output for this agent's most common tasks.

Rules:
- Keep the user's intent and voice
- Add structure without changing meaning
- Be specific and actionable (avoid generic advice like "be helpful")
- Use markdown formatting (headers, bullets)
- Do NOT include a Capabilities section (auto-populated from connected tools and skills at runtime)
- Identity and Goals are required; other sections can be omitted if not relevant
- Include Examples section if the user's input suggests specific task patterns

Also extract:
- personality_type: Choose one: analyst, specialist, assistant, creator, researcher, educator, advisor, operator
- tags: 2-5 relevant category tags for this agent

Output JSON with exactly these fields:
{
  "system_prompt": "## Identity\\nYou are {name}, a {role}...\\n\\n## Goals\\n...",
  "personality_type": "specialist",
  "tags": ["documentation", "technical-writing"]
}`;

export async function formatPromptWithAI(rawPrompt: string): Promise<FormattedPromptResult> {
    if (!rawPrompt || rawPrompt.trim().length === 0) {
        throw new Error('Agent prompt cannot be empty');
    }

    const result = await generateJSON<FormattedPromptResult>(
        FORMATTER_SYSTEM_PROMPT,
        `Transform this prompt into a well-structured agent system prompt:\n\n${rawPrompt}`,
        {
            model: 'openai/gpt-4o-mini',
            temperature: 0.3,
            maxTokens: 4096,
        }
    );

    if (!result.system_prompt) {
        throw new Error('Parsed prompt is missing system_prompt field');
    }

    return {
        system_prompt: result.system_prompt,
        personality_type: result.personality_type || 'assistant',
        tags: Array.isArray(result.tags) ? result.tags : [],
    };
}
