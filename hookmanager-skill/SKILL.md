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
  - `hookmanager add <name> <event> <command> --matcher "<pattern>"`。
  - 添加 `--global` 参数可配置全局钩子。
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
| 事件类型                 | 匹配字段     | 全量有效值范围                                     |
| :----------------------- | :----------- | :------------------------------------------------- |
| `SessionStart`           | `source`     | `startup`, `resume`, `clear`, `compact`            |
| `SessionEnd`             | `reason`     | `clear`, `logout`, `prompt_input_exit`, `other`    |
| `SubagentStart` / `Stop` | `agent_type` | `Bash`, `Explore`, `Plan`, `Code` 或自定义名       |
| `Notification`           | `type`       | `permission_prompt`, `idle_prompt`, `auth_success` |
| `PreCompact`             | `trigger`    | `manual`, `auto`                                   |

**特别提示**: `UserPromptSubmit` 和 `Stop` 事件不支持 matcher，设置后将被忽略。

## 4. Filter 逻辑 (Advanced Filtering)

除了 `matcher` 之外，还可以使用 `filter` 对象进行更细粒度的控制：

- `commands`: 仅针对 `Bash` 工具，匹配具体的命令（如 `npm install`）。
- `patterns`: 正则表达式数组，匹配工具的输入参数（如文件名、代码内容）。
- `tools`: 仅在 `matcher` 为通配符时使用，进一步过滤工具名。

## 5. 决策逻辑控制 (Logic Control)

`hookmanager` 执行的 handler 必须通过系统退出码告知 Claude 后续行为：

- **允许 (Exit 0)**: 钩子逻辑执行成功，允许 Claude 继续后续动作。
- **拦截 (Exit 2)**: **关键操作**。立即阻断 Claude 的当前任务。Stderr 中的文本将作为错误原因反馈给 Claude。
- **JSON 增强**: 在 Exit 0 时，可以输出 `{"additionalContext": "..."}` 来为 Claude 注入额外的运行时信息。

## 6. 专项文档 (References)

- **[完整事件列表](references/events.md)**: 查看 `ResponseChunk` 等高级事件。
- **[实战配置示例](references/examples.md)**: 包含针对 `mcp__` 工具的安全拦截模板。
