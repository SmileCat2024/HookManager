/**
 * AI Provider Type Definitions
 * Types for AI provider abstraction layer
 */

// ============================================================================
// Provider Types
// ============================================================================

export enum AIProviderType {
  ANTHROPIC = 'anthropic',
  OPENAI = 'openai',
}

export enum AIModel {
  // Anthropic Models (pass through directly)
  CLAUDE_HAIKU = 'claude-3-5-haiku-20241022',
  CLAUDE_HAIKU_LATEST = 'claude-3-5-haiku-latest',
  CLAUDE_SONNET = 'claude-3-5-sonnet-20241022',
  CLAUDE_SONNET_LATEST = 'claude-3-5-sonnet-latest',
  CLAUDE_OPUS = 'claude-3-5-opus-20241022',
  CLAUDE_OPUS_LATEST = 'claude-3-5-opus-latest',

  // Legacy model name support (will be passed through)
  HAIKU = 'haiku',
  SONNET = 'sonnet',
  OPUS = 'opus',

  // OpenAI Models (pass through directly)
  GPT_4O = 'gpt-4o',
  GPT_4O_MINI = 'gpt-4o-mini',
  GPT_4_TURBO = 'gpt-4-turbo',
  GPT_35_TURBO = 'gpt-3.5-turbo',

  // Custom models (will be passed through as-is)
  CUSTOM = 'custom',
}

// ============================================================================
// Message Types (following Anthropic SDK format)
// ============================================================================

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, any> }
  | { type: 'tool_result'; tool_use_id: string; content?: string | Array<ContentBlock>; is_error?: boolean };

export type MessageRole = 'user' | 'assistant';

export interface AIMessage {
  role: MessageRole;
  content: string | Array<ContentBlock>;
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface AICompletionRequest {
  model: string;
  messages: AIMessage[];
  system?: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  tools?: Array<{
    name: string;
    description: string;
    input_schema: Record<string, any>;
  }>;
  tool_choice?: { type: 'auto' | 'any' | 'tool'; name?: string };
}

export interface AICompletionResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<ContentBlock>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
  stop_sequence?: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export interface AIStreamChunk {
  type: 'message_start' | 'message_delta' | 'message_stop' | 'content_block_start' | 'content_block_delta' | 'content_block_stop';
  index?: number;
  delta?: any;
  content_block?: ContentBlock;
  message?: AICompletionResponse;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface AIProviderConfig {
  type: AIProviderType;
  apiKey?: string;
  baseURL?: string;
  timeout?: number;
  maxRetries?: number;
  defaultHeaders?: Record<string, string>;
}

export interface AnthropicProviderConfig extends AIProviderConfig {
  type: AIProviderType.ANTHROPIC;
  apiKey: string;
  baseURL?: string; // Default: https://api.anthropic.com
  version?: string; // Default: 2023-06-01
  beta?: string[]; // Beta headers to include
}

export interface OpenAIProviderConfig extends AIProviderConfig {
  type: AIProviderType.OPENAI;
  apiKey: string;
  baseURL?: string; // Default: https://api.openai.com/v1
  organization?: string;
}

// ============================================================================
// Error Types
// ============================================================================

export class AIProviderError extends Error {
  constructor(
    message: string,
    public provider: AIProviderType,
    public originalError?: unknown,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

export class AIAuthenticationError extends AIProviderError {
  constructor(message: string, provider: AIProviderType, originalError?: unknown) {
    super(message, provider, originalError, 401);
    this.name = 'AIAuthenticationError';
  }
}

export class AIRateLimitError extends AIProviderError {
  constructor(
    message: string,
    provider: AIProviderType,
    public retryAfter?: number,
    originalError?: unknown
  ) {
    super(message, provider, originalError, 429);
    this.name = 'AIRateLimitError';
  }
}

export class AIInvalidRequestError extends AIProviderError {
  constructor(message: string, provider: AIProviderType, originalError?: unknown) {
    super(message, provider, originalError, 400);
    this.name = 'AIInvalidRequestError';
  }
}

// ============================================================================
// Result Types
// ============================================================================

export interface AICompletionResult {
  response: AICompletionResponse;
  model: string;
  provider: AIProviderType;
  duration: number;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
}

export interface AIStreamOptions {
  onChunk?: (chunk: AIStreamChunk) => void;
  onComplete?: (result: AICompletionResult) => void;
  onError?: (error: AIProviderError) => void;
}

// ============================================================================
// Base Provider Interface
// ============================================================================

export interface IAIProvider {
  /**
   * Get provider type
   */
  readonly type: AIProviderType;

  /**
   * Check if provider is configured and ready
   */
  isConfigured(): boolean;

  /**
   * Complete a prompt (non-streaming)
   */
  complete(request: AICompletionRequest): Promise<AICompletionResult>;

  /**
   * Complete a prompt with streaming
   */
  completeStream(request: AICompletionRequest, options?: AIStreamOptions): AsyncIterable<AIStreamChunk>;

  /**
   * Get current configuration
   */
  getConfig(): AIProviderConfig;

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AIProviderConfig>): void;
}

// ============================================================================
// Hook Context Types
// ============================================================================

export interface HookPromptContext {
  event: string;
  timestamp: string;
  sessionId: string;
  userId?: string;
  projectId?: string;
  tool?: string;
  command?: string;
  input?: any;
  output?: any;
  metadata?: Record<string, any>;
  environment?: Record<string, string>;
  projectDir?: string;
  pluginRoot?: string;
  envFile?: string;
}

export interface HookPromptResult {
  ok: boolean;
  reason?: string;
  decision?: 'allow' | 'deny' | 'continue' | 'block';
  updatedInput?: any;
  additionalContext?: any;
}

// ============================================================================
// Export all types
// ============================================================================
