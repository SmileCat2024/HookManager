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
├── HookRegistry (Registration & Ordering)
├── HookExecutor (Execution Engine)
└── Logger (Logging & Rotation)
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

HookManager supports both global and project-level hook configurations:

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

## Examples

### Security Hooks
```bash
# npm audit before package installation
hookmanager add security-audit PreToolUse "npm audit" \
  --filter-commands "npm install,npm ci" \
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

