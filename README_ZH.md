# HookManager

> Claude Code 的通用钩子管理器 - 通过 CLI 管理所有生命周期钩子

HookManager 提供统一的接口，通过单一"通用钩子"管理 Claude Code 钩子，该钩子拦截所有生命周期事件并委托给存储在 JSON 文件中的用户配置钩子。

## 快速开始 / Quick Start

### 1. 安装 / Install

```bash
npm install -g @smilecat2026/hook-manager
```

### 2. 初始化 / Initialize

```bash
# 初始化项目配置（默认）
hookmanager init

# 初始化全局配置
hookmanager init --global
```

### 3. 添加钩子 / Add a Hook

```bash
# 添加到项目配置（默认）
hookmanager add security-audit PreToolUse "npm audit" \
  --description "在包安装前运行 npm audit" \
  --filter-tools "Bash" \
  --priority 100

# 添加到全局配置
hookmanager add security-audit PreToolUse "npm audit" \
  --description "在包安装前运行 npm audit" \
  --filter-tools "Bash" \
  --priority 100 \
  --global
```

### 4. 列出钩子 / List Hooks

```bash
# 列出项目钩子（默认）
hookmanager list

# 列出全局钩子
hookmanager list --global

# 列出特定生命周期的钩子
hookmanager list PreToolUse
```

### 5. 查看日志 / View Logs

```bash
hookmanager logs --tail 20
```

### 6. 卸载 / Uninstall

```bash
# 从项目设置移除通用钩子（默认）
hookmanager uninstall

# 从全局设置移除通用钩子
hookmanager uninstall --global

# 移除所有内容，包括钩子配置文件夹
hookmanager uninstall --purge
```

## 核心功能 / Core Features

- **通用钩子**: 单一钩子拦截所有 Claude Code 生命周期事件
- **JSON 配置**: 在 JSON 文件中存储钩子（全局和项目级别）
- **钩子组合**: 每个生命周期多个钩子，按优先级排序
- **全面日志记录**: 内置日志管理，支持轮转和导出
- **安全性**: 命令验证、路径遍历保护、沙盒模式
- **性能**: 支持并行执行、超时处理、重试逻辑
- **匹配器**: 支持通配符和正则表达式匹配工具名称

## CLI 命令 / CLI Commands

| 命令 / Command | 描述 / Description        |
| -------------- | ------------------------- |
| `init`         | 初始化 HookManager        |
| `add`          | 添加新钩子                |
| `remove`       | 移除钩子                  |
| `list`         | 列出钩子                  |
| `enable`       | 启用钩子                  |
| `disable`      | 禁用钩子                  |
| `order`        | 更改钩子顺序              |
| `logs`         | 查看和管理日志            |
| `config`       | 管理配置                  |
| `install`      | 安装通用钩子              |
| `uninstall`    | 移除 HookManager 通用钩子 |
| `validate`     | 验证配置                  |
| `stats`        | 显示执行统计              |
| `intercept`    | 内部事件拦截器            |
| `help`         | 显示详细帮助              |

## 配置 / Configuration

### 全局配置 / Global Configuration

位置：`~/.claude/hooks/hookmanager/config.json`

- 使用 `--global` 标志访问全局配置

### 项目配置 / Project Configuration

位置：`.claude/hooks/hookmanager/config.json`

- 默认操作针对项目配置

## 钩子类型 / Hook Types

### 命令处理器 / Command Handler

执行 shell 命令：

```json
{
  "type": "command",
  "command": "npm audit",
  "timeout": 30000
}
```

### 脚本处理器 / Script Handler

执行脚本文件：

```json
{
  "type": "script",
  "path": "./scripts/backup.sh",
  "timeout": 60000
}
```

### 模块处理器 / Module Handler

执行 Node.js 模块：

```json
{
  "type": "module",
  "module": "./custom-handler.js",
  "function": "myHandler"
}
```

### 编程式处理器 / Programmatic Handler

执行 JavaScript 函数：

```json
{
  "type": "programmatic",
  "handler": "(context) => { return { success: true, exitCode: 0 }; }"
}
```

### AI 提示处理器 / Prompt Handler (AI-Powered Hooks)

使用 Claude AI 进行智能决策：

```json
{
  "type": "prompt",
  "prompt": "评估此操作是否安全：$ARGUMENTS",
  "model": "claude-3-5-haiku-20241022",
  "timeout": 30000
}
```

#### 工作原理 / How It Works

1. **输入**: 事件上下文通过 stdin（UserPromptSubmit）或命令参数传递给 AI 模型
2. **处理**: AI 评估上下文并返回 JSON 格式的决策
3. **输出**: 决策被映射为事件类型的正确格式
4. **操作**: 根据决策，操作继续或被阻止

#### 配置步骤 / Configuration Steps

**步骤 1: 配置 AI 提供商（必需）**

在**全局**配置文件中添加 AI 配置（`~/.claude/hooks/hookmanager/config.json`）：

```json
{
  "ai": {
    "provider": "anthropic",
    "anthropic": {
      "apiKey": "your-api-key-here",
      "baseURL": "https://api.anthropic.com",  // 可选：自定义端点
      "model": "claude-3-5-haiku-20241022"     // 可选：默认模型
    }
  }
}
```

**支持的提供商:**
- `anthropic` - Anthropic Claude API（默认）
- `openai` - OpenAI 兼容 API（即将推出）

**步骤 2: 添加 Prompt 钩子**

```bash
hookmanager add profanity-filter UserPromptSubmit \
  "检查以下用户输入是否包含不适当的语言、脏话或冒犯性内容。如果有，请拒绝。返回JSON格式：{\"ok\": true/false, \"reason\": \"原因\"}" \
  --type prompt \
  --description "检测用户输入中的脏话并拦截" \
  --priority 100
```

**步骤 3: 设置模型（可选）**

默认使用全局配置中的模型。要为每个钩子覆盖模型：

1. 添加钩子
2. 编辑配置文件添加 `model` 字段：

```json
{
  "id": "profanity-filter",
  "handler": {
    "type": "prompt",
    "prompt": "...",
    "model": "glm-4.5-air",  // 在此覆盖模型
    "timeout": 30000
  }
}
```

#### 钩子模式 / Hook Schema

| 字段 / Field | 类型 / Type | 必需 / Required | 默认值 / Default | 描述 / Description |
|--------------|--------------|------------------|-----------------|------------------|
| `type` | string | 是 | - | 必须是 `"prompt"` |
| `prompt` | string | 是 | - | 发送给 AI 的提示模板 |
| `model` | string | 否 | 全局配置 | 要使用的 AI 模型 |
| `systemPrompt` | string | 否 | 内置决策提示 | 覆盖系统提示 |
| `timeout` | number | 否 | 30000 | 等待 AI 响应的最大时间（毫秒） |

#### 支持的决策事件

Prompt 钩子仅适用于需要二元决策的事件：

| 事件 / Event | 描述 / Description | 输出格式 / Output Format |
|--------------|-------------------|---------------------------|
| `PreToolUse` | 工具执行前 | `permissionDecision: allow/deny` |
| `PostToolUse` | 工具执行后 | `decision: continue/block` |
| `PostToolUseFailure` | 工具失败后 | `decision: continue/block` |
| `PermissionRequest` | 权限请求 | `permissionDecision: allow/deny` |
| `UserPromptSubmit` | 用户提交提示 | `decision: continue/block` |
| `SubagentStop` | 子代理完成 | `decision: continue/block` |

#### AI 响应格式

AI 应返回以下格式的 JSON：

```json
{
  "ok": true,
  "reason": "决策的可选解释"
}
```

- `ok`: `true` 表示允许/继续，`false` 表示拒绝/阻止
- `reason`: 可选的解释（包含在日志中）

#### 按事件映射输出

| 事件 / Event | AI 决策 / AI Decision | 输出格式 / Output Format | 值 / Values |
|--------------|---------------------|---------------------------|------------|
| `PreToolUse` / `PermissionRequest` | `ok: true` | `permissionDecision` | `"allow"` |
| `PreToolUse` / `PermissionRequest` | `ok: false` | `permissionDecision` | `"deny"` |
| 其他决策事件 / Other Decision Events | `ok: true` | `decision` | `"continue"` |
| 其他决策事件 / Other Decision Events | `ok: false` | `decision` | `"block"` |

#### UserPromptSubmit 的 stdin 输入

对于 `UserPromptSubmit` 事件，Claude Code 通过 stdin 发送事件数据为 JSON：

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "permission_mode": "string",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "实际的用户输入文本"
}
```

`intercept` 命令自动提取 `prompt` 字段并传递给 AI。

#### 示例 / Examples

**示例 1: 脏话过滤器（全局钩子）**

```bash
# 添加为全局钩子
hookmanager add profanity-filter UserPromptSubmit \
  "检查以下用户输入是否包含不适当的语言、脏话或冒犯性内容。如果有，请拒绝。返回JSON格式：{\"ok\": true/false, \"reason\": \"原因\"}" \
  --type prompt \
  --description "检测用户输入中的脏话并拦截" \
  --priority 100 \
  --global

# 设置自定义模型（编辑配置文件）
# model: "glm-4.5-air"
```

**示例 2: 文件操作的安全评估**

```bash
hookmanager add file-security PreToolUse \
  "评估此文件操作是否安全。考虑：路径遍历、敏感文件访问、破坏性操作。Context: $ARGUMENTS" \
  --type prompt \
  --filter-tools "Write,Edit" \
  --description "AI 评估文件操作的安全风险" \
  --priority 100
```

**示例 3: 权限请求顾问**

```bash
hookmanager add permission-advisor PermissionRequest \
  "应该授予此权限吗？考虑上下文和潜在风险。Context: $ARGUMENTS" \
  --type prompt \
  --description "AI 建议权限请求" \
  --priority 50
```

**示例 4: 子代理结果监控**

```bash
hookmanager add subagent-monitor SubagentStop \
  "此子代理是否成功完成了任务？分析结果。Context: $ARGUMENTS" \
  --type prompt \
  --description "AI 监控子代理完成情况" \
  --priority 50
```

#### 测试 Prompt 钩子

**通过 stdin 测试（UserPromptSubmit 风格）：**

```bash
echo '{"prompt":"曹尼玛傻逼","session_id":"test123"}' | \
  npx hookmanager intercept --event UserPromptSubmit --json
```

**通过命令行参数测试：**

```bash
PROMPT="测试输入" npx hookmanager intercept --event UserPromptSubmit --json
```

#### 故障排除 / Troubleshooting

**AI 无响应：**
- 检查全局配置中的 API key: `~/.claude/hooks/hookmanager/config.json`
- 验证到 API 端点的网络连接
- 查看日志: `hookmanager logs --tail 50`

**总是允许（不阻止）：**
- 验证 AI 响应格式包含 `{"ok": true/false}`
- 检查事件是否支持 prompt 处理器
- 查看调试日志: `C:\Users\<user>\Desktop\prompt-debug.log`

**找不到模型：**
- 确保提供商的模型名称正确
- Anthropic: 使用完整模型名称，如 `claude-3-5-haiku-20241022`
- 自定义端点: 验证模型是否可用

## 生命周期事件 / Lifecycle Events

- SessionStart, SessionEnd, SessionResume
- UserPromptSubmit, UserPromptEdit
- PreToolUse, PostToolUse, PostToolUseFailure
- ToolPermissionRequest
- SubagentStart, SubagentStop, SubagentSpawn
- ResponseStart, ResponseEnd, ResponseChunk
- ContextCompact, ContextExpand, ContextTruncate
- PermissionRequest, PermissionGranted, PermissionDenied
- Notification, Alert, Warning
- Error, Exception
- Custom

## 匹配器 / Matchers

HookManager 支持灵活的匹配器来过滤钩子执行：

- **精确匹配**: `Write` - 只匹配 Write 工具
- **通配符**: `*` - 匹配所有工具
- **正则表达式**: `Notebook.*` - 匹配所有以 Notebook 开头的工具
- **多个匹配**: `Write|Edit` - 匹配 Write 或 Edit 工具

## 示例 / Examples

### 安全钩子 / Security Hooks

```bash
# 包安装前运行 npm audit
hookmanager add security-audit PreToolUse "npm audit" \
  --filter-tools "Bash" \
  --priority 100

# 阻止危险命令
hookmanager add block-dangerous PreToolUse "node ./scripts/block.js" \
  --filter-tools "Bash" \
  --priority 1
```

### 开发钩子 / Development Hooks

```bash
# 写文件前进行代码检查
hookmanager add lint PreToolUse "npm run lint" \
  --filter-tools "Write" \
  --priority 50

# 会话开始时运行测试
hookmanager add test SessionStart "npm test" \
  --priority 60
```

### 使用匹配器 / Using Matchers

```bash
# 监控所有文件操作
hookmanager add file-monitor PreToolUse "node ./scripts/monitor.js" \
  --matcher "Write|Edit|Read"

# 监控所有 Notebook 相关工具
hookmanager add notebook-monitor PreToolUse "node ./scripts/nb-monitor.js" \
  --matcher "Notebook.*"
```

## 卸载命令 / Uninstall Command

从系统中移除 HookManager 通用钩子：

```bash
# 从项目设置移除通用钩子（默认）
hookmanager uninstall

# 从全局设置移除通用钩子
hookmanager uninstall --global

# 移除所有内容，包括钩子配置文件夹
hookmanager uninstall --purge
```

## 测试 / Testing

```bash
# 运行基本测试
npm test

# 在监视模式下运行测试
npm run test:watch
```

## 开发 / Development

```bash
# 安装依赖
npm install

# 构建 TypeScript
npm run build

# 运行代码检查
npm run lint

# 修复代码检查问题
npm run lint:fix

# 格式化代码
npm run format
```

## 许可证 / License

MIT 许可证 - 详情请参见 [LICENSE](LICENSE)

## 支持 / Support

- 文档：https://github.com/your-org/hook-manager
- 问题：https://github.com/your-org/hook-manager/issues
- Claude Code 钩子：https://code.claude.com/docs/en/hooks