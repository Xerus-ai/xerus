/**
 * Type Boundary Converters
 *
 * Enforce type safety at system boundaries (Database → Application → UI → Router)
 * Fail-first approach: All conversions are explicit and validated
 */

/**
 * Parse team ID from URL parameters
 * @throws Error if the ID is invalid
 */
export function parseTeamId(idParam: string | string[]): number {
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const parsed = parseInt(id, 10);

  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid team ID: ${id}. Expected a positive integer.`);
  }

  return parsed;
}

/**
 * Convert numeric team ID to URL string
 */
export function teamIdToString(id: number): string {
  if (!isValidTeamId(id)) {
    throw new Error(`Invalid team ID: ${id}. Expected a positive integer.`);
  }
  return id.toString();
}

/**
 * Parse agent ID from URL parameters
 * @throws Error if the ID is invalid
 */
export function parseAgentId(idParam: string | string[]): number {
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const parsed = parseInt(id, 10);

  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid agent ID: ${id}. Expected a positive integer.`);
  }

  return parsed;
}

/**
 * Convert numeric agent ID to URL string
 */
export function agentIdToString(id: number): string {
  if (!isValidAgentId(id)) {
    throw new Error(`Invalid agent ID: ${id}. Expected a positive integer.`);
  }
  return id.toString();
}

/**
 * Type guard: Validate team ID at runtime
 */
export function isValidTeamId(id: unknown): id is number {
  return typeof id === 'number' && !isNaN(id) && id > 0 && Number.isInteger(id);
}

/**
 * Type guard: Validate agent ID at runtime
 */
export function isValidAgentId(id: unknown): id is number {
  return typeof id === 'number' && !isNaN(id) && id > 0 && Number.isInteger(id);
}

/**
 * Safe conversion of unknown ID to number
 * @throws Error if conversion fails
 */
export function toNumericId(id: unknown, context: string = 'ID'): number {
  if (typeof id === 'number') {
    if (isNaN(id) || id <= 0 || !Number.isInteger(id)) {
      throw new Error(`${context} must be a positive integer, got: ${id}`);
    }
    return id;
  }

  if (typeof id === 'string') {
    const parsed = parseInt(id, 10);
    if (isNaN(parsed) || parsed <= 0) {
      throw new Error(`${context} string cannot be parsed to positive integer: ${id}`);
    }
    return parsed;
  }

  throw new Error(`${context} must be number or string, got: ${typeof id}`);
}

/**
 * Validate array of numeric IDs
 * @throws Error if any ID is invalid
 */
export function validateNumericIds(ids: unknown[], context: string = 'IDs'): number[] {
  return ids.map((id, index) => {
    try {
      return toNumericId(id, `${context}[${index}]`);
    } catch (error) {
      throw new Error(`Invalid ${context} at index ${index}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

/**
 * Parse conversation/session ID from string
 */
export function parseSessionId(idParam: string | string[]): string {
  const id = Array.isArray(idParam) ? idParam[0] : idParam;

  if (!id || id.trim() === '') {
    throw new Error('Invalid session ID: cannot be empty');
  }

  return id.trim();
}
