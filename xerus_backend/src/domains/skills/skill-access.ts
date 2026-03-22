// Skill Access Control
// Shared authorization predicate for skill visibility

import type { Skill } from './types';

export function canUserViewSkill(skill: Skill, userId: string): boolean {
    // Published global skills are visible to everyone
    if (skill.is_published && skill.is_global) return true;
    // User's own skills
    if (skill.user_id === userId) return true;
    // System skills (null user_id, global)
    if (skill.user_id === null && skill.is_global) return true;
    return false;
}
