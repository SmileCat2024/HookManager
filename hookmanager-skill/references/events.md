# Lifecycle Events

These events can be intercepted by HookManager.

## Session Events
- `SessionStart`: Triggered when a new session begins.
- `SessionEnd`: Triggered when a session ends.
- `SessionResume`: Triggered when a session is resumed.

## Tool Events
- `PreToolUse`: Triggered before a tool is executed. Ideal for validation or auditing.
- `PostToolUse`: Triggered after a tool execution completes successfully.
- `PostToolUseFailure`: Triggered if a tool execution fails.

## User Interaction
- `UserPromptSubmit`: Triggered when the user submits a prompt.
- `UserPromptEdit`: Triggered when the user edits a prompt.

## Response Events
- `ResponseStart`: Triggered when the AI starts generating a response.
- `ResponseEnd`: Triggered when the AI finishes a response.
- `ResponseChunk`: Triggered for streaming response chunks (use with caution due to volume).

## Subagent Events
- `SubagentStart`: Triggered when a subagent starts.
- `SubagentStop`: Triggered when a subagent stops.
- `SubagentSpawn`: Triggered when a subagent is spawned.

## Context Events
- `ContextCompact`: Triggered when context is compacted.
- `ContextExpand`: Triggered when context is expanded.
- `ContextTruncate`: Triggered when context is truncated.

## System Events
- `PermissionRequest`: Triggered when permission is requested.
- `PermissionGranted`: Triggered when permission is granted.
- `PermissionDenied`: Triggered when permission is denied.
- `Notification`: General notification event.
- `Alert`: Alert event.
- `Warning`: Warning event.
- `Error`: Error event.
- `Exception`: Exception event.
