---
name: hook-manager
description: 全生命周期钩子管理专家。使用此技能通过 CLI 工具 `hookmanager` 来初始化、配置、验证和调试 Claude Code 的钩子。当用户需要拦截工具调用（如限制 Bash 命令）、自定义会话启动行为或配置 MCP 工具权限时触发。
---

# Hook Manager 指南

本技能通过 `hookmanager` 工具为 Claude 提供精确的生命周期拦截与自动化能力。

## 1. 核心 CLI 操作 (Core CLI Commands)

必须通过以下指令管理钩子，严禁手动修改 `.claude/settings.json`：

- **初始化环境**:
  - `hookmanager init` (当前项目) 或 `hookmanager init --global` (全局配置)。
- **添加钩子**:
  - `hookmanager add <name> <event> <command>`
  - 添加 `--global` 参数可配置全局钩子。
  - 添加 `--type prompt` 可使用 AI 决策钩子。
- **查看与验证**:
  - `hookmanager list`: 列出所有活动的钩子（包括项目级和全局级）。
  - `hookmanager validate`: 检查 `config.json` 的语法与逻辑闭环。
  - `hookmanager logs`: 查看钩子的实时触发与退出状态。

## 2. 配置文件说明 (Configuration)

HookManager 使用分层配置结构：

- **全局配置**: `~/.claude/hooks/config.json`
  - 适用于所有项目的通用规则（如全局日志记录、安全基线）。
- **项目配置**: `.claude/hooks/hookmanager/config.json`
  - 仅适用于当前项目的特定规则（如项目特定的构建检查）。

**注意**: 用户定义的钩子配置包含 `matcher` 字段，但在底层实现中，`HookManager` 使用通配符拦截器 (`matcher: '*'`) 捕获所有事件，然后根据 `matcher` 字段进行分发。

## 3. Matcher 全量字典 (Exhaustive Matcher Reference)

`matcher` 字段是精准拦截的关键。它是正则表达式，其匹配目标取决于事件类型。

### A. 工具类事件 (PreToolUse, PostToolUse 等)
**匹配目标**: `tool_name`。以下为 Claude Code 官方支持的所有内置工具列表，请务必根据需求选择：

| 类别          | 准确的 Matcher 值 (工具名) | 功能说明                      |
| :------------ | :------------------------- | :---------------------------- |
| **系统指令**  | `Bash`                     | 执行 Shell 命令（常用）       |
| **文件读写**  | `Edit`                     | 搜索并替换文件内容            |
|               | `Write`                    | 创建或覆盖新文件              |
|               | `MultiEdit`                | 对单个文件进行多次原子修改    |
|               | `Read`                     | 读取文件内容                  |
| **文件检索**  | `Glob`                     | 文件名模式匹配查找            |
|               | `Grep`                     | 文件内容关键词搜索            |
|               | `LS`                       | 列出目录与子目录              |
| **数据科学**  | `NotebookEdit`             | 修改 Jupyter Notebook 单元格  |
|               | `NotebookRead`             | 读取 Notebook 内容与输出      |
| **外部网络**  | `WebSearch`                | 执行互联网搜索引擎查询        |
|               | `WebFetch`                 | 获取特定 URL 的网页渲染内容   |
| **任务/计划** | `Task`                     | 派生子智能体处理复杂任务      |
|               | `TodoWrite`                | 管理结构化任务清单            |
| **MCP 扩展**  | `mcp__.*`                  | 匹配所有 MCP 服务器工具       |
|               | `mcp__<server>__.*`        | 匹配特定 MCP 服务器的所有操作 |

### B. 非工具类事件
| 事件类型                 | 匹配字段     | 全量有效值范围                                                      |
| :----------------------- | :----------- | :------------------------------------------------------------------ |
| `SessionStart`           | `source`     | `startup`, `resume`, `clear`, `compact`                               |
| `SessionEnd`             | `reason`     | `clear`, `logout`, `prompt_input_exit`, `bypass_permissions_disabled`, `other` |
| `SubagentStart` / `SubagentStop` | `agent_type` | `Bash`, `Explore`, `Plan`, `Code` 或自定义名                          |
| `Notification`           | `type`       | `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog` |
| `PreCompact`             | `trigger`    | `manual`, `auto`                                                      |

**特别提示**:
- `UserPromptSubmit` 事件不支持 matcher，设置后将被忽略
- `Stop`、`TeammateIdle`、`TaskCompleted`、`PermissionRequest` 事件不支持 matcher

## 4. Filter 逻辑 (Advanced Filtering)

使用 `filter` 对象进行更细粒度的控制：

- `tools`: 工具名称数组，精确匹配（如 `["Bash", "Write"]`）
- `commands`: 命令字符串数组，部分匹配（如 `["npm install", "git commit"]`）
- `patterns`: 输入参数模式数组，匹配 JSON 化后的输入（如 `["package.json", ".ts"]`）
- `users`: 用户 ID 数组，精确匹配
- `projects`: 项目 ID 数组，精确匹配
- `environments`: 环境名称数组，精确匹配（如 `["development", "production"]`）

**CLI 支持**：filter 字段可通过 `--filter-*` 参数设置。

**重要说明**：
- Filter 各字段之间是 **AND 关系**（所有条件都要满足）
- Filter 与 Matcher 之间也是 **AND 关系**（两者都要满足）

## 4.1 Matcher vs Filter

| 特性 | Matcher | Filter |
|------|---------|--------|
| **类型** | 单一字符串（正则表达式） | 对象（多个过滤条件） |
| **匹配方式** | 正则匹配 | 精确匹配或部分匹配（includes） |
| **通配符** | 支持 `*`, `.*`, `''` | 不支持 |
| **配置方式** | CLI 参数 (`--matcher`) 或手动编辑 config.json | CLI 参数 (`--filter-*`) 或配置文件 |
| **与对方关系** | 互相独立，可同时使用 | 互相独立，可同时使用 |
| **执行顺序** | **第一个检查**（粗粒度） | **第二个检查**（细粒度） |
| **示例** | `--matcher "Bash\|Write"` | `--filter-tools "Bash,Write"` |

**执行逻辑**（职责分工，两者都要满足）：
```
1. Registry.getHooksForEvent() → 获取事件的所有钩子
2. HookExecutor 对每个钩子依次检查：
   ├─> 先检查 Matcher（粗粒度过滤 - 事件特定字段）
   │   └─> 快速排除不匹配事件类型的钩子
   ├─> 再检查 Filter（细粒度过滤 - 具体值）
   │   └─> 对已通过 matcher 的钩子进行精确过滤
   └─> 两者都通过才执行 Handler
```

**设计理念**：
- **Matcher**: 粗粒度过滤，与事件类型强相关
  - 工具事件匹配 tool name
  - SessionStart 匹配 metadata.source
  - SessionEnd 匹配 metadata.reason
  - 等等...
- **Filter**: 细粒度过滤，不依赖事件类型
  - filter.tools: 精确匹配工具名列表
  - filter.commands: 部分匹配命令字符串
  - filter.patterns: 匹配参数模式

**CLI 使用**：
```bash
# 使用 matcher 进行粗粒度过滤
hookmanager add bash-audit PreToolUse "npm audit" --matcher "Bash"

# 使用 filter 进行细粒度过滤
hookmanager add file-check PreToolUse "echo $FILE" --filter-tools "Write,Edit"

# 两者结合使用（先 matcher 粗筛，再 filter 细筛）
hookmanager add mcp-guard PreToolUse "validate-mcp" \
  --matcher "mcp__.*" \
  --filter-tools "mcp__claude-flow__agent_spawn"
```

**Matcher 验证**：
CLI 会自动验证 matcher 是否与事件类型匹配：
```bash
# 错误示例 - 事件不支持 matcher
$ hookmanager add test UserPromptSubmit "check" --matcher "test"
Error: Event "UserPromptSubmit" does not support matcher.

# 错误示例 - matcher 值无效
$ hookmanager add test PreToolUse "check" --matcher "InvalidTool"
Error: Matcher "InvalidTool" is not a known value for PreToolUse.

Valid matchers for PreToolUse:
  - Bash
  - Edit
  - Write
  - mcp__.*
  - ...

Examples:
  - Bash - Match Bash tool only
  - Bash|Write - Match Bash or Write
  - mcp__.* - Match all MCP tools
```

## 5. Handler 类型 (Handler Types)

`hookmanager` 支持两种 Handler 类型：

| 类型 | 值 | 描述 | 适用场景 |
|------|-----|------|----------|
| **命令执行** | `command` | 执行 Shell 命令或脚本 | 简单脚本、工具调用、外部脚本 |
| **AI 提示** | `prompt` | 使用 AI 进行智能决策 | 模糊决策、语义理解 |

**CLI 使用**：通过 `--type` 参数指定（默认为 `command`）

```bash
# 命令类型（默认）
hookmanager add my-hook PreToolUse "npm audit"

# AI 提示类型
hookmanager add ai-filter UserPromptSubmit "检查输入是否安全" --type prompt

# 使用 matcher 进行粗粒度过滤
hookmanager add bash-audit PreToolUse "npm audit" --matcher "Bash"
```

### 5.1 Prompt Handler (AI-Powered Hooks)

**核心特性**: 将决策逻辑外化为文本提示，由 AI 模型动态判断。

#### 配置结构

```json
{
  "type": "prompt",
  "prompt": "评估此操作是否安全：$ARGUMENTS",
  "model": "claude-3-5-haiku-20241022",
  "systemPrompt": "You are a decision assistant...",
  "timeout": 30000
}
```

| 字段 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `type` | string | 是 | - | 必须为 `"prompt"` |
| `prompt` | string | 是 | - | 提示模板，`$ARGUMENTS` 会被替换为事件上下文 JSON |
| `model` | string | 否 | 全局配置 | 覆盖使用的 AI 模型 |
| `systemPrompt` | string | 否 | 内置决策提示 | 自定义系统提示词 |
| `timeout` | number | 否 | 30000 | AI 响应超时（毫秒） |

#### 工作流程

```
事件触发 → 构建 HookPromptContext → 注入 Prompt → AI 决策 → 解析 JSON → 返回 HookResult
```

1. **上下文注入**: `$ARGUMENTS` 自动替换为包含 `event`, `tool`, `input`, `output` 等字段的 JSON
2. **AI 决策**: 返回 `{"ok": true/false, "reason": "..."}`
3. **结果映射**:
   - `ok: true` → `exitCode: 0` (允许)
   - `ok: false` → `exitCode: 2` (拒绝)

#### 支持的事件

仅支持**决策类事件**（需要 allow/deny 或 continue/block）：

| 事件 | 决策类型 | ok: true | ok: false |
|------|----------|----------|-----------|
| `PreToolUse` | 权限决策 | `permissionDecision: "allow"` | `permissionDecision: "deny"` |
| `PermissionRequest` | 权限决策 | `permissionDecision: "allow"` | `permissionDecision: "deny"` |
| `PostToolUse` | 流程控制 | `decision: "continue"` | `decision: "block"` |
| `PostToolUseFailure` | 流程控制 | `decision: "continue"` | `decision: "block"` |
| `UserPromptSubmit` | 流程控制 | `decision: "continue"` | `decision: "block"` |
| `SubagentStop` | 流程控制 | `decision: "continue"` | `decision: "block"` |

#### CLI 使用示例

```bash
# 添加内容过滤钩子
hookmanager add content-filter UserPromptSubmit \
  "检查输入是否包含不当内容：$ARGUMENTS。返回 JSON: {\"ok\": true/false, \"reason\": \"原因\"}" \
  --type prompt \
  --description "AI 内容审核"

# 添加文件操作风险评估
hookmanager add file-risk PreToolUse \
  "评估文件操作风险：$ARGUMENTS" \
  --type prompt \
  --filter-tools "Write|Edit" \
  --model "claude-3-5-haiku-20241022"
```

#### 前置配置：AI 提供者

在**全局配置**文件 (`~/.claude/hooks/hookmanager/config.json`) 中配置：

```json
{
  "ai": {
    "provider": "anthropic",
    "anthropic": {
      "apiKey": "sk-ant-xxx",
      "baseURL": "https://api.anthropic.com",
      "model": "claude-3-5-haiku-20241022"
    }
  }
}
```

**支持的提供者**:
- `anthropic` - Anthropic Claude API
- `openai` - OpenAI 兼容 API

**环境变量备选**:
- `ANTHROPIC_API_KEY` 或 `CLAUDE_API_KEY`
- `OPENAI_API_KEY`

#### 容错机制

- AI 调用失败时，**默认允许**操作继续（`ok: true`）
- 超时默认 30 秒，可通过 `timeout` 字段调整
- 调试日志输出到 `~/Desktop/prompt-debug.log`

## 6. 决策逻辑控制 (Logic Control)

`hookmanager` 执行的 handler 必须通过系统退出码或返回值告知 Claude 后续行为：

### 6.1 退出码控制 (Command/Script Handler)

- **允许 (Exit 0)**: 钩子逻辑执行成功，允许 Claude 继续后续动作。
- **拦截 (Exit 2)**: **关键操作**。立即阻断 Claude 的当前任务。Stderr 中的文本将作为错误原因反馈给 Claude。
- **JSON 增强**: 在 Exit 0 时，stdout 可输出 `{"additionalContext": "..."}` 来为 Claude 注入额外的运行时信息。

### 6.2 返回值控制 (Module/Programmatic Handler)

```typescript
// 允许继续
return { success: true, exitCode: 0 }

// 拒绝执行
return { success: false, exitCode: 2, stderr: "拒绝原因" }

// 注入上下文
return {
  success: true,
  output: { additionalContext: "额外信息" }
}
```

### 6.3 AI 决策控制 (Prompt Handler)

```json
// 允许
{ "ok": true, "reason": "操作安全" }

// 拒绝
{ "ok": false, "reason": "存在风险" }
```

## 7. 专项文档 (References)

- **[完整事件列表](references/events.md)**: 查看 `ResponseChunk` 等高级事件。
- **[实战配置示例](references/examples.md)**: 包含针对 `mcp__` 工具的安全拦截模板。
