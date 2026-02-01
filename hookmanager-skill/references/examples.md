# 配置示例 (Configuration Examples)

以下是 HookManager 的常见配置场景示例。

## 1. 安全审计 (Security Audit)

**场景**: 当使用 Bash 工具执行 `npm install` 时，运行审计脚本。
**技术**: 结合 `matcher` (锁定 Bash) 和 `filter` (锁定特定命令)。

```json
{
  "id": "security-audit-npm",
  "name": "NPM Install Audit",
  "enabled": true,
  "events": ["PreToolUse"],
  "matcher": "Bash",
  "filter": {
    "commands": ["npm install", "npm ci", "yarn install"]
  },
  "handler": {
    "type": "command",
    "command": "echo 'AUDIT: npm install detected!' && node scripts/audit.js"
  },
  "priority": 100
}
```

## 2. 全局会话日志 (Session Logger)

**场景**: 记录每次会话的开始和结束。
**技术**: 使用 `matcher: "*"` 确保在非工具事件 (SessionStart) 中也能触发。

```json
{
  "id": "session-logger",
  "name": "Session Logger",
  "enabled": true,
  "events": ["SessionStart", "SessionEnd"],
  "matcher": "*",
  "handler": {
    "type": "command",
    "command": "echo 'Session event: ' $HOOK_EVENT >> ~/.claude/session.log"
  }
}
```

## 3. 阻止特定工具模式 (Block Tool Patterns)

**场景**: 禁止在 Notebook 中使用 `rm -rf`。
**技术**: 使用正则 `matcher` 匹配所有 Notebook 工具。

```json
{
  "id": "block-notebook-rm",
  "name": "Block rm in Notebooks",
  "enabled": true,
  "events": ["PreToolUse"],
  "matcher": "Notebook.*", 
  "filter": {
    "patterns": ["rm\\s+-rf", "rm\\s+-r"]
  },
  "handler": {
    "type": "programmatic",
    "handler": "async (ctx) => { return { success: false, output: 'Deletion forbidden in Notebooks' }; }"
  },
  "priority": 999
}
```

## 4. 调试所有事件 (Debug All)

**场景**: 打印所有发生的事件名称，用于开发调试。

```json
{
  "id": "debug-all",
  "name": "Debug Logger",
  "enabled": false,
  "events": ["Custom"], 
  "matcher": "*",
  "handler": {
    "type": "command",
    "command": "echo \"[DEBUG] Event: $HOOK_EVENT Tool: $HOOK_TOOL\""
  }
}
```
*(注意：要监听所有事件，需要在 `events` 数组中列出它们，或者 HookManager 未来版本支持通配符事件)*
