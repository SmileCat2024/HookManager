/**
 * Base AI Provider
 * Abstract base class for all AI providers
 */

import {
  IAIProvider,
  AIProviderType,
  AIProviderConfig,
  AICompletionRequest,
  AICompletionResult,
  AICompletionResponse,
  AIStreamChunk,
  AIStreamOptions,
  AIProviderError,
  AIAuthenticationError,
  AIRateLimitError,
  AIInvalidRequestError,
} from './types';

export abstract class BaseAIProvider implements IAIProvider {
  protected config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  /**
   * Get provider type
   */
  abstract get type(): AIProviderType;

  /**
   * Check if provider is configured and ready
   */
  isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  /**
   * Complete a prompt (non-streaming)
   */
  abstract complete(request: AICompletionRequest): Promise<AICompletionResult>;

  /**
   * Complete a prompt with streaming
   */
  abstract completeStream(
    request: AICompletionRequest,
    options?: AIStreamOptions
  ): AsyncIterable<AIStreamChunk>;

  /**
   * Get current configuration
   */
  getConfig(): AIProviderConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<AIProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Validate request before sending
   */
  protected validateRequest(request: AICompletionRequest): void {
    if (!request.model) {
      throw new AIInvalidRequestError('Model is required', this.type);
    }

    if (!request.messages || request.messages.length === 0) {
      throw new AIInvalidRequestError('Messages array is required and must not be empty', this.type);
    }

    // Validate message structure
    for (const message of request.messages) {
      if (!message.role || !message.content) {
        throw new AIInvalidRequestError('Each message must have role and content', this.type);
      }

      if (message.role !== 'user' && message.role !== 'assistant') {
        throw new AIInvalidRequestError(`Invalid message role: ${message.role}`, this.type);
      }
    }

    // Validate max_tokens
    if (request.max_tokens !== undefined && request.max_tokens < 1) {
      throw new AIInvalidRequestError('max_tokens must be at least 1', this.type);
    }

    // Validate temperature
    if (request.temperature !== undefined && (request.temperature < 0 || request.temperature > 1)) {
      throw new AIInvalidRequestError('temperature must be between 0 and 1', this.type);
    }

    // Validate top_p
    if (request.top_p !== undefined && (request.top_p < 0 || request.top_p > 1)) {
      throw new AIInvalidRequestError('top_p must be between 0 and 1', this.type);
    }
  }

  /**
   * Calculate token usage
   */
  protected calculateTokens(response: AICompletionResponse): { input: number; output: number; total: number } {
    const input = response.usage.input_tokens + (response.usage.cache_creation_input_tokens || 0) + (response.usage.cache_read_input_tokens || 0);
    const output = response.usage.output_tokens;
    return {
      input,
      output,
      total: input + output,
    };
  }

  /**
   * Handle provider-specific errors
   */
  protected handleError(error: unknown): AIProviderError {
    if (error instanceof AIProviderError) {
      return error;
    }

    const err = error as any;

    // Handle standard HTTP errors
    if (err?.status || err?.statusCode) {
      const status = err.status || err.statusCode;

      switch (status) {
        case 401:
        case 403:
          return new AIAuthenticationError(
            err.message || 'Authentication failed',
            this.type,
            error
          );
        case 429:
          return new AIRateLimitError(
            err.message || 'Rate limit exceeded',
            this.type,
            err.retryAfter,
            error
          );
        case 400:
          return new AIInvalidRequestError(
            err.message || 'Invalid request',
            this.type,
            error
          );
        default:
          return new AIProviderError(
            err.message || `Request failed with status ${status}`,
            this.type,
            error,
            status
          );
      }
    }

    // Handle network errors
    if (err?.code === 'ECONNREFUSED' || err?.code === 'ENOTFOUND') {
      return new AIProviderError(
        `Network error: ${err.message || 'Connection failed'}`,
        this.type,
        error
      );
    }

    // Handle timeout errors
    if (err?.code === 'ETIMEDOUT' || err?.message?.includes('timeout')) {
      return new AIProviderError(
        `Request timeout`,
        this.type,
        error
      );
    }

    // Default error
    return new AIProviderError(
      err?.message || 'Unknown error occurred',
      this.type,
      error
    );
  }

  /**
   * Build standard headers for API requests
   */
  protected buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.defaultHeaders,
    };

    return headers;
  }

  /**
   * Get request timeout
   */
  protected getTimeout(): number {
    return this.config.timeout || 60000; // Default 60 seconds
  }

  /**
   * Get max retries
   */
  protected getMaxRetries(): number {
    return this.config.maxRetries ?? 2; // Default 2 retries
  }
}
