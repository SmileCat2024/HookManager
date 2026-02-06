/**
 * Provider Manager
 * Central manager for AI providers with factory pattern
 */

import {
  AnthropicProvider,
} from './anthropic-provider';
import {
  OpenAIProvider,
} from './openai-provider';
import {
  IAIProvider,
  AIProviderType,
  AIProviderConfig,
  AnthropicProviderConfig,
  OpenAIProviderConfig,
  AICompletionRequest,
  AICompletionResult,
  AIStreamChunk,
  AIStreamOptions,
  HookPromptContext,
  HookPromptResult,
} from './types';

export interface ProviderManagerConfig {
  defaultProvider?: AIProviderType;
  providers?: Array<AIProviderConfig>;
}

export class ProviderManager {
  private providers: Map<AIProviderType, IAIProvider> = new Map();
  private defaultProvider: AIProviderType;

  constructor(config?: ProviderManagerConfig) {
    this.defaultProvider = config?.defaultProvider || AIProviderType.ANTHROPIC;

    // Initialize providers from config
    if (config?.providers) {
      for (const providerConfig of config.providers) {
        this.registerProvider(providerConfig);
      }
    }
  }

  /**
   * Register a provider
   */
  registerProvider(config: AIProviderConfig): void {
    let provider: IAIProvider;

    switch (config.type) {
      case AIProviderType.ANTHROPIC:
        provider = new AnthropicProvider(config as AnthropicProviderConfig);
        break;
      case AIProviderType.OPENAI:
        provider = new OpenAIProvider(config as OpenAIProviderConfig);
        break;
      default:
        throw new Error(`Unsupported provider type: ${(config as any).type}`);
    }

    this.providers.set(config.type, provider);
  }

  /**
   * Get a provider by type
   */
  getProvider(type?: AIProviderType): IAIProvider {
    const providerType = type || this.defaultProvider;
    const provider = this.providers.get(providerType);

    if (!provider) {
      throw new Error(`Provider not registered: ${providerType}`);
    }

    return provider;
  }

  /**
   * Get the default provider
   */
  getDefaultProvider(): IAIProvider {
    return this.getProvider(this.defaultProvider);
  }

  /**
   * Set the default provider
   */
  setDefaultProvider(type: AIProviderType): void {
    if (!this.providers.has(type)) {
      throw new Error(`Cannot set default to unregistered provider: ${type}`);
    }
    this.defaultProvider = type;
  }

  /**
   * Check if a provider is registered
   */
  hasProvider(type: AIProviderType): boolean {
    return this.providers.has(type);
  }

  /**
   * Get all registered provider types
   */
  getRegisteredProviders(): AIProviderType[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Remove a provider
   */
  unregisterProvider(type: AIProviderType): void {
    this.providers.delete(type);

    // Reset default if needed
    if (this.defaultProvider === type && this.providers.size > 0) {
      this.defaultProvider = this.providers.keys().next().value;
    }
  }

  /**
   * Complete a request using the specified or default provider
   */
  async complete(request: AICompletionRequest, providerType?: AIProviderType): Promise<AICompletionResult> {
    const provider = this.getProvider(providerType);
    return provider.complete(request);
  }

  /**
   * Complete a request with streaming
   */
  async *completeStream(
    request: AICompletionRequest,
    providerType?: AIProviderType,
    options?: AIStreamOptions
  ): AsyncIterable<AIStreamChunk> {
    const provider = this.getProvider(providerType);
    yield* provider.completeStream(request, options);
  }

  /**
   * Simple text completion
   */
  async completeText(
    prompt: string,
    model?: string,
    systemPrompt?: string,
    providerType?: AIProviderType
  ): Promise<AICompletionResult> {
    const provider = this.getProvider(providerType);

    // Use Anthropic provider's convenience method if available
    if (provider instanceof AnthropicProvider) {
      return provider.completeText(prompt, model, systemPrompt);
    }

    // Fall back to standard completion
    return provider.complete({
      model: model || 'claude-3-5-haiku-20241022',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      system: systemPrompt,
      max_tokens: 4096,
    });
  }

  /**
   * Execute a hook prompt and get structured decision result
   * This replaces the executePrompt method in HookExecutor
   */
  async executeHookPrompt(
    context: HookPromptContext,
    prompt: string,
    model?: string,
    systemPrompt?: string,
    providerType?: AIProviderType
  ): Promise<HookPromptResult> {
    const provider = this.getProvider(providerType);

    // Build full prompt with context
    const payload = {
      event: context.event,
      timestamp: context.timestamp,
      sessionId: context.sessionId,
      userId: context.userId,
      projectId: context.projectId,
      tool: context.tool,
      command: context.command,
      input: context.input,
      output: context.output,
      metadata: context.metadata,
      environment: context.environment,
      projectDir: context.projectDir,
      pluginRoot: context.pluginRoot,
      envFile: context.envFile,
    };

    const payloadJSON = JSON.stringify(payload, null, 2);

    // Process prompt - replace $ARGUMENTS with payload, or append payload
    let finalPrompt: string;
    if (prompt.includes('$ARGUMENTS')) {
      finalPrompt = prompt.replace('$ARGUMENTS', payloadJSON);
    } else {
      finalPrompt = `${prompt}\n\nContext:\n${payloadJSON}`;
    }

    const defaultSystemPrompt = systemPrompt || 'You are a decision assistant. Evaluate the given context and respond with a JSON decision containing "ok" (boolean) and optionally "reason" (string).';

    try {
      // Execute completion
      const result = await provider.complete({
        model: model || 'haiku',
        messages: [
          {
            role: 'user',
            content: finalPrompt,
          },
        ],
        system: defaultSystemPrompt,
        max_tokens: 1024,
      });

      // Parse response
      const responseText = this.extractTextFromResponse(result.response);
      const modelOutput = this.parseModelOutput(responseText);

      return {
        ok: modelOutput.ok ?? true,
        reason: modelOutput.reason,
        decision: modelOutput.ok ? 'allow' : 'deny',
      };
    } catch (error) {
      // On failure, default to ok: true to allow operation to continue
      return {
        ok: true,
        reason: `Prompt execution failed: ${error instanceof Error ? error.message : String(error)}`,
        decision: 'allow',
      };
    }
  }

  /**
   * Extract text content from response
   */
  private extractTextFromResponse(response: import('./types').AICompletionResponse): string {
    const textBlocks = response.content.filter(block => block.type === 'text');
    return textBlocks.map(block => (block.type === 'text' ? block.text : '')).join('\n');
  }

  /**
   * Parse model output to extract decision
   */
  private parseModelOutput(output: string): { ok?: boolean; reason?: string } {
    // Try to extract JSON from the output
    const jsonMatch = output.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          ok: parsed.ok ?? true,
          reason: parsed.reason || parsed.message || '',
        };
      } catch {
        // If parsing fails, continue to keyword check
      }
    }

    // No JSON found, check for true/false keywords
    const lowerOutput = output.toLowerCase();
    if (lowerOutput.includes('false') || lowerOutput.includes('deny') || lowerOutput.includes('block')) {
      return {
        ok: false,
        reason: output.substring(0, 200),
      };
    }

    return {
      ok: true,
      reason: output.substring(0, 200) || 'Allowed by default',
    };
  }

  /**
   * Get provider statistics
   */
  getStats(): Record<string, { configured: boolean; type: AIProviderType }> {
    const stats: Record<string, { configured: boolean; type: AIProviderType }> = {};

    for (const [type, provider] of this.providers.entries()) {
      stats[type] = {
        configured: provider.isConfigured(),
        type,
      };
    }

    return stats;
  }

  /**
   * Clear all providers
   */
  clear(): void {
    this.providers.clear();
    this.defaultProvider = AIProviderType.ANTHROPIC;
  }
}

/**
 * Create a provider manager with Anthropic provider pre-configured
 */
export function createProviderManager(apiKey: string, config?: Omit<ProviderManagerConfig, 'providers'>): ProviderManager {
  const manager = new ProviderManager(config);

  // Register Anthropic provider with API key
  manager.registerProvider({
    type: AIProviderType.ANTHROPIC,
    apiKey,
  });

  return manager;
}
