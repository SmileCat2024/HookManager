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

## 4. AI 驱动的智能钩子 (Prompt Handler Examples)

### 4.1 内容安全过滤

**场景**: 拦截用户输入中的不当内容，使用 AI 进行语义判断。

```json
{
  "id": "content-safety-filter",
  "name": "AI Content Safety Filter",
  "enabled": true,
  "events": ["UserPromptSubmit"],
  "handler": {
    "type": "prompt",
    "prompt": "检查以下用户输入是否包含暴力、仇恨、色情或其他不当内容。请仅根据内容本身判断，不要过度审查。\n\n用户输入：\n$input\n\n返回 JSON 格式：{\"ok\": true/false, \"reason\": \"简短原因\"}",
    "model": "claude-3-5-haiku-20241022",
    "timeout": 10000
  },
  "priority": 100
}
```

### 4.2 文件操作风险评估

**场景**: 在写入或编辑文件前，让 AI 评估操作的风险等级。

```json
{
  "id": "file-operation-risk",
  "name": "File Operation Risk Assessment",
  "enabled": true,
  "events": ["PreToolUse"],
  "matcher": "Write|Edit",
  "handler": {
    "type": "prompt",
    "prompt": "评估以下文件操作的风险：\n\n工具: $tool\n文件路径: $input.filePath\n内容预览: $input.content\n\n风险考虑：敏感配置、生产代码、重要数据。\n返回 JSON: {\"ok\": true/false, \"reason\": \"风险评估\"}",
    "systemPrompt": "你是一个代码安全专家。谨慎评估，但不要过度保守。",
    "model": "claude-3-5-haiku-20241022"
  },
  "priority": 50
}
```

### 4.3 智能权限建议

**场景**: 当 Claude 请求权限时，让 AI 分析请求的合理性并提供建议。

```json
{
  "id": "permission-advisor",
  "name": "AI Permission Advisor",
  "enabled": true,
  "events": ["PermissionRequest"],
  "handler": {
    "type": "prompt",
    "prompt": "分析此权限请求的合理性：\n\n$ARGUMENTS\n\n考虑：操作必要性、潜在风险、用户意图。返回 JSON: {\"ok\": true/false, \"reason\": \"建议理由\"}",
    "timeout": 15000
  },
  "priority": 10
}
```

### 4.4 子代理完成质量检查

**场景**: 子代理完成任务后，让 AI 评估结果质量。

```json
{
  "id": "subagent-quality-check",
  "name": "Subagent Quality Checker",
  "enabled": true,
  "events": ["SubagentStop"],
  "handler": {
    "type": "prompt",
    "prompt": "评估子代理的完成质量：\n\n代理类型: $agentType\n任务: $task\n结果: $output\n\n返回 JSON: {\"ok\": true/false, \"reason\": \"质量评估\"}",
    "model": "claude-3-5-sonnet-20241022"
  },
  "priority": 1
}
```

### 4.5 命令执行安全审查

**场景**: 执行 Bash 命令前，让 AI 检查是否存在危险操作。

```json
{
  "id": "bash-safety-check",
  "name": "Bash Safety Checker",
  "enabled": true,
  "events": ["PreToolUse"],
  "matcher": "Bash",
  "handler": {
    "type": "prompt",
    "prompt": "检查此 Shell 命令是否安全：\n\n命令: $command\n工作目录: $cwd\n\n危险信号：rm -rf、格式化磁盘、删除用户、修改系统配置。\n返回 JSON: {\"ok\": true/false, \"reason\": \"安全判断\"}",
    "timeout": 5000
  },
  "priority": 999
}
```

### 4.6 敏感信息检测

**场景**: 防止 API Key、密码等敏感信息被写入文件。

```json
{
  "id": "sensitive-data-detector",
  "name": "Sensitive Data Detector",
  "enabled": true,
  "events": ["PreToolUse"],
  "matcher": "Write|Edit",
  "handler": {
    "type": "prompt",
    "prompt": "检测内容中是否包含敏感信息：\n\n$content\n\n检测目标：API Key、密码、私钥、token、凭证。\n返回 JSON: {\"ok\": true/false, \"reason\": \"检测结果\"}",
    "systemPrompt": "你是一个安全专家。仅检测明确的敏感信息模式，避免误报。",
    "timeout": 8000
  },
  "priority": 200
}
```

## 5. 调试所有事件 (Debug All)

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
