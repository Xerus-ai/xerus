// Agent Validators Tests - Behaviour Configuration (thinking_level, autonomy_level)
// Task 4.93: Backend validators for agent create/update schemas

import { AgentValidator, agentValidator } from '../validators';
import { AgentValidationError } from '../errors';

describe('AgentValidator', () => {
    let validator: AgentValidator;

    beforeEach(() => {
        validator = new AgentValidator();
    });

    describe('validateCreate', () => {
        describe('thinking_level', () => {
            it('should accept valid thinking_level values', () => {
                const levels = ['low', 'medium', 'high'] as const;

                for (const level of levels) {
                    const result = validator.validateCreate({
                        name: 'Test Agent',
                        thinking_level: level,
                    });
                    expect(result.thinking_level).toBe(level);
                }
            });

            it('should default thinking_level to medium when not provided', () => {
                const result = validator.validateCreate({
                    name: 'Test Agent',
                });
                expect(result.thinking_level).toBe('medium');
            });

            it('should reject invalid thinking_level values', () => {
                expect(() =>
                    validator.validateCreate({
                        name: 'Test Agent',
                        thinking_level: 'invalid' as never,
                    })
                ).toThrow(AgentValidationError);
            });

            it('should reject non-string thinking_level values', () => {
                expect(() =>
                    validator.validateCreate({
                        name: 'Test Agent',
                        thinking_level: 123 as never,
                    })
                ).toThrow(AgentValidationError);
            });
        });

        describe('autonomy_level', () => {
            it('should accept valid autonomy_level values', () => {
                const levels = ['supervised', 'semi_autonomous', 'autonomous'] as const;

                for (const level of levels) {
                    const result = validator.validateCreate({
                        name: 'Test Agent',
                        autonomy_level: level,
                    });
                    expect(result.autonomy_level).toBe(level);
                }
            });

            it('should default autonomy_level to supervised when not provided', () => {
                const result = validator.validateCreate({
                    name: 'Test Agent',
                });
                expect(result.autonomy_level).toBe('supervised');
            });

            it('should reject invalid autonomy_level values', () => {
                expect(() =>
                    validator.validateCreate({
                        name: 'Test Agent',
                        autonomy_level: 'invalid' as never,
                    })
                ).toThrow(AgentValidationError);
            });

            it('should reject non-string autonomy_level values', () => {
                expect(() =>
                    validator.validateCreate({
                        name: 'Test Agent',
                        autonomy_level: true as never,
                    })
                ).toThrow(AgentValidationError);
            });
        });

        describe('combined behaviour fields', () => {
            it('should accept both thinking_level and autonomy_level together', () => {
                const result = validator.validateCreate({
                    name: 'Test Agent',
                    thinking_level: 'high',
                    autonomy_level: 'autonomous',
                });
                expect(result.thinking_level).toBe('high');
                expect(result.autonomy_level).toBe('autonomous');
            });

            it('should use defaults for both when neither provided', () => {
                const result = validator.validateCreate({
                    name: 'Test Agent',
                });
                expect(result.thinking_level).toBe('medium');
                expect(result.autonomy_level).toBe('supervised');
            });
        });
    });

    describe('validateUpdate', () => {
        describe('thinking_level', () => {
            it('should accept valid thinking_level values on update', () => {
                const levels = ['low', 'medium', 'high'] as const;

                for (const level of levels) {
                    const result = validator.validateUpdate({
                        thinking_level: level,
                    });
                    expect(result.thinking_level).toBe(level);
                }
            });

            it('should allow update without thinking_level (optional)', () => {
                const result = validator.validateUpdate({
                    name: 'Updated Name',
                });
                expect(result.thinking_level).toBeUndefined();
            });

            it('should reject invalid thinking_level on update', () => {
                expect(() =>
                    validator.validateUpdate({
                        thinking_level: 'extreme' as never,
                    })
                ).toThrow(AgentValidationError);
            });
        });

        describe('autonomy_level', () => {
            it('should accept valid autonomy_level values on update', () => {
                const levels = ['supervised', 'semi_autonomous', 'autonomous'] as const;

                for (const level of levels) {
                    const result = validator.validateUpdate({
                        autonomy_level: level,
                    });
                    expect(result.autonomy_level).toBe(level);
                }
            });

            it('should allow update without autonomy_level (optional)', () => {
                const result = validator.validateUpdate({
                    name: 'Updated Name',
                });
                expect(result.autonomy_level).toBeUndefined();
            });

            it('should reject invalid autonomy_level on update', () => {
                expect(() =>
                    validator.validateUpdate({
                        autonomy_level: 'rogue' as never,
                    })
                ).toThrow(AgentValidationError);
            });
        });

        describe('combined behaviour fields on update', () => {
            it('should allow updating only thinking_level', () => {
                const result = validator.validateUpdate({
                    thinking_level: 'high',
                });
                expect(result.thinking_level).toBe('high');
                expect(result.autonomy_level).toBeUndefined();
            });

            it('should allow updating only autonomy_level', () => {
                const result = validator.validateUpdate({
                    autonomy_level: 'autonomous',
                });
                expect(result.autonomy_level).toBe('autonomous');
                expect(result.thinking_level).toBeUndefined();
            });

            it('should allow updating both thinking_level and autonomy_level', () => {
                const result = validator.validateUpdate({
                    thinking_level: 'low',
                    autonomy_level: 'semi_autonomous',
                });
                expect(result.thinking_level).toBe('low');
                expect(result.autonomy_level).toBe('semi_autonomous');
            });

            it('should allow updating behaviour fields with other fields', () => {
                const result = validator.validateUpdate({
                    name: 'Updated Agent',
                    description: 'New description',
                    thinking_level: 'high',
                    autonomy_level: 'autonomous',
                });
                expect(result.name).toBe('Updated Agent');
                expect(result.description).toBe('New description');
                expect(result.thinking_level).toBe('high');
                expect(result.autonomy_level).toBe('autonomous');
            });
        });
    });

    describe('error messages', () => {
        it('should include field name in thinking_level error', () => {
            try {
                validator.validateCreate({
                    name: 'Test Agent',
                    thinking_level: 'invalid' as never,
                });
                fail('Expected AgentValidationError');
            } catch (error) {
                expect(error).toBeInstanceOf(AgentValidationError);
                const validationError = error as AgentValidationError;
                expect(
                    validationError.validationErrors.some(
                        (e: { field: string; message: string }) => e.field === 'thinking_level'
                    )
                ).toBe(true);
            }
        });

        it('should include field name in autonomy_level error', () => {
            try {
                validator.validateCreate({
                    name: 'Test Agent',
                    autonomy_level: 'invalid' as never,
                });
                fail('Expected AgentValidationError');
            } catch (error) {
                expect(error).toBeInstanceOf(AgentValidationError);
                const validationError = error as AgentValidationError;
                expect(
                    validationError.validationErrors.some(
                        (e: { field: string; message: string }) => e.field === 'autonomy_level'
                    )
                ).toBe(true);
            }
        });
    });
});

describe('agentValidator singleton', () => {
    it('should export a singleton instance', () => {
        expect(agentValidator).toBeInstanceOf(AgentValidator);
    });

    it('should validate thinking_level using singleton', () => {
        const result = agentValidator.validateCreate({
            name: 'Test Agent',
            thinking_level: 'high',
        });
        expect(result.thinking_level).toBe('high');
    });

    it('should validate autonomy_level using singleton', () => {
        const result = agentValidator.validateCreate({
            name: 'Test Agent',
            autonomy_level: 'autonomous',
        });
        expect(result.autonomy_level).toBe('autonomous');
    });
});
