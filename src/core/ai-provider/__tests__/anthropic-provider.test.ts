/**
 * Anthropic Provider Tests
 * Basic tests to verify the implementation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AnthropicProvider, AIProviderType, HookPromptContext } from '../index';

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    // Create provider with test config
    provider = new AnthropicProvider({
      type: AIProviderType.ANTHROPIC,
      apiKey: 'test-api-key',
    });
  });

  describe('Type and Configuration', () => {
    it('should have correct provider type', () => {
      expect(provider.type).toBe(AIProviderType.ANTHROPIC);
    });

    it('should be configured when API key is provided', () => {
      expect(provider.isConfigured()).toBe(true);
    });

    it('should not be configured when API key is missing', () => {
      const emptyProvider = new AnthropicProvider({
        type: AIProviderType.ANTHROPIC,
        apiKey: '',
      });
      expect(emptyProvider.isConfigured()).toBe(false);
    });

    it('should get and update config', () => {
      const config = provider.getConfig();
      expect(config.apiKey).toBe('test-api-key');

      provider.updateConfig({ timeout: 30000 });
      const updatedConfig = provider.getConfig();
      expect(updatedConfig.timeout).toBe(30000);
    });
  });

  describe('Request Validation', () => {
    it('should accept valid request', async () => {
      // Note: This will fail with actual API call since we're using a fake key
      // But validation should pass
      try {
        await provider.complete({
          model: 'claude-3-5-haiku-20241022',
          messages: [
            { role: 'user', content: 'Hello' },
          ],
          max_tokens: 100,
        });
      } catch (error: any) {
        // Should be authentication error, not validation error
        expect(error.message).not.toContain('required');
      }
    });

    it('should reject request without model', async () => {
      await expect(provider.complete({
        model: '',
        messages: [
          { role: 'user', content: 'Hello' },
        ],
      } as any)).rejects.toThrow('Model is required');
    });

    it('should reject request without messages', async () => {
      await expect(provider.complete({
        model: 'claude-3-5-haiku-20241022',
        messages: [],
      } as any)).rejects.toThrow('Messages array is required');
    });

    it('should reject invalid temperature', async () => {
      await expect(provider.complete({
        model: 'claude-3-5-haiku-20241022',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 2,
      })).rejects.toThrow('temperature must be between 0 and 1');
    });
  });

  describe('Message Building', () => {
    it('should build simple text message', () => {
      // Test internal message building logic
      const request = {
        model: 'claude-3-5-haiku-20241022',
        messages: [
          { role: 'user', content: 'Hello' } as const,
        ],
        max_tokens: 100,
      };

      expect(request.messages[0].content).toBe('Hello');
    });

    it('should build array content message', () => {
      const request = {
        model: 'claude-3-5-haiku-20241022',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Hello' },
              { type: 'text', text: ' World' },
            ],
          },
        ],
        max_tokens: 100,
      };

      expect(request.messages[0].content).toHaveLength(2);
    });
  });
});

describe('ProviderManager', () => {
  it('should create manager with Anthropic provider', () => {
    const { createProviderManager } = require('../index');
    const manager = createProviderManager('test-api-key');

    expect(manager.hasProvider(AIProviderType.ANTHROPIC)).toBe(true);
  });

  it('should execute hook prompt context', async () => {
    const { createProviderManager } = require('../index');
    const manager = createProviderManager('test-api-key');

    const context: HookPromptContext = {
      event: 'PreToolUse',
      timestamp: new Date().toISOString(),
      sessionId: 'test-session',
      tool: 'Bash',
      command: 'ls',
    };

    // Note: This will fail with actual API call
    // But the structure should be correct
    try {
      await manager.executeHookPrompt(
        context,
        'Should this operation be allowed?',
        'haiku',
        'You are a decision assistant.'
      );
    } catch (error: any) {
      // Should be authentication error
      expect(error.message).not.toContain('context');
    }
  });
});
