/**
 * Anthropic Provider
 * Anthropic Claude API implementation using @anthropic-ai/sdk
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  BaseAIProvider,
} from './base-provider';
import {
  AIProviderType,
  AnthropicProviderConfig,
  AICompletionRequest,
  AICompletionResult,
  AICompletionResponse,
  AIStreamChunk,
  AIStreamOptions,
  AIProviderError,
  ContentBlock,
} from './types';

export class AnthropicProvider extends BaseAIProvider {
  private client: Anthropic | null = null;

  constructor(config: AnthropicProviderConfig) {
    super(config);
    this.initializeClient();
  }

  /**
   * Get provider type
   */
  get type(): AIProviderType {
    return AIProviderType.ANTHROPIC;
  }

  /**
   * Get typed config
   */
  private getAnthropicConfig(): AnthropicProviderConfig {
    return this.config as AnthropicProviderConfig;
  }

  /**
   * Initialize Anthropic SDK client
   */
  private initializeClient(): void {
    if (!this.config.apiKey) {
      this.client = null;
      return;
    }

    const anthropicConfig: AnthropicProviderConfig = this.getAnthropicConfig();

    // Initialize SDK with configuration
    // Following @anthropic-ai/sdk TypeScript usage
    const clientConfig: {
      apiKey: string;
      baseURL?: string;
      timeout?: number;
      maxRetries?: number;
      defaultHeaders?: Record<string, string>;
    } = {
      apiKey: anthropicConfig.apiKey,
    };

    // Optional: Custom base URL
    if (anthropicConfig.baseURL) {
      clientConfig.baseURL = anthropicConfig.baseURL;
    }

    // Optional: Timeout
    if (anthropicConfig.timeout) {
      clientConfig.timeout = anthropicConfig.timeout;
    }

    // Optional: Max retries
    if (anthropicConfig.maxRetries !== undefined) {
      clientConfig.maxRetries = anthropicConfig.maxRetries;
    }

    // Optional: Default headers
    if (anthropicConfig.defaultHeaders) {
      clientConfig.defaultHeaders = anthropicConfig.defaultHeaders;
    }

    this.client = new Anthropic(clientConfig);
  }

  /**
   * Recreate client after config update
   */
  public override updateConfig(config: Partial<AnthropicProviderConfig>): void {
    super.updateConfig(config);
    this.initializeClient();
  }

  /**
   * Check if provider is configured and ready
   */
  isConfigured(): boolean {
    return !!this.client;
  }

  /**
   * Build MessageParam for SDK
   * Following Anthropic SDK format: { role: 'user' | 'assistant', content: string | Array<ContentBlock> }
   */
  private buildMessageParams(messages: AICompletionRequest['messages']): Anthropic.MessageParam[] {
    return messages.map(msg => {
      // Handle string content
      if (typeof msg.content === 'string') {
        return {
          role: msg.role,
          content: msg.content,
        } as Anthropic.MessageParam;
      }

      // Handle array content blocks
      return {
        role: msg.role,
        content: msg.content.map(block => {
          if (block.type === 'text') {
            return {
              type: 'text',
              text: block.text,
            } as Anthropic.TextBlockParam;
          }
          if (block.type === 'image') {
            return {
              type: 'image',
              source: {
                type: block.source.type,
                media_type: block.source.media_type,
                data: block.source.data,
              },
            } as Anthropic.ImageBlockParam;
          }
          if (block.type === 'tool_use') {
            return {
              type: 'tool_use',
              id: block.id,
              name: block.name,
              input: block.input,
            } as Anthropic.ToolUseBlockParam;
          }
          if (block.type === 'tool_result') {
            // Tool result content can be string or array of blocks
            const content = block.content;
            if (typeof content === 'string') {
              return {
                type: 'tool_result',
                tool_use_id: block.tool_use_id,
                content: content,
                is_error: block.is_error,
              } as Anthropic.ToolResultBlockParam;
            }
            if (Array.isArray(content)) {
              return {
                type: 'tool_result',
                tool_use_id: block.tool_use_id,
                content: content.map(cb => {
                  if (cb.type === 'text') {
                    return {
                      type: 'text',
                      text: cb.text,
                    } as Anthropic.TextBlockParam;
                  }
                  if (cb.type === 'image') {
                    return {
                      type: 'image',
                      source: {
                        type: cb.source.type,
                        media_type: cb.source.media_type,
                        data: cb.source.data,
                      },
                    } as Anthropic.ImageBlockParam;
                  }
                  return cb;
                }),
                is_error: block.is_error,
              } as Anthropic.ToolResultBlockParam;
            }
          }
          return block;
        }),
      } as Anthropic.MessageParam;
    });
  }

  /**
   * Build Tool definitions for SDK
   */
  private buildToolParams(tools?: AICompletionRequest['tools']): Anthropic.Tool[] | undefined {
    if (!tools) {
      return undefined;
    }

    return tools.map(tool => {
      const toolDef: Anthropic.Tool = {
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema as Anthropic.Tool.InputSchema,
      };
      return toolDef;
    });
  }

  /**
   * Build tool_choice parameter for SDK
   */
  private buildToolChoiceParam(
    toolChoice?: AICompletionRequest['tool_choice']
  ): Anthropic.MessageCreateParams['tool_choice'] {
    if (!toolChoice) {
      return undefined;
    }

    if (toolChoice.type === 'auto') {
      return { type: 'auto' };
    }
    if (toolChoice.type === 'any') {
      return { type: 'any' };
    }
    if (toolChoice.type === 'tool' && toolChoice.name) {
      return { type: 'tool', name: toolChoice.name };
    }

    return { type: 'auto' };
  }

  /**
   * Complete a prompt (non-streaming)
   * Uses @anthropic-ai/sdk messages.create method
   */
  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    // Validate request
    this.validateRequest(request);

    if (!this.client) {
      throw new AIProviderError('Anthropic client not configured. Please provide API key.', this.type);
    }

    const startTime = Date.now();

    try {
      // Build request parameters following SDK format
      const params: Anthropic.MessageCreateParams = {
        model: request.model, // Model name passed through directly - no mapping
        messages: this.buildMessageParams(request.messages),
        max_tokens: request.max_tokens ?? 4096,
        temperature: request.temperature,
        top_p: request.top_p,
        top_k: request.top_k,
        stop_sequences: request.stop_sequences,
        system: request.system,
        tools: this.buildToolParams(request.tools),
        tool_choice: this.buildToolChoiceParam(request.tool_choice),
      };

      // Remove undefined values
      const cleanParams: Anthropic.MessageCreateParams = Object.fromEntries(
        Object.entries(params).filter(([_, v]) => v !== undefined)
      ) as Anthropic.MessageCreateParams;

      // Call API using SDK
      // We use type assertion since we're not passing stream: true
      const response = await this.client.messages.create({
        ...cleanParams,
      }) as Anthropic.Message;

      const duration = Date.now() - startTime;

      // Convert SDK response to standard format
      const completionResponse: AICompletionResponse = {
        id: response.id,
        type: 'message',
        role: 'assistant',
        content: response.content.map(block => this.convertContentBlock(block)),
        model: response.model,
        stop_reason: this.convertStopReason(response.stop_reason),
        stop_sequence: response.stop_sequence,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
          cache_read_input_tokens: response.usage.cache_read_input_tokens,
        },
      };

      const tokens = this.calculateTokens(completionResponse);

      return {
        response: completionResponse,
        model: request.model,
        provider: this.type,
        duration,
        tokens,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Convert SDK stop reason to standard format
   */
  private convertStopReason(reason: Anthropic.StopReason | null): 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' {
    if (reason === 'tool_use') return 'tool_use';
    if (reason === 'end_turn') return 'end_turn';
    if (reason === 'max_tokens') return 'max_tokens';
    if (reason === 'stop_sequence') return 'stop_sequence';
    // Default for 'pause_turn', 'refusal', or null
    return 'end_turn';
  }

  /**
   * Convert SDK content block to standard format
   */
  private convertContentBlock(block: Anthropic.ContentBlock): ContentBlock {
    if (block.type === 'text') {
      return {
        type: 'text',
        text: block.text,
      };
    }
    if (block.type === 'tool_use') {
      return {
        type: 'tool_use',
        id: block.id,
        name: block.name,
        input: block.input as Record<string, any>,
      };
    }
    // For thinking, redacted_thinking, server_tool_use, web_search_tool_result - return as unknown text
    if (block.type === 'thinking' || block.type === 'redacted_thinking' || block.type === 'server_tool_use' || block.type === 'web_search_tool_result') {
      return {
        type: 'text',
        text: `[${block.type} content not displayed]`,
      };
    }
    // Fallback
    return {
      type: 'text',
      text: JSON.stringify(block),
    };
  }

  /**
   * Complete a prompt with streaming
   * Uses @anthropic-ai/sdk messages.create method with stream: true
   */
  async *completeStream(
    request: AICompletionRequest,
    options?: AIStreamOptions
  ): AsyncIterable<AIStreamChunk> {
    // Validate request
    this.validateRequest(request);

    if (!this.client) {
      throw new AIProviderError('Anthropic client not configured. Please provide API key.', this.type);
    }

    const startTime = Date.now();
    let accumulatedResponse: AICompletionResponse | null = null;

    try {
      // Build request parameters following SDK format
      const params: Anthropic.MessageCreateParams = {
        model: request.model, // Model name passed through directly
        messages: this.buildMessageParams(request.messages),
        max_tokens: request.max_tokens ?? 4096,
        temperature: request.temperature,
        top_p: request.top_p,
        top_k: request.top_k,
        stop_sequences: request.stop_sequences,
        system: request.system,
        tools: this.buildToolParams(request.tools),
        tool_choice: this.buildToolChoiceParam(request.tool_choice),
      };

      // Remove undefined values
      const cleanParams: Anthropic.MessageCreateParams = Object.fromEntries(
        Object.entries(params).filter(([_, v]) => v !== undefined)
      ) as Anthropic.MessageCreateParams;

      // Create streaming request using SDK
      const stream = await this.client.messages.create({
        ...cleanParams,
        stream: true,
      });

      // Process streaming events
      for await (const event of stream) {
        const chunk: AIStreamChunk = {
          type: event.type,
          index: (event as any).index,
          delta: (event as any).delta,
          content_block: (event as any).content_block,
          message: (event as any).message,
        };

        // Accumulate response for final result
        if (event.type === 'message_start') {
          const msgStart = event as Anthropic.MessageStartEvent;
          accumulatedResponse = {
            id: msgStart.message.id,
            type: 'message',
            role: 'assistant',
            content: [],
            model: msgStart.message.model,
            stop_reason: 'end_turn',
            usage: {
              input_tokens: 0,
              output_tokens: 0,
            },
          };
        } else if (event.type === 'message_delta') {
          const msgDelta = event as Anthropic.MessageDeltaEvent;
          if (accumulatedResponse && msgDelta.usage) {
            accumulatedResponse.stop_reason = this.convertStopReason(msgDelta.delta.stop_reason || 'end_turn');
            accumulatedResponse.usage = {
              input_tokens: msgDelta.usage.input_tokens,
              output_tokens: msgDelta.usage.output_tokens,
            };
          }
        } else if (event.type === 'content_block_start' && accumulatedResponse) {
          const blockStart = event as Anthropic.ContentBlockStartEvent;
          if (blockStart.content_block.type === 'text') {
            accumulatedResponse.content.push({
              type: 'text',
              text: '',
            });
          } else if (blockStart.content_block.type === 'tool_use') {
            accumulatedResponse.content.push({
              type: 'tool_use',
              id: blockStart.content_block.id,
              name: blockStart.content_block.name,
              input: {},
            });
          }
        } else if (event.type === 'content_block_delta' && accumulatedResponse) {
          const blockDelta = event as Anthropic.ContentBlockDeltaEvent;
          const index = (event as any).index;
          if (blockDelta.delta.type === 'text_delta' && accumulatedResponse.content[index]?.type === 'text') {
            (accumulatedResponse.content[index] as { type: 'text'; text: string }).text += blockDelta.delta.text;
          } else if (blockDelta.delta.type === 'input_json_delta' && accumulatedResponse.content[index]?.type === 'tool_use') {
            const toolBlock = accumulatedResponse.content[index] as { type: 'tool_use'; id: string; name: string; input: Record<string, any> };
            try {
              const partial = JSON.parse(blockDelta.delta.partial_json);
              toolBlock.input = { ...toolBlock.input, ...partial };
            } catch {
              // Skip invalid JSON
            }
          }
        }

        // Notify callback if provided
        if (options?.onChunk) {
          try {
            options.onChunk(chunk);
          } catch {
            // Ignore callback errors
          }
        }

        yield chunk;
      }

      // Final callback
      if (options?.onComplete && accumulatedResponse) {
        const duration = Date.now() - startTime;
        const tokens = this.calculateTokens(accumulatedResponse);

        try {
          options.onComplete({
            response: accumulatedResponse,
            model: request.model,
            provider: this.type,
            duration,
            tokens,
          });
        } catch {
          // Ignore callback errors
        }
      }
    } catch (error) {
      const providerError = this.handleError(error);

      if (options?.onError) {
        try {
          options.onError(providerError);
        } catch {
          // Ignore callback errors
        }
      }

      throw providerError;
    }
  }

  /**
   * Create a simple text completion (convenience method)
   * Converts text prompt to message format
   */
  async completeText(
    prompt: string,
    model?: string,
    systemPrompt?: string
  ): Promise<AICompletionResult> {
    return this.complete({
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
   * Create a simple text completion with streaming (convenience method)
   */
  async *completeTextStream(
    prompt: string,
    model?: string,
    systemPrompt?: string,
    options?: AIStreamOptions
  ): AsyncIterable<AIStreamChunk> {
    yield* this.completeStream(
      {
        model: model || 'claude-3-5-haiku-20241022',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        system: systemPrompt,
        max_tokens: 4096,
      },
      options
    );
  }
}
