/**
 * ProviderManager Test Suite
 * Tests provider management and prompt execution
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProviderManager } from '../../src/core/ai-provider/provider-manager';
import { AIProviderType } from '../../src/core/ai-provider/types';
import { HookEvent } from '../../src/types';

describe('ProviderManager', () => {
  let manager: ProviderManager;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default provider', () => {
      manager = new ProviderManager();
      expect(manager).toBeDefined();
      expect(manager.getRegisteredProviders()).toHaveLength(0);
    });

    it('should initialize with custom default provider', () => {
      manager = new ProviderManager({
        defaultProvider: AIProviderType.OPENAI,
      });
      expect(manager).toBeDefined();
    });
  });

  describe('registerProvider', () => {
    beforeEach(() => {
      manager = new ProviderManager();
    });

    it('should register Anthropic provider', () => {
      manager.registerProvider({
        type: AIProviderType.ANTHROPIC,
        apiKey: 'test-key',
      });

      expect(manager.hasProvider(AIProviderType.ANTHROPIC)).toBe(true);
      expect(manager.getRegisteredProviders()).toContain(AIProviderType.ANTHROPIC);
    });

    it('should register OpenAI provider', () => {
      manager.registerProvider({
        type: AIProviderType.OPENAI,
        apiKey: 'test-key',
      });

      expect(manager.hasProvider(AIProviderType.OPENAI)).toBe(true);
    });

    it('should register multiple providers', () => {
      manager.registerProvider({
        type: AIProviderType.ANTHROPIC,
        apiKey: 'anthropic-key',
      });
      manager.registerProvider({
        type: AIProviderType.OPENAI,
        apiKey: 'openai-key',
      });

      expect(manager.getRegisteredProviders()).toHaveLength(2);
    });

    it('should throw error for unsupported provider type', () => {
      expect(() => {
        manager.registerProvider({
          type: 'unsupported' as AIProviderType,
          apiKey: 'test',
        });
      }).toThrow('Unsupported provider type');
    });
  });

  describe('getProvider', () => {
    beforeEach(() => {
      manager = new ProviderManager();
      manager.registerProvider({
        type: AIProviderType.ANTHROPIC,
        apiKey: 'test-key',
      });
    });

    it('should get registered provider', () => {
      const provider = manager.getProvider(AIProviderType.ANTHROPIC);
      expect(provider).toBeDefined();
      expect(provider.type).toBe(AIProviderType.ANTHROPIC);
    });

    it('should throw error for unregistered provider', () => {
      expect(() => {
        manager.getProvider(AIProviderType.OPENAI);
      }).toThrow('Provider not registered');
    });

    it('should return default provider when no type specified', () => {
      const provider = manager.getProvider();
      expect(provider).toBeDefined();
      expect(provider.type).toBe(AIProviderType.ANTHROPIC);
    });
  });

  describe('setDefaultProvider', () => {
    beforeEach(() => {
      manager = new ProviderManager();
      manager.registerProvider({
        type: AIProviderType.ANTHROPIC,
        apiKey: 'key1',
      });
      manager.registerProvider({
        type: AIProviderType.OPENAI,
        apiKey: 'key2',
      });
    });

    it('should set default provider', () => {
      manager.setDefaultProvider(AIProviderType.OPENAI);
      const provider = manager.getProvider();
      expect(provider.type).toBe(AIProviderType.OPENAI);
    });

    it('should throw error for unregistered provider', () => {
      manager.unregisterProvider(AIProviderType.OPENAI);
      expect(() => {
        manager.setDefaultProvider(AIProviderType.OPENAI);
      }).toThrow('Cannot set default to unregistered provider');
    });
  });

  describe('unregisterProvider', () => {
    beforeEach(() => {
      manager = new ProviderManager();
      manager.registerProvider({
        type: AIProviderType.ANTHROPIC,
        apiKey: 'key1',
      });
      manager.registerProvider({
        type: AIProviderType.OPENAI,
        apiKey: 'key2',
      });
    });

    it('should unregister provider', () => {
      manager.unregisterProvider(AIProviderType.ANTHROPIC);
      expect(manager.hasProvider(AIProviderType.ANTHROPIC)).toBe(false);
    });

    it('should reset default when unregistering default provider', () => {
      manager.unregisterProvider(AIProviderType.ANTHROPIC);
      const provider = manager.getProvider();
      expect(provider.type).toBe(AIProviderType.OPENAI);
    });
  });

  describe('executeHookPrompt - integration tests', () => {
    beforeEach(() => {
      manager = new ProviderManager();
      manager.registerProvider({
        type: AIProviderType.ANTHROPIC,
        apiKey: 'test-key',
      });
    });

    // These tests require actual provider implementation
    // Marking as skip until proper mocking is set up
    it.skip('should execute hook prompt with context', async () => {
      const hookContext = {
        event: HookEvent.PreToolUse,
        timestamp: new Date().toISOString(),
        sessionId: 'test-session',
        tool: 'Write',
        command: 'Write file',
        input: { path: '/test' },
        output: null,
        metadata: {},
      };

      const prompt = 'Should I allow this? Context: $ARGUMENTS';
      const model = 'claude-3-haiku-20240307';

      const result = await manager.executeHookPrompt(hookContext, prompt, model);

      expect(result.ok).toBeDefined();
      expect(result.reason).toBeDefined();
    });

    it.skip('should handle errors and return default allow', async () => {
      const hookContext = {
        event: HookEvent.PreToolUse,
        timestamp: '2024-01-01T00:00:00Z',
        sessionId: 'test-session',
        tool: 'Bash',
        command: 'ls',
        input: null,
        output: null,
        metadata: {},
      };

      const prompt = 'Evaluate: $ARGUMENTS';
      const model = 'invalid-model';

      const result = await manager.executeHookPrompt(hookContext, prompt, model);

      // On error, should default to allow
      expect(result.ok).toBe(true);
      expect(result.decision).toBe('allow');
    });
  });
});
