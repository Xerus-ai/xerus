// Agent Validators Tests
import { agentValidator, AgentValidator } from '../../src/domains/agents/validators';
import {
  AgentValidationError,
  InvalidModelError,
  PublishRequirementsError
} from '../../src/domains/agents/errors';
import { Agent } from '../../src/domains/agents/types';

describe('AgentValidator', () => {
  let validator: AgentValidator;

  beforeEach(() => {
    validator = new AgentValidator();
  });

  describe('validateCreate', () => {
    const validCreateData = {
      name: 'Test Agent',
      description: 'A test agent for validation',
      system_prompt: `# Test Agent - Assistant

## Role
You are a test agent for validating agent creation logic.

## Objective
Validate that agent creation works correctly.

## Guidelines
- Always respond helpfully and accurately

## Constraints
- Never provide harmful or misleading information`
    };

    it('should validate valid create data', () => {
      const result = validator.validateCreate(validCreateData);

      expect(result.name).toBe('Test Agent');
      expect(result.description).toBe('A test agent for validation');
      expect(result.ai_model).toBe('gpt-4o');
    });

    it('should apply default ai_model when not provided', () => {
      const result = validator.validateCreate(validCreateData);
      expect(result.ai_model).toBe('gpt-4o');
    });

    it('should apply default tags as empty array', () => {
      const result = validator.validateCreate(validCreateData);
      expect(result.tags).toEqual([]);
    });

    it('should reject empty name', () => {
      const data = { ...validCreateData, name: '' };

      expect(() => validator.validateCreate(data))
        .toThrow(AgentValidationError);
    });

    it('should reject name exceeding max length', () => {
      const data = { ...validCreateData, name: 'x'.repeat(256) };

      expect(() => validator.validateCreate(data))
        .toThrow(AgentValidationError);
    });

    it('should apply default description when not provided', () => {
      const { description, ...data } = validCreateData;

      const result = validator.validateCreate(data);
      expect(result.description).toBe('');
    });

    it('should accept optional avatar_url', () => {
      const data = {
        ...validCreateData,
        avatar_url: 'https://example.com/avatar.png'
      };

      const result = validator.validateCreate(data);
      expect(result.avatar_url).toBe('https://example.com/avatar.png');
    });

    it('should reject invalid avatar_url format', () => {
      const data = {
        ...validCreateData,
        avatar_url: 'not-a-valid-url'
      };

      expect(() => validator.validateCreate(data))
        .toThrow(AgentValidationError);
    });

    it('should accept null avatar_url', () => {
      const data = { ...validCreateData, avatar_url: null };

      const result = validator.validateCreate(data);
      expect(result.avatar_url).toBeNull();
    });

    it('should strip unknown fields', () => {
      const data = {
        ...validCreateData,
        unknown_field: 'should be stripped'
      };

      const result = validator.validateCreate(data);
      expect((result as unknown as Record<string, unknown>).unknown_field).toBeUndefined();
    });

    it('should validate tags array', () => {
      const data = {
        ...validCreateData,
        tags: ['tag1', 'tag2', 'tag3']
      };

      const result = validator.validateCreate(data);
      expect(result.tags).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should reject too many tags', () => {
      const data = {
        ...validCreateData,
        tags: Array(21).fill('tag')
      };

      expect(() => validator.validateCreate(data))
        .toThrow(AgentValidationError);
    });

    it('should apply default thinking_level (medium)', () => {
      const result = validator.validateCreate(validCreateData);
      expect(result.thinking_level).toBe('medium');
    });

    it('should apply default autonomy_level (supervised)', () => {
      const result = validator.validateCreate(validCreateData);
      expect(result.autonomy_level).toBe('supervised');
    });

    it('should accept valid thinking_level values', () => {
      const lowResult = validator.validateCreate({ ...validCreateData, thinking_level: 'low' });
      expect(lowResult.thinking_level).toBe('low');

      const mediumResult = validator.validateCreate({ ...validCreateData, thinking_level: 'medium' });
      expect(mediumResult.thinking_level).toBe('medium');

      const highResult = validator.validateCreate({ ...validCreateData, thinking_level: 'high' });
      expect(highResult.thinking_level).toBe('high');
    });

    it('should accept valid autonomy_level values', () => {
      const supervisedResult = validator.validateCreate({ ...validCreateData, autonomy_level: 'supervised' });
      expect(supervisedResult.autonomy_level).toBe('supervised');

      const semiResult = validator.validateCreate({ ...validCreateData, autonomy_level: 'semi_autonomous' });
      expect(semiResult.autonomy_level).toBe('semi_autonomous');

      const autoResult = validator.validateCreate({ ...validCreateData, autonomy_level: 'autonomous' });
      expect(autoResult.autonomy_level).toBe('autonomous');
    });

    it('should reject invalid thinking_level', () => {
      const data = { ...validCreateData, thinking_level: 'ultra' };

      expect(() => validator.validateCreate(data))
        .toThrow(AgentValidationError);
    });

    it('should reject invalid autonomy_level', () => {
      const data = { ...validCreateData, autonomy_level: 'rogue' };

      expect(() => validator.validateCreate(data))
        .toThrow(AgentValidationError);
    });
  });

  describe('validateUpdate', () => {
    it('should validate valid update data', () => {
      const updateData = {
        name: 'Updated Agent Name',
        description: 'Updated description'
      };

      const result = validator.validateUpdate(updateData);

      expect(result.name).toBe('Updated Agent Name');
      expect(result.description).toBe('Updated description');
    });

    it('should allow partial updates', () => {
      const result = validator.validateUpdate({ name: 'New Name' });
      expect(result.name).toBe('New Name');
      expect(result.description).toBeUndefined();
    });

    it('should reject empty update object', () => {
      expect(() => validator.validateUpdate({}))
        .toThrow(AgentValidationError);
    });

    it('should strip unknown and protected fields silently', () => {
      // The validator uses stripUnknown: true, so protected/unknown fields are removed
      // This is the expected behavior - silently ignore rather than error
      const result = validator.validateUpdate({ name: 'Valid', id: 123, unknown_field: 'test' });

      expect(result.name).toBe('Valid');
      expect((result as unknown as Record<string, unknown>).id).toBeUndefined();
      expect((result as unknown as Record<string, unknown>).unknown_field).toBeUndefined();
    });

    it('should allow agent_type update', () => {
      const result = validator.validateUpdate({ agent_type: 'public' });
      expect(result.agent_type).toBe('public');
    });

    it('should allow is_default update', () => {
      const result = validator.validateUpdate({ is_default: true });
      expect(result.is_default).toBe(true);
    });

    it('should allow thinking_level update', () => {
      const result = validator.validateUpdate({ thinking_level: 'high' });
      expect(result.thinking_level).toBe('high');
    });

    it('should allow autonomy_level update', () => {
      const result = validator.validateUpdate({ autonomy_level: 'autonomous' });
      expect(result.autonomy_level).toBe('autonomous');
    });

    it('should reject invalid thinking_level on update', () => {
      expect(() => validator.validateUpdate({ thinking_level: 'extreme' as any }))
        .toThrow(AgentValidationError);
    });

    it('should reject invalid autonomy_level on update', () => {
      expect(() => validator.validateUpdate({ autonomy_level: 'rogue' as any }))
        .toThrow(AgentValidationError);
    });
  });

  describe('validateListOptions', () => {
    it('should apply defaults for empty options', () => {
      const result = validator.validateListOptions({});

      expect(result.sort_by).toBe('created_at');
      expect(result.sort_order).toBe('desc');
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should validate custom options', () => {
      const result = validator.validateListOptions({
        sort_by: 'name',
        sort_order: 'asc',
        page: 2,
        limit: 50
      });

      expect(result.sort_by).toBe('name');
      expect(result.sort_order).toBe('asc');
      expect(result.page).toBe(2);
      expect(result.limit).toBe(50);
    });

    it('should reject invalid sort_by', () => {
      expect(() => validator.validateListOptions({ sort_by: 'invalid' }))
        .toThrow(AgentValidationError);
    });

    it('should reject invalid sort_order', () => {
      expect(() => validator.validateListOptions({ sort_order: 'invalid' }))
        .toThrow(AgentValidationError);
    });

    it('should reject page less than 1', () => {
      expect(() => validator.validateListOptions({ page: 0 }))
        .toThrow(AgentValidationError);
    });

    it('should reject limit greater than 100', () => {
      expect(() => validator.validateListOptions({ limit: 101 }))
        .toThrow(AgentValidationError);
    });

    it('should accept filters', () => {
      const result = validator.validateListOptions({
        filters: {
          agent_type: 'private',
          is_verified: true,
          search: 'test'
        }
      });

      expect(result.filters?.agent_type).toBe('private');
      expect(result.filters?.is_verified).toBe(true);
      expect(result.filters?.search).toBe('test');
    });
  });

  describe('validateFilters', () => {
    it('should validate valid filters', () => {
      const filters = {
        agent_type: 'public',
        is_verified: true,
        ai_model: 'gpt-4o',
        search: 'marketing'
      };

      const result = validator.validateFilters(filters);

      expect(result.agent_type).toBe('public');
      expect(result.is_verified).toBe(true);
      expect(result.ai_model).toBe('gpt-4o');
      expect(result.search).toBe('marketing');
    });

    it('should accept empty filters', () => {
      const result = validator.validateFilters({});
      expect(result).toEqual({});
    });

    it('should reject invalid agent_type', () => {
      expect(() => validator.validateFilters({ agent_type: 'invalid' }))
        .toThrow(AgentValidationError);
    });

    it('should accept tags array in filters', () => {
      const result = validator.validateFilters({
        tags: ['marketing', 'content']
      });

      expect(result.tags).toEqual(['marketing', 'content']);
    });
  });

  describe('validateModel', () => {
    it('should accept valid OpenAI models', () => {
      expect(() => validator.validateModel('gpt-4o')).not.toThrow();
      expect(() => validator.validateModel('gpt-4o-mini')).not.toThrow();
      expect(() => validator.validateModel('gpt-4-turbo')).not.toThrow();
    });

    it('should accept valid Anthropic models', () => {
      expect(() => validator.validateModel('claude-3-5-sonnet-20241022')).not.toThrow();
      expect(() => validator.validateModel('claude-3-5-haiku-20241022')).not.toThrow();
      expect(() => validator.validateModel('claude-3-opus-20240229')).not.toThrow();
    });

    it('should accept valid Google models', () => {
      expect(() => validator.validateModel('gemini-2.0-flash-exp')).not.toThrow();
      expect(() => validator.validateModel('gemini-1.5-pro')).not.toThrow();
    });

    it('should accept valid DeepSeek models', () => {
      expect(() => validator.validateModel('deepseek-chat')).not.toThrow();
      expect(() => validator.validateModel('deepseek-reasoner')).not.toThrow();
    });

    it('should accept provider-prefixed models', () => {
      expect(() => validator.validateModel('openai/gpt-4o')).not.toThrow();
      expect(() => validator.validateModel('anthropic/claude-3-5-sonnet-20241022')).not.toThrow();
    });

    it('should reject invalid model', () => {
      expect(() => validator.validateModel('invalid-model'))
        .toThrow(InvalidModelError);
    });

    it('should reject unknown provider', () => {
      expect(() => validator.validateModel('unknown-provider/gpt-4o'))
        .toThrow(InvalidModelError);
    });
  });

  describe('validateSystemPrompt', () => {
    const validSystemPrompt = `# Test Agent - Assistant

## Role
You are a test agent for validating system prompts.

## Objective
Validate system prompts correctly.

## Guidelines
- Be helpful and accurate

## Constraints
- Do not provide harmful information`;

    it('should validate valid system prompt string', () => {
      const result = validator.validateSystemPrompt(validSystemPrompt);

      expect(typeof result).toBe('string');
      expect(result).toContain('Test Agent');
    });

    it('should return empty string for null', () => {
      const result = validator.validateSystemPrompt(null);

      expect(result).toBe('');
    });

    it('should return empty string for undefined', () => {
      const result = validator.validateSystemPrompt(undefined);

      expect(result).toBe('');
    });

    it('should reject non-string input', () => {
      const invalid = { identity: { name: 'Test' } };

      expect(() => validator.validateSystemPrompt(invalid))
        .toThrow(AgentValidationError);
    });

    it('should accept empty string', () => {
      const result = validator.validateSystemPrompt('');

      expect(result).toBe('');
    });

    it('should reject string exceeding max length', () => {
      const tooLong = 'x'.repeat(50001);

      expect(() => validator.validateSystemPrompt(tooLong))
        .toThrow(AgentValidationError);
    });

    it('should accept string at max length', () => {
      const atLimit = 'x'.repeat(50000);

      const result = validator.validateSystemPrompt(atLimit);
      expect(result.length).toBe(50000);
    });
  });

  describe('validateCapabilities', () => {
    it('should validate capabilities with defaults for arrays', () => {
      const result = validator.validateCapabilities({});

      expect(result.tools).toEqual([]);
      expect(result.skills).toEqual([]);
    });

    it('should apply defaults when permissions and constraints provided', () => {
      const result = validator.validateCapabilities({
        permissions: {},
        constraints: {}
      });

      expect(result.permissions?.can_write_files).toBe(false);
      expect(result.constraints?.max_concurrent_tools).toBe(3);
    });

    it('should validate custom capabilities', () => {
      const capabilities = {
        tools: ['web_search', 'file_read'],
        skills: ['research', 'writing'],
        permissions: {
          can_write_files: true,
          can_send_emails: true
        },
        constraints: {
          max_concurrent_tools: 5,
          timeout_seconds: 300
        }
      };

      const result = validator.validateCapabilities(capabilities);

      expect(result.tools).toEqual(['web_search', 'file_read']);
      expect(result.permissions?.can_write_files).toBe(true);
      expect(result.constraints?.max_concurrent_tools).toBe(5);
    });

    it('should reject invalid max_concurrent_tools', () => {
      expect(() => validator.validateCapabilities({
        constraints: { max_concurrent_tools: 20 }
      })).toThrow(AgentValidationError);
    });

    it('should reject invalid timeout_seconds', () => {
      expect(() => validator.validateCapabilities({
        constraints: { timeout_seconds: 1000 }
      })).toThrow(AgentValidationError);
    });

    it('should validate model_config', () => {
      const result = validator.validateCapabilities({
        model_config: {
          temperature: 0.7,
          max_tokens: 4096,
          top_p: 0.9
        }
      });

      expect(result.model_config?.temperature).toBe(0.7);
      expect(result.model_config?.max_tokens).toBe(4096);
    });
  });

  describe('validatePublishRequirements', () => {
    const createValidAgent = (): Agent => ({
      id: 1,
      name: 'Publishable Agent',
      description: 'A fully configured agent ready for publishing',
      personality_type: 'professional',
      avatar_url: null,
      system_prompt: `# Publishable Agent - Assistant

## Role
You are a helpful assistant designed to help users with productivity tasks and daily workflows.

## Objective
Assist users effectively with various tasks while maintaining high quality and user satisfaction.

## Guidelines
- Always be helpful and provide accurate information
- Respond in a clear and professional manner
- Prioritize user needs and safety

## Constraints
- Never provide harmful or misleading information
- Do not engage in unethical activities
- Respect user privacy at all times`,
      capabilities: {
        tools: [],
        skills: [],
        permissions: {
          can_write_files: false,
          can_send_emails: false,
          can_create_tasks: false
        },
        constraints: {
          max_concurrent_tools: 3,
          timeout_seconds: 120
        },
        model_config: {},
        style: {}
      },
      ai_model: 'gpt-4o',
      user_id: 'user123',
      agent_type: 'private',
      thinking_level: 'medium',
      autonomy_level: 'supervised',
      source_agent_id: null,
      workflow_config: {
        executionMode: 'simple',
        coordinationMode: 'sequential',
        workflowStrategy: null,
        selectedTemplateId: null,
        workflowSteps: [],
        teamAgents: [],
        teamId: null,
        isMultiAgent: false
      },
      tags: ['productivity'],
      public_metadata: {
        description: 'A comprehensive agent designed to help users with productivity tasks and daily workflows.'
      },
      is_default: false,
      is_verified: false,
      execution_count: 15,
      success_rate: 0.85,
      clone_count: 0,
      last_used_at: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    });

    it('should pass for valid publishable agent', () => {
      const agent = createValidAgent();

      expect(() => validator.validatePublishRequirements(agent))
        .not.toThrow();
    });

    it('should fail when execution_count < 10', () => {
      const agent = createValidAgent();
      agent.execution_count = 5;

      expect(() => validator.validatePublishRequirements(agent))
        .toThrow(PublishRequirementsError);
    });

    it('should fail when success_rate < 0.80', () => {
      const agent = createValidAgent();
      agent.success_rate = 0.75;

      expect(() => validator.validatePublishRequirements(agent))
        .toThrow(PublishRequirementsError);
    });

    it('should fail when public_metadata.description is missing', () => {
      const agent = createValidAgent();
      agent.public_metadata = null;

      expect(() => validator.validatePublishRequirements(agent))
        .toThrow(PublishRequirementsError);
    });

    it('should fail when tags are empty', () => {
      const agent = createValidAgent();
      agent.tags = [];

      expect(() => validator.validatePublishRequirements(agent))
        .toThrow(PublishRequirementsError);
    });

    it('should fail when system_prompt is too short', () => {
      const agent = createValidAgent();
      agent.system_prompt = 'Too short';

      expect(() => validator.validatePublishRequirements(agent))
        .toThrow(PublishRequirementsError);
    });

    it('should fail when system_prompt is empty', () => {
      const agent = createValidAgent();
      agent.system_prompt = '';

      expect(() => validator.validatePublishRequirements(agent))
        .toThrow(PublishRequirementsError);
    });

    it('should pass when system_prompt has exactly 100 characters', () => {
      const agent = createValidAgent();
      agent.system_prompt = 'x'.repeat(100);

      expect(() => validator.validatePublishRequirements(agent))
        .not.toThrow();
    });

    it('should fail when system_prompt is 99 characters', () => {
      const agent = createValidAgent();
      agent.system_prompt = 'x'.repeat(99);

      expect(() => validator.validatePublishRequirements(agent))
        .toThrow(PublishRequirementsError);
    });

    it('should include all errors in PublishRequirementsError', () => {
      const agent = createValidAgent();
      agent.execution_count = 5;
      agent.success_rate = 0.5;
      agent.tags = [];

      try {
        validator.validatePublishRequirements(agent);
        fail('Expected PublishRequirementsError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(PublishRequirementsError);
        const pubError = error as PublishRequirementsError;
        expect(pubError.requirements.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('singleton export', () => {
    it('should export singleton instance', () => {
      expect(agentValidator).toBeInstanceOf(AgentValidator);
    });
  });
});
