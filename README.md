# HookManager

> Universal hook manager for Claude Code - manage all lifecycle hooks via CLI

HookManager provides a unified interface to manage Claude Code hooks through a single "universal hook" that intercepts all lifecycle events and delegates to user-configured hooks stored in JSON files.

## Quick Start

### 1. Install
```bash
npm install -g @smilecat2026/hook-manager
```

### 2. Initialize
```bash
# Initialize project configuration (default)
hookmanager init

# Initialize global configuration
hookmanager init --global
```

### 3. Add a Hook
```bash
# Add to project configuration (default)
hookmanager add security-audit PreToolUse "npm audit" \
  --description "Run npm audit before package installation" \
  --filter-commands "npm install,npm ci" \
  --priority 100

# Add to global configuration
hookmanager add security-audit PreToolUse "npm audit" \
  --description "Run npm audit before package installation" \
  --filter-commands "npm install,npm ci" \
  --priority 100 \
  --global
```

**Note**: `PreToolUse` is the correct event name. Valid events include: SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, SubagentStart, SubagentStop, etc.

### 4. List Hooks
```bash
# List project hooks (default)
hookmanager list

# List global hooks
hookmanager list --global
```

**Note**: The `--global` flag distinguishes between global and project hooks:
- Without `--global`: Shows only project-specific hooks
- With `--global`: Shows only global hooks that apply to all projects

### 5. View Logs
```bash
hookmanager logs --tail 20
```

### 6. Uninstall
```bash
# Remove from project configuration (default)
hookmanager uninstall

# Remove from global configuration
hookmanager uninstall --global

# Remove everything including hooks configuration folder
hookmanager uninstall --purge
```

## Core Features

- **Universal Hook**: Single hook intercepts all Claude Code lifecycle events
- **JSON Configuration**: Store hooks in JSON files (global and project-level)
- **Hook Composition**: Multiple hooks per lifecycle with priority ordering
- **Comprehensive Logging**: Built-in log management with rotation and export
- **Security**: Command validation, path traversal protection, sandbox mode
- **Performance**: Parallel execution support, timeout handling, retry logic

## Architecture

```
HookInterceptor (Main Entry)
├── ConfigManager (JSON Schema Validation)
│   └── AI Provider Configuration (Anthropic/OpenAI)
├── HookRegistry (Registration & Ordering)
├── HookExecutor (Execution Engine)
│   └── ProviderManager (AI Provider Orchestration)
│       ├── AnthropicProvider (@anthropic-ai/sdk)
│       └── OpenAIProvider (OpenAI SDK - coming soon)
└── Logger (Logging & Rotation)
```

### AI Provider Architecture

```
ProviderManager
├── AnthropicProvider
│   ├── Client initialization (API key, base URL, timeout)
│   ├── Message building (system prompt, user prompt, context)
│   ├── API call (messages.create)
│   └── Response parsing (extract decision and reason)
└── OpenAIProvider (planned)
```

### Data Flow for Prompt Hooks

```
User Input
    ↓
Claude Code (UserPromptSubmit event)
    ↓
settings.json → hookmanager intercept --event UserPromptSubmit
    ↓
stdin JSON {"prompt": "...", "session_id": "..."}
    ↓
HookInterceptor → Parse stdin, extract prompt
    ↓
HookExecutor → ProviderManager.executeHookPrompt()
    ↓
AnthropicProvider → messages.create(prompt + context)
    ↓
AI Response → {"ok": true/false, "reason": "..."}
    ↓
Map to event format → permissionDecision / decision
    ↓
Return to Claude Code → Continue or Block operation
```

## Hook Types

### Command Handler
Execute shell commands:
```json
{
  "type": "command",
  "command": "npm audit",
  "timeout": 30000
}
```

### Script Handler
Execute script files:
```json
{
  "type": "script",
  "path": "./scripts/backup.sh",
  "timeout": 60000
}
```

### Module Handler
Execute Node.js modules:
```json
{
  "type": "module",
  "module": "./custom-handler.js",
  "function": "myHandler"
}
```

### Programmatic Handler
Execute JavaScript functions:
```json
{
  "type": "programmatic",
  "handler": "(context) => { return { success: true, exitCode: 0 }; }"
}
```

### Prompt Handler (AI-Powered Hooks)

Use Claude AI to make intelligent decisions based on event context. The Prompt Handler uses the Anthropic TypeScript SDK to directly call AI APIs for fast, reliable decision-making.

#### How It Works

1. **Input**: Event context is passed to the AI model via stdin (for UserPromptSubmit) or command arguments
2. **Processing**: AI evaluates the context and returns a JSON decision
3. **Output**: Decision is mapped to the correct format for the event type
4. **Action**: Based on the decision, the operation continues or is blocked

#### Configuration

**Step 1: Configure AI Provider (Required)**

Add AI configuration to your **global** config file (`~/.claude/hooks/hookmanager/config.json`):

```json
{
  "ai": {
    "provider": "anthropic",
    "anthropic": {
      "apiKey": "your-api-key-here",
      "baseURL": "https://api.anthropic.com",  // Optional: custom endpoint
      "model": "claude-3-5-haiku-20241022"     // Optional: default model
    }
  }
}
```

**Supported Providers:**
- `anthropic` - Anthropic Claude API (default)
- `openai` - OpenAI-compatible API (placeholder, coming soon)

**Step 2: Add a Prompt Hook**

```bash
hookmanager add profanity-filter UserPromptSubmit \
  "检查以下用户输入是否包含不适当的语言、脏话或冒犯性内容。如果有，请拒绝。返回JSON格式：{\"ok\": true/false, \"reason\": \"原因\"}" \
  --type prompt \
  --description "检测用户输入中的脏话并拦截" \
  --priority 100
```

**Step 3: Set Model (Optional)**

By default, the AI provider uses the model specified in global config. To override per-hook:

1. Add the hook
2. Edit the config file to add the `model` field:

```json
{
  "id": "profanity-filter",
  "handler": {
    "type": "prompt",
    "prompt": "...",
    "model": "glm-4.5-air",  // Override model here
    "timeout": 30000
  }
}
```

#### Hook Schema

```json
{
  "type": "prompt",
  "prompt": "Your prompt template here",
  "model": "optional-model-name",
  "systemPrompt": "Optional system prompt override",
  "timeout": 30000
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `type` | string | Yes | - | Must be `"prompt"` |
| `prompt` | string | Yes | - | The prompt template to send to AI |
| `model` | string | No | From global config | Override the AI model to use |
| `systemPrompt` | string | No | Built-in decision prompt | Override the system prompt |
| `timeout` | number | No | 30000 | Maximum time to wait for AI response (ms) |

#### Supported Decision Events

Prompt handlers only work with events that require a binary decision:

| Event | Description | Output Format |
|-------|-------------|---------------|
| `PreToolUse` | Before tool execution | `permissionDecision: allow/deny` |
| `PostToolUse` | After tool execution | `decision: continue/block` |
| `PostToolUseFailure` | After tool failure | `decision: continue/block` |
| `PermissionRequest` | Permission requested | `permissionDecision: allow/deny` |
| `UserPromptSubmit` | User submitted prompt | `decision: continue/block` |
| `SubagentStop` | Subagent completed | `decision: continue/block` |

#### Expected AI Response Format

The AI should return JSON in this format:

```json
{
  "ok": true,
  "reason": "Optional explanation for the decision"
}
```

- `ok`: `true` to allow/continue, `false` to deny/block
- `reason`: Optional explanation (included in logs)

#### Output Mapping by Event

| Event | AI Decision | Output Format | Values |
|-------|-------------|---------------|--------|
| `PreToolUse` / `PermissionRequest` | `ok: true` | `permissionDecision` | `"allow"` |
| `PreToolUse` / `PermissionRequest` | `ok: false` | `permissionDecision` | `"deny"` |
| Other Decision Events | `ok: true` | `decision` | `"continue"` |
| Other Decision Events | `ok: false` | `decision` | `"block"` |

#### stdin Input for UserPromptSubmit

For `UserPromptSubmit` events, Claude Code sends event data via stdin as JSON:

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "permission_mode": "string",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "The actual user input text"
}
```

The `intercept` command automatically extracts the `prompt` field and passes it to the AI.

#### Examples

**Example 1: Profanity Filter (Global)**

```bash
# Add as global hook
hookmanager add profanity-filter UserPromptSubmit \
  "检查以下用户输入是否包含不适当的语言、脏话或冒犯性内容。如果有，请拒绝。返回JSON格式：{\"ok\": true/false, \"reason\": \"原因\"}" \
  --type prompt \
  --description "检测用户输入中的脏话并拦截" \
  --priority 100 \
  --global

# Set custom model (edit config file)
# model: "glm-4.5-air"
```

**Example 2: Security Evaluation for File Operations**

```bash
hookmanager add file-security PreToolUse \
  "Evaluate if this file operation is safe. Consider: path traversal, sensitive file access, destructive operations. Context: $ARGUMENTS" \
  --type prompt \
  --filter-tools "Write,Edit" \
  --description "AI evaluates file operations for security risks" \
  --priority 100
```

**Example 3: Permission Request Advisor**

```bash
hookmanager add permission-advisor PermissionRequest \
  "Should this permission be granted? Consider the context and potential risks. Context: $ARGUMENTS" \
  --type prompt \
  --description "AI advises on permission requests" \
  --priority 50
```

**Example 4: Subagent Result Monitor**

```bash
hookmanager add subagent-monitor SubagentStop \
  "Did this subagent complete its task successfully? Analyze the result. Context: $ARGUMENTS" \
  --type prompt \
  --description "AI monitors subagent completion" \
  --priority 50
```

#### Testing Prompt Hooks

**Test via stdin (UserPromptSubmit style):**

```bash
echo '{"prompt":"曹尼玛傻逼","session_id":"test123"}' | \
  npx hookmanager intercept --event UserPromptSubmit --json
```

**Test via command line argument:**

```bash
PROMPT="test input" npx hookmanager intercept --event UserPromptSubmit --json
```

#### Troubleshooting

**AI not responding:**
- Check API key in global config: `~/.claude/hooks/hookmanager/config.json`
- Verify network connectivity to API endpoint
- Check logs: `hookmanager logs --tail 50`

**Always allowing (not blocking):**
- Verify AI response format includes `{"ok": true/false}`
- Check that the event supports prompt handlers
- Review debug log at `C:\Users\<user>\Desktop\prompt-debug.log`

**Model not found:**
- Ensure model name is correct for your provider
- For Anthropic: use full model name like `claude-3-5-haiku-20241022`
- For custom endpoints: verify the model is available

## Lifecycle Events

- SessionStart, SessionEnd, SessionResume
- UserPromptSubmit, UserPromptEdit
- PreToolUse, PostToolUse, PostToolUseFailure
- SubagentStart, SubagentStop, SubagentSpawn
- ResponseStart, ResponseEnd, ResponseChunk
- ContextCompact, ContextExpand, ContextTruncate
- PermissionRequest, PermissionGranted, PermissionDenied
- Notification, Alert, Warning
- Error, Exception
- Custom

## CLI Commands

| Command | Description |
|---------|-------------|
| `init` | Initialize HookManager |
| `add` | Add a new hook |
| `remove` | Remove a hook |
| `list` | List hooks |
| `enable` | Enable a hook (use `--global` for global hooks) |
| `disable` | Disable a hook (use `--global` for global hooks) |
| `order` | Change hook order (use `--global` for global hooks) |
| `logs` | View and manage logs |
| `config` | Manage configuration |
| `install` | Install universal hook |
| `uninstall` | Remove HookManager universal hooks |
| `validate` | Validate configuration |
| `stats` | Show execution statistics |
| `help` | Show detailed help |

## Configuration

HookManager supports both global and project-level hook configurations, plus AI provider configuration for prompt handlers.

### Global Configuration
Location: `~/.claude/hooks/hookmanager/config.json`
- **Scope**: Works across all projects
- **Access**: Use `--global` flag to access or modify
- **Purpose**: Shared hooks for common workflows (security, backups, etc.)

### Project Configuration
Location: `.claude/hooks/hookmanager/config.json`
- **Scope**: Works only in the current project
- **Access**: Default when no `--global` flag is used
- **Purpose**: Project-specific hooks (linting, testing, deployment)

### Hook Resolution Logic
When both global and project hooks exist:
1. Both sets of hooks are loaded
2. They are merged together (project hooks take precedence for conflicts)
3. Project hooks can exclude specific global hooks using `excludeGlobalHooks` array
4. All hooks are registered and executed at runtime

**Use `--global` flag** to specify which scope you want to operate on for all commands.

### Example Configuration
```json
{
  "version": "1.0.0",
  "hooks": [
    {
      "id": "hook-123",
      "name": "security-audit",
      "description": "Run npm audit",
      "enabled": true,
      "events": ["PreToolUse"],
      "handler": {
        "type": "command",
        "command": "npm audit"
      },
      "filter": {
        "tools": ["bash"],
        "commands": ["npm install"]
      },
      "priority": 100
    }
  ],
  "logLevel": "info",
  "logPath": "~/.claude/logs/hookmanager.log",
  "execution": {
    "defaultTimeout": 30000,
    "defaultRetry": 0,
    "parallel": false
  },
  "security": {
    "validateCommands": true,
    "blockedCommands": ["rm -rf", "sudo"]
  }
}
```

### AI Provider Configuration

For prompt handlers to work, you must configure AI provider credentials in the **global** config file:

```json
{
  "version": "1.0.0",
  "ai": {
    "provider": "anthropic",
    "anthropic": {
      "apiKey": "sk-ant-your-api-key-here",
      "baseURL": "https://api.anthropic.com",
      "model": "claude-3-5-haiku-20241022"
    }
  },
  "hooks": [...]
}
```

**AI Configuration Schema:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `provider` | string | Yes | - | Provider type: `anthropic` or `openai` |
| `anthropic.apiKey` | string | Yes* | - | Anthropic API key (required if using Anthropic) |
| `anthropic.baseURL` | string | No | Official endpoint | Custom API endpoint URL |
| `anthropic.model` | string | No | Haiku | Default model for Anthropic |
| `openai.apiKey` | string | Yes* | - | OpenAI API key (required if using OpenAI) |
| `openai.baseURL` | string | No | Official endpoint | Custom API endpoint URL |
| `openai.model` | string | No | gpt-4o-mini | Default model for OpenAI |

**Example with Custom Endpoint (e.g., Zhipu AI/GLM):**

```json
{
  "ai": {
    "provider": "anthropic",
    "anthropic": {
      "apiKey": "your-api-key",
      "baseURL": "https://open.bigmodel.cn/api/anthropic",
      "model": "glm-4.7"
    }
  }
}
```

### Prompt Hook Configuration Example

```json
{
  "version": "1.0.0",
  "hooks": [
    {
      "id": "profanity-filter",
      "name": "profanity-filter",
      "description": "检测用户输入中的脏话并拦截",
      "enabled": true,
      "events": ["UserPromptSubmit"],
      "handler": {
        "type": "prompt",
        "prompt": "检查以下用户输入是否包含不适当的语言、脏话或冒犯性内容。如果有，请拒绝。返回JSON格式：{\"ok\": true/false, \"reason\": \"原因\"}",
        "model": "glm-4.5-air",
        "timeout": 30000
      },
      "priority": 100,
      "exitCodeBlocking": [2],
      "metadata": {
        "_scope": "global"
      }
    }
  ],
  "ai": {
    "provider": "anthropic",
    "anthropic": {
      "apiKey": "sk-ant-xxx",
      "baseURL": "https://open.bigmodel.cn/api/anthropic",
      "model": "glm-4.7"
    }
  }
}
```

## Examples

### Security Hooks
```bash
# npm audit before package installation
hookmanager add security-audit PreToolUse "npm audit" \
  --filter-commands "npm install,npm ci" \
  --priority 100

# AI-powered security evaluation for file operations
hookmanager add ai-security PreToolUse \
  "Should I allow this file operation? Context: $ARGUMENTS" \
  --type prompt \
  --filter-tools "Write,Edit" \
  --priority 100

# Block dangerous commands
hookmanager add block-dangerous PreToolUse "node ./scripts/block.js" \
  --filter-tools "bash,run" \
  --priority 1
```

### Development Hooks
```bash
# Lint before commits
hookmanager add lint PreToolUse "npm run lint" \
  --filter-commands "git commit" \
  --priority 50

# Test before commits
hookmanager add test PreToolUse "npm test" \
  --filter-commands "git commit" \
  --priority 60

# AI evaluates if user prompts are safe/appropriate
hookmanager add ai-user-filter UserPromptSubmit \
  "Is this user request appropriate and safe? Context: $ARGUMENTS" \
  --type prompt \
  --model haiku
```

### AI Decision Hooks

```bash
# Content moderation (profanity filter)
hookmanager add profanity-filter UserPromptSubmit \
  "检查以下用户输入是否包含不适当的语言、脏话或冒犯性内容。如果有，请拒绝。返回JSON格式：{\"ok\": true/false, \"reason\": \"原因\"}" \
  --type prompt \
  --description "检测用户输入中的脏话并拦截" \
  --global

# Security evaluation for file operations
hookmanager add file-security PreToolUse \
  "Evaluate if this file operation is safe. Consider: path traversal, sensitive files, destructive operations. Context: $ARGUMENTS" \
  --type prompt \
  --filter-tools "Write,Edit,Read" \
  --description "AI evaluates file operations for security risks"

# Permission request advisor
hookmanager add permission-advisor PermissionRequest \
  "Should this permission be granted? Consider the context and potential risks. Context: $ARGUMENTS" \
  --type prompt \
  --description "AI advises on permission requests"

# Subagent completion monitor
hookmanager add subagent-monitor SubagentStop \
  "Did this subagent complete its task successfully? Analyze the result. Context: $ARGUMENTS" \
  --type prompt \
  --description "AI monitors subagent completion"

# Post-tool evaluation
hookmanager add post-tool-eval PostToolUse \
  "Was this tool operation successful? Should we continue? Context: $ARGUMENTS" \
  --type prompt \
  --filter-tools "Bash,Run" \
  --description "AI evaluates tool execution results"

# Code review before execution
hookmanager add code-review PreToolUse \
  "Review this code change for potential issues. Check for: bugs, security issues, bad practices. Context: $ARGUMENTS" \
  --type prompt \
  --filter-tools "Edit,Write" \
  --filter-patterns ".ts,.js,.py" \
  --description "AI reviews code changes before execution"
```

## Testing

```bash
# Run basic tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

## Uninstall Command

Remove HookManager universal hooks from your system:

```bash
# Remove universal hooks from project settings (default)
hookmanager uninstall

# Remove universal hooks from global settings
hookmanager uninstall --global

# Remove everything including hooks configuration folder
hookmanager uninstall --purge
```

## Installation Guide

### Quick Install

```bash
npm install -g @smilecat2026/hook-manager
```

### Verify Installation

```bash
hookmanager --version
hookmanager --help
```

### Common Issues

#### Command Not Found
```bash
# Check npm bin directory
npm bin -g

# Add to PATH (macOS/Linux)
export PATH="$PATH:$(npm bin -g)"

# Add to PATH (Windows PowerShell)
$env:Path += ";$(npm bin -g)"
```

#### Permission Errors
```bash
# Use sudo (if needed)
sudo npm install -g @smilecat2026/hook-manager --unsafe-perm

# Or use npx
npx @smilecat2026/hook-manager init
```

#### Node.js Version
```bash
# Check version
node --version

# Update (macOS/Linux)
nvm install 20
nvm use 20

# Update (Windows)
# Download from https://nodejs.org/
```


## Configuration Examples

### Minimal Configuration
```json
{
  "version": "1.0.0",
  "hooks": [
    {
      "id": "security-audit",
      "name": "security-audit",
      "enabled": true,
      "events": ["PreToolUse"],
      "handler": {
        "type": "command",
        "command": "npm audit"
      },
      "priority": 100
    }
  ],
  "logLevel": "info"
}
```

### Full Configuration
```json
{
  "version": "1.0.0",
  "hooks": [
    {
      "id": "security-audit",
      "name": "security-audit",
      "description": "Run npm audit",
      "enabled": true,
      "events": ["PreToolUse"],
      "handler": {
        "type": "command",
        "command": "npm audit",
        "timeout": 30000,
        "retry": 0
      },
      "filter": {
        "tools": ["bash"],
        "commands": ["npm install", "npm ci"]
      },
      "priority": 100,
      "continueOnError": false,
      "exitCodeBlocking": [2],
      "metadata": {
        "category": "security",
        "severity": "high"
      }
    }
  ],
  "logLevel": "info",
  "logPath": "~/.claude/logs/hookmanager.log",
  "logRotation": {
    "enabled": true,
    "maxSize": 10485760,
    "maxFiles": 10,
    "retentionDays": 30
  },
  "execution": {
    "defaultTimeout": 30000,
    "defaultRetry": 0,
    "parallel": false,
    "maxParallel": 5
  },
  "security": {
    "validateCommands": true,
    "blockedCommands": ["rm -rf", "del /f", "sudo"],
    "sandboxMode": false
  },
  "metadata": {
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

## Security Features

- Command validation before execution
- Path traversal protection
- Dangerous command blocking (rm -rf, sudo, etc.)
- Exit code blocking (exit code 2 blocks by default)
- Audit logging

## Performance

- Hook interception: <1ms
- Configuration loading: <10ms (cached)
- Hook execution: Variable (depends on handler)
- Total overhead: <50ms for typical use

## Data Flow

```
Claude Code Event
    ↓
HookInterceptor.handleEvent()
    ↓
ConfigManager.load() → Load global + project configs
    ↓
HookRegistry.merge() → Combine hooks with exclusion support
    ↓
HookRegistry.getHooksForEvent() → Filter and sort hooks
    ↓
HookExecutor.executeHooks() → Execute all registered hooks
    ↓
Logger.log() → Record execution
    ↓
Return results to Claude Code
```

**Note**: Both global and project hooks are loaded, merged (with exclusion support), and all hooks are registered and executed at runtime.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

- Documentation: https://github.com/your-org/hook-manager
- Issues: https://github.com/your-org/hook-manager/issues
- Claude Code Hooks: https://code.claude.com/docs/en/hooks

