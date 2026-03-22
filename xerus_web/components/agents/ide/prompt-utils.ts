/**
 * Shared prompt utilities used by IdentityTab and StandardEditor.
 *
 * Contains pure functions for converting, previewing, and formatting
 * JSONB system_prompt objects into markdown.
 */

/**
 * Convert JSONB system_prompt to markdown for display/editing.
 * Supports both string prompts and structured JSONB objects.
 */
export function convertPromptToMarkdown(prompt: unknown): string {
  if (!prompt) return '';
  if (typeof prompt === 'string') return prompt;

  if (typeof prompt === 'object') {
    const obj = prompt as Record<string, unknown>;
    const sections: string[] = [];

    if (obj.identity && typeof obj.identity === 'object') {
      const identity = obj.identity as Record<string, string>;
      const name = identity.name || '';
      const role = identity.role || '';
      const purpose = identity.purpose || '';
      sections.push('## Identity');
      if (role && purpose) {
        sections.push(`You are ${name || 'an AI assistant'}, a ${role}.\n${purpose}`);
      } else if (purpose) {
        sections.push(purpose);
      } else if (role) {
        sections.push(`You are ${name || 'an AI assistant'}, a ${role}.`);
      }
    }

    if (obj.goals && typeof obj.goals === 'object') {
      const goals = obj.goals as Record<string, unknown>;
      const primary = goals.primary as string || '';
      const criteria = goals.success_criteria as string[] || [];
      if (primary || criteria.length > 0) {
        sections.push('\n## Goals');
        if (primary) sections.push(`Primary goal: ${primary}`);
        if (criteria.length > 0) {
          sections.push('\nSuccess criteria:');
          criteria.forEach(c => sections.push(`- ${c}`));
        }
      }
    }

    if (obj.capabilities) {
      sections.push('\n## Capabilities');
      if (typeof obj.capabilities === 'string') {
        sections.push(obj.capabilities);
      } else if (typeof obj.capabilities === 'object') {
        const caps = obj.capabilities as Record<string, unknown>;
        if (caps.tools && Array.isArray(caps.tools)) {
          sections.push('Tools:');
          (caps.tools as string[]).forEach((t: string) => sections.push(`- ${t}`));
        }
        if (caps.skills && Array.isArray(caps.skills)) {
          sections.push('\nSkills:');
          (caps.skills as string[]).forEach((s: string) => sections.push(`- ${s}`));
        }
      }
    }

    if (obj.guidelines && Array.isArray(obj.guidelines) && obj.guidelines.length > 0) {
      sections.push('\n## Guidelines');
      obj.guidelines.forEach(g => sections.push(`- ${g}`));
    }

    if (obj.constraints && Array.isArray(obj.constraints) && obj.constraints.length > 0) {
      sections.push('\n## Constraints');
      obj.constraints.forEach(c => sections.push(`- ${c}`));
    }

    if (obj.personality && typeof obj.personality === 'object') {
      const personality = obj.personality as Record<string, string>;
      const style = personality.style || '';
      const tone = personality.tone || '';
      if (style || tone) {
        sections.push('\n## Personality');
        if (style) sections.push(`Style: ${style}`);
        if (tone) sections.push(`Tone: ${tone}`);
      }
    }

    if (sections.length > 0) return sections.join('\n');
    return JSON.stringify(prompt, null, 2);
  }

  return String(prompt);
}

/**
 * Get a short preview of the prompt for display in collapsed view.
 */
export function getPromptPreview(prompt: unknown): string {
  if (!prompt) return '';
  if (typeof prompt === 'string') {
    return prompt.length > 100 ? prompt.substring(0, 100) + '...' : prompt;
  }

  if (typeof prompt === 'object') {
    const obj = prompt as Record<string, unknown>;
    if (obj.identity && typeof obj.identity === 'object') {
      const identity = obj.identity as Record<string, string>;
      const role = identity.role || '';
      const purpose = identity.purpose || '';
      if (role && purpose) return `${role}: ${purpose}`;
      if (purpose) return purpose;
      if (role) return role;
    }
    if (obj.goals && typeof obj.goals === 'object') {
      const goals = obj.goals as Record<string, unknown>;
      if (goals.primary && typeof goals.primary === 'string') return goals.primary;
    }
    return 'Custom agent prompt (click to view)';
  }

  return String(prompt);
}

/**
 * Placeholder text showing the recommended 6-section structure.
 */
export const PROMPT_PLACEHOLDER = `## Identity
You are [Name], a [role] specialist.
Your mission is to [purpose] by [method].

## Goals
Primary goal: [What this agent delivers]

Success criteria:
- [Specific measurable outcome]
- [Quality standard]
- [Time or scope target]

## Capabilities
[Auto-populated from connected tools, skills, and knowledge base]

## Guidelines
- [Actionable behavioral rule]
- [Quality standard or work pattern]
- [Domain-specific best practice]

## Constraints
- [What the agent must not do]
- [Safety or data handling boundary]

## Personality
Style: [analytical, structured, casual, creative]
Tone: [direct, friendly, formal, enthusiastic]

## Examples (Optional)
User: [Example request]
Agent: [Example response pattern]`;
