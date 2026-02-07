/**
 * Event Matcher Validation Utilities
 *
 * Provides validation for matcher values based on event types.
 * Different events have different matcher target fields and valid values.
 */

import { HookEvent } from '../types';

/**
 * Matcher configuration for each event type
 */
export interface EventMatcherConfig {
  /** The field that matcher targets (e.g., 'tool', 'metadata.source') */
  field: string;
  /** Description of what this field represents */
  description: string;
  /** Valid values for this event's matcher (supports regex wildcards) */
  validValues: string[];
  /** Examples of valid matcher patterns */
  examples: string[];
}

/**
 * Event matcher validation map
 * Defines what each event's matcher can match against
 */
export const EVENT_MATCHER_MAP: Record<HookEvent, EventMatcherConfig> = {
  // ============================================================
  // Tool Events - matcher matches tool name
  // ============================================================
  [HookEvent.PreToolUse]: {
    field: 'tool',
    description: 'Tool name',
    validValues: [
      'Bash', 'Edit', 'Write', 'MultiEdit', 'Read',
      'Glob', 'Grep', 'LS',
      'WebSearch', 'WebFetch',
      'Task', 'TodoWrite',
      'NotebookEdit', 'NotebookRead',
      'mcp__.*',
      '.*'
    ],
    examples: [
      'Bash - Match Bash tool only',
      'Bash|Write - Match Bash or Write',
      'mcp__.* - Match all MCP tools',
      '.* - Match all tools (wildcard)'
    ]
  },
  [HookEvent.PostToolUse]: {
    field: 'tool',
    description: 'Tool name',
    validValues: [
      'Bash', 'Edit', 'Write', 'MultiEdit', 'Read',
      'Glob', 'Grep', 'LS',
      'WebSearch', 'WebFetch',
      'Task', 'TodoWrite',
      'NotebookEdit', 'NotebookRead',
      'mcp__.*',
      '.*'
    ],
    examples: [
      'Bash - Match Bash tool only',
      'Bash|Write - Match Bash or Write',
      'mcp__.* - Match all MCP tools',
      '.* - Match all tools (wildcard)'
    ]
  },
  [HookEvent.PostToolUseFailure]: {
    field: 'tool',
    description: 'Tool name',
    validValues: [
      'Bash', 'Edit', 'Write', 'MultiEdit', 'Read',
      'Glob', 'Grep', 'LS',
      'WebSearch', 'WebFetch',
      'Task', 'TodoWrite',
      'NotebookEdit', 'NotebookRead',
      'mcp__.*',
      '.*'
    ],
    examples: [
      'Bash - Match Bash tool only',
      'Bash|Write - Match Bash or Write',
      'mcp__.* - Match all MCP tools',
      '.* - Match all tools (wildcard)'
    ]
  },

  // ============================================================
  // Session Events - matcher matches metadata fields
  // ============================================================
  [HookEvent.SessionStart]: {
    field: 'metadata.source',
    description: 'Session source type',
    validValues: ['startup', 'resume', 'clear', 'compact', '.*'],
    examples: [
      'startup - Match startup sessions',
      'resume - Match resumed sessions',
      'startup|resume - Match either',
      '.* - Match all (wildcard)'
    ]
  },
  [HookEvent.SessionEnd]: {
    field: 'metadata.reason',
    description: 'Session end reason',
    validValues: ['clear', 'logout', 'prompt_input_exit', 'bypass_permissions_disabled', 'other', '.*'],
    examples: [
      'clear - Match cleared sessions',
      'logout - Match logout sessions',
      '.* - Match all (wildcard)'
    ]
  },

  // ============================================================
  // Agent Events - matcher matches metadata.agent_type
  // ============================================================
  [HookEvent.SubagentStart]: {
    field: 'metadata.agent_type',
    description: 'Subagent type',
    validValues: ['Bash', 'Explore', 'Plan', 'Code', '.*'],
    examples: [
      'Bash - Match Bash subagents',
      'Explore - Match Explore subagents',
      '.* - Match all (wildcard)'
    ]
  },
  [HookEvent.SubagentStop]: {
    field: 'metadata.agent_type',
    description: 'Subagent type',
    validValues: ['Bash', 'Explore', 'Plan', 'Code', '.*'],
    examples: [
      'Bash - Match Bash subagents',
      'Explore - Match Explore subagents',
      '.* - Match all (wildcard)'
    ]
  },

  // ============================================================
  // Notification Events - matcher matches metadata.type
  // ============================================================
  [HookEvent.Notification]: {
    field: 'metadata.type',
    description: 'Notification type',
    validValues: ['permission_prompt', 'idle_prompt', 'auth_success', 'elicitation_dialog', '.*'],
    examples: [
      'permission_prompt - Match permission prompts',
      'idle_prompt - Match idle prompts',
      '.* - Match all (wildcard)'
    ]
  },

  // ============================================================
  // Context Events - matcher matches metadata.trigger
  // ============================================================
  [HookEvent.PreCompact]: {
    field: 'metadata.trigger',
    description: 'Compaction trigger',
    validValues: ['manual', 'auto', '.*'],
    examples: [
      'manual - Match manual compaction',
      'auto - Match automatic compaction',
      '.* - Match all (wildcard)'
    ]
  },

  // ============================================================
  // Events that DO NOT support matcher
  // ============================================================
  [HookEvent.UserPromptSubmit]: {
    field: 'N/A',
    description: 'This event does not support matcher',
    validValues: [],
    examples: []
  },
  [HookEvent.PermissionRequest]: {
    field: 'N/A',
    description: 'This event does not support matcher',
    validValues: [],
    examples: []
  },
  [HookEvent.Stop]: {
    field: 'N/A',
    description: 'This event does not support matcher',
    validValues: [],
    examples: []
  },
  [HookEvent.TeammateIdle]: {
    field: 'N/A',
    description: 'This event does not support matcher',
    validValues: [],
    examples: []
  },
  [HookEvent.TaskCompleted]: {
    field: 'N/A',
    description: 'This event does not support matcher',
    validValues: [],
    examples: []
  }
};

/**
 * Check if an event supports matcher
 */
export function eventSupportsMatcher(event: HookEvent): boolean {
  const config = EVENT_MATCHER_MAP[event];
  return config.validValues.length > 0;
}

/**
 * Get matcher configuration for an event
 */
export function getMatcherConfig(event: HookEvent): EventMatcherConfig {
  return EVENT_MATCHER_MAP[event];
}

/**
 * Validate a matcher pattern for an event
 * @returns { valid: boolean, error?: string, suggestions?: string[] }
 */
export function validateMatcherForEvent(
  event: HookEvent,
  matcher: string
): { valid: boolean; error?: string; suggestions?: string[] } {
  const config = EVENT_MATCHER_MAP[event];

  // Check if event supports matcher
  if (!eventSupportsMatcher(event)) {
    return {
      valid: false,
      error: `Event "${event}" does not support matcher.`,
      suggestions: []
    };
  }

  // Wildcard patterns are always valid
  if (matcher === '*' || matcher === '' || matcher === '.*') {
    return { valid: true };
  }

  // Check if matcher contains only valid regex characters or tool names
  // For simplicity, we allow regex patterns but warn if they don't match known values
  const hasAlternation = matcher.includes('|');
  const hasWildcard = matcher.includes('.*') || matcher.includes('*');
  const hasWildcardSingle = matcher.includes('.');

  if (hasAlternation || hasWildcard || hasWildcardSingle) {
    // It's a regex pattern, assume it's valid
    return { valid: true };
  }

  // Check exact match against known values
  if (config.validValues.includes(matcher)) {
    return { valid: true };
  }

  // Not found in valid values, provide suggestions
  return {
    valid: false,
    error: `Matcher "${matcher}" is not a known value for ${event}.`,
    suggestions: config.validValues.slice(0, 10) // Limit suggestions
  };
}

/**
 * Get human-readable validation result for matcher
 */
export function getMatcherValidationMessage(
  event: HookEvent,
  matcher: string | undefined
): string | null {
  if (!matcher) {
    return null;
  }

  const result = validateMatcherForEvent(event, matcher);
  if (result.valid) {
    return null;
  }

  let message = result.error || '';
  if (result.suggestions && result.suggestions.length > 0) {
    message += `\n\nValid matchers for ${event}:\n  - ${result.suggestions.slice(0, 8).join('\n  - ')}`;
    if (result.suggestions.length > 8) {
      message += `\n  - ... and ${result.suggestions.length - 8} more`;
    }
  }

  const config = getMatcherConfig(event);
  if (config.examples.length > 0) {
    message += `\n\nExamples:\n  - ${config.examples.slice(0, 3).join('\n  - ')}`;
  }

  return message;
}
