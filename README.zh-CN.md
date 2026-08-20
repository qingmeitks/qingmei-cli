# Qingmei (青袂) - 极简现代化 TypeScript Agent CLI

<p align="center">
  <a href="README.md">English</a> | <b>简体中文</b>
</p>

---

**Qingmei (青袂)** 是一款基于 TypeScript 和 Node.js 构建的现代化、模块化、高密度的自主 AI Agent 命令行终端工具（CLI）。它深度集成了 **Model Context Protocol (MCP)** 协议规范、具备完整的 **Skill 技能扩展体系**、支持 **4 级安全防护模式**，并拥有无 Emoji 干扰、全包围一体化外框的极客级纯文本交互体验。

---

## 🌟 核心特性

- **自主 ReAct 推理闭环**：多步工具调用、思维链 (Thinking/Reasoning) 实时流式呈现、智能循环检测与自我纠错机制。
- **全包围一体式终端界面 (Integrated Boxed TUI)**：
  - 界面全屏铺满终端高与宽，外框外部保留舒适左右 Padding 留白；标题位于顶部，输入舱与状态栏锚定在底部。
  - 标题栏与输入舱之间实时展示会话与操作历史记录，超出范围支持鼠标滚轮、`PageUp`/`PageDown` 及方向键平滑滚动，不显示滚动条。
  - 状态栏实时展示上下文使用量（如 `1.8k/1M (0.2%)`），当前工作区路径下移另起一行以 `~` 相对路径精简呈现。
- **工作区信任与路径沙箱 (Workspace Trust & Path Sandboxing)**：
  - 首次打开未信任工作区时主动阻断并弹出信任确认，未信任模式下自动锁定为受限只读，禁止写文件与执行 Shell。
  - 底层内置路径沙箱防逃逸机制，物理拦截越过项目根目录的恶意路径穿越与敏感系统文件篡改。
- **4 级安全防御模式 (Security Spectrum)**：
  - **`[interactive]`**：只读工具自动执行，写入文件及终端命令执行前强制进行人工确认。
  - **`[auto]`**：全自主放行执行，无需任何交互中断。
  - **`[readonly]`**：严格只读分析模式，物理拦截并拦截所有文件修改与 Shell 执行请求。
  - **`[chat]`**：**纯对话模式**，禁用并剔除所有 Tool Schema，零 Token 开销，极速响应，杜绝模型幻觉调用工具。
- **超大上下文感知 (1M Context Aware)**：
  - 精准识别 1M+ 超长上下文模型（如 DeepSeek-V4 系列、Gemini 3.7 / 3.5 系列），动态调整 Token 预算分配与长上下文提示。
  - 状态栏与模型列表实时呈现 `[1M]` / `[200k]` 规格徽章。
- **精准厂商预设 (Curated Presets)**：
  - **DeepSeek**：预设 `deepseek-v4-flash`（1M 上下文、支持推理与工具）与 `deepseek-v4-pro`（1M 上下文、支持工具）。
  - **Google Gemini**：预设 `gemini-3.7-flash`（1M 上下文、支持推理与工具）、`gemini-3.5-flash-lite`（1M 上下文）与 `gemini-3.1-pro-preview`（1M 上下文）。
- **Model Context Protocol (MCP) 深度集成**：原生支持基于 `stdio` 进程沙箱与 `sse` 远程端点的 MCP Tools、Resources 和 Prompts，自动隔离命名空间。
- **Skill 技能扩展体系**：标准 `SKILL.md` 规范解析器，支持全局 `~/.qingmei/skills/` 技能仓库与热插拔注入。
- **三层指令约束体系 (Layered Instructions)**：
  - 全局用户约束：`~/.qingmei/QINGMEI.md`（跨项目生效）
  - 项目根目录约束：`./AGENTS.md`（当前工作空间生效）
  - 技能扩展指令：激活的 `SKILL.md`（按需动态注入）
- **零工作区污染**：100% 配置与数据隔离于全局 `~/.qingmei/` 目录，您的代码仓库保持极致纯净。

---

## 🚀 快速上手

### 1. 安装与启动

#### 方式 A：免安装即开即用（推荐）
```bash
npx @qingmeixyz/cli
```

#### 方式 B：全局安装
```bash
# 全局安装青袂 CLI
npm install -g @qingmeixyz/cli

# 直接启动
qingmei
```

#### 方式 C：从源码本地构建
```bash
# 克隆仓库并安装依赖
npm install

# 编译 ESM 产物
npm run build

# 全局软链接命令
npm link
```

> **首次启动引导**：若尚未配置 AI 厂商，青袂将自动启动交互式配置向导，引导您选择厂商（DeepSeek / Gemini 等）、输入 API Key、验证网络连通性，并自动完成预设模型选择。

---

## ⌨️ REPL 斜杠指令一览

在 `qingmei` 终端交互会话中输入 `/` 即可触发实时提示与 `Tab` 补全：

| 指令 | 作用描述 |
| :--- | :--- |
| `/mode [mode]` | 快速切换运行模式（`interactive` 交互、`auto` 自动、`readonly` 只读、`chat` 纯对话） |
| `/model [name]` | 切换 AI 厂商与模型（支持分组选择与 API Key 动态填写） |
| `/effort [level]` | 调整思考/推理强度（`off`, `low`, `medium`, `high`） |
| `/skills` | 查看已安装的技能列表，并可按需开启或禁用 |
| `/mcp` | 查看已连接的 MCP 服务器健康状态与工具清单 |
| `/trust [path]` | 信任当前或指定工作区，解锁完整写/执行工具与自定义技能 |
| `/untrust [path]` | 撤销工作区信任，立即进入受限只读保护模式 |
| `/compact` | 立即压缩与优化当前会话上下文（折叠长日志并提炼关键进展摘要） |
| `/clear` | 清空终端屏幕并重置当前会话的上下文记忆 |
| `/session [subcmd]` | 会话全生命周期管理：`-l` (列表), `-s` (保存), `-r` (恢复), `-d` (删除), `-e` (导出) |
| `/config` | 查看当前生效的全局配置（支持 `/config edit` 一键唤起系统编辑器） |
| `/help` | 显示完整的指令帮助清单 |
| `/exit` 或 `/quit` | 退出青袂终端并断开所有后台 MCP 进程 |




---

## 🛡️ 4 级安全防御模式详解

可以通过终端指令 `/mode <name>` 或直接在启动时通过环境变量 `QINGMEI_SECURITY_MODE` 设定：

```text
┌──────────────┬──────────────────┬──────────────────┬──────────────────┐
│ 模式         │ 只读工具 (Read)  │ 写入/命令 (Exec) │ 工具 Schema 注入 │
├──────────────┼──────────────────┼──────────────────┼──────────────────┤
│ interactive  │ 自动放行 (Auto)  │ 用户确认 (Prompt)│ 启用 (Enabled)   │
│ auto         │ 自动放行 (Auto)  │ 自动放行 (Auto)  │ 启用 (Enabled)   │
│ readonly     │ 自动放行 (Auto)  │ 物理拦截 (Block) │ 启用 (Enabled)   │
│ chat         │ 禁用 (Disabled)  │ 禁用 (Disabled)  │ 完全剔除 (None)  │
└──────────────┴──────────────────┴──────────────────┴──────────────────┘
```

- **`[chat]` 模式优势**：完全不向模型注入任何工具描述，节省大量 Prompt Token，避免模型误触工具调用，大幅提升纯对话时的响应速度。

---

## 📜 提示词与指令约束体系

青袂在每一次对话循环中，会按照严格的优先级自动合成 Agent 的 System Prompt：


```text
┌──────────────────────────────────────────────────────────┐
│ 1. 核心 Agent System Prompt (角色设定、ReAct 规则、安全模式)   │
├──────────────────────────────────────────────────────────┤
│ 2. 全局用户指令 (~/.qingmei/QINGMEI.md - 跨工程全局生效)   │
├──────────────────────────────────────────────────────────┤
│ 3. 项目约束指令 (./AGENTS.md - 针对当前仓库的规范/SOP)      │
├──────────────────────────────────────────────────────────┤
│ 4. 激活的技能指令 (Active SKILL.md Protocols)             │
└──────────────────────────────────────────────────────────┘
```

1. **全局用户约束 (`~/.qingmei/QINGMEI.md`)**：
   - 跨机器内所有工程生效。
   - 适合沉淀个人的编码偏好、表达习惯、通用代码审查标准等。
2. **项目约束 (`./AGENTS.md`)**：
   - 放置在当前代码仓库根目录下。
   - 适合指定当前项目的架构规范、测试命令（如 `npm test`）、技术选型禁忌及团队 SOP。
3. **技能扩展 (`SKILL.md`)**：
   - 当通过 `/skills` 启用某项专业技能时按需动态注入。

---

## ⚙️ 配置文件与手动编辑 (`~/.qingmei/config.json`)

支持使用 `qingmei config edit` 或在终端内输入 `/config edit` 一键唤起系统默认编辑器进行配置：

```json
{
  "activeProvider": "deepseek",
  "activeModel": "deepseek-v4-flash",
  "securityMode": "interactive",
  "providers": {
    "deepseek": {
      "apiKey": "sk-...",
      "baseUrl": "https://api.deepseek.com/v1",
      "defaultModel": "deepseek-v4-flash",
      "models": [
        {
          "id": "deepseek-v4-flash",
          "name": "deepseek-v4-flash",
          "context": "1M",
          "contextWindow": 1000000,
          "is1MContext": true,
          "supportsTools": true,
          "supportsReasoning": true
        },
        {
          "id": "deepseek-v4-pro",
          "name": "deepseek-v4-pro",
          "context": "1M",
          "contextWindow": 1000000,
          "is1MContext": true,
          "supportsTools": true,
          "supportsReasoning": false
        }
      ]
    },
    "gemini": {
      "apiKey": "AIza...",
      "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai/",
      "defaultModel": "gemini-3.7-flash",
      "models": [
        {
          "id": "gemini-3.7-flash",
          "name": "gemini-3.7-flash",
          "context": "1M",
          "contextWindow": 1000000,
          "is1MContext": true,
          "supportsTools": true,
          "supportsReasoning": true
        },
        {
          "id": "gemini-3.5-flash-lite",
          "name": "gemini-3.5-flash-lite",
          "context": "1M",
          "contextWindow": 1000000,
          "is1MContext": true,
          "supportsTools": true,
          "supportsReasoning": false
        },
        {
          "id": "gemini-3.1-pro-preview",
          "name": "gemini-3.1-pro-preview",
          "context": "1M",
          "contextWindow": 1000000,
          "is1MContext": true,
          "supportsTools": true,
          "supportsReasoning": false
        }
      ]
    }
  }
}
```

### 凭证读取优先级
1. **环境变量**（最高优先级，如 `DEEPSEEK_API_KEY`、`GEMINI_API_KEY` 等）
2. **全局配置文件** (`~/.qingmei/config.json`)
3. **交互式向导**（未配置时自动唤起）

---

## 🔌 MCP (Model Context Protocol) 管理

### CLI 命令
```bash
# 查看所有已配置的 MCP 服务器及其运行状态
qingmei mcp list

# 添加本地 stdio 进程沙箱 MCP 服务（例如文件系统）
qingmei mcp add filesystem --command "npx -y @modelcontextprotocol/server-filesystem ./ "

# 添加远程 SSE 协议 MCP 服务
qingmei mcp add remote-service --url "https://mcp.company.com/sse"

# 测试 MCP 服务连通性并列出暴露的工具
qingmei mcp test filesystem

# 移除指定 MCP 服务
qingmei mcp remove filesystem
```

配置文件位于 `~/.qingmei/mcp.json`，青袂启动时会自动在后台完成所有服务的异步连接与工具隔离注册（命名格式形如 `mcp__<server>__<tool>`）。

---

## 🧠 Skill 技能扩展体系

Skills 允许您以标准 Markdown 形式封装特定场景的专业排查 SOP、系统指令和依赖工具。

### 创建新技能
```bash
qingmei skill new code-auditor
```

该命令将在 `~/.qingmei/skills/code-auditor/` 目录下生成标准的 `SKILL.md`：
```markdown
---
name: code-auditor
description: 代码安全审计与漏洞扫描专业 SOP
version: 1.0.0
author: user
tags: [security, audit]
required_tools: [read_file, run_command]
---

# 安全审计操作规程 (SOP)
1. 检索 package.json 与依赖锁定文件，排查已知 CVE 依赖漏洞。
2. 检查入口路由鉴权拦截逻辑。
3. 检查数据库查询语句是否均采用参数化绑定，防止 SQL 注入。
```

在青袂终端中输入 `/skills` 即可一键激活或禁用该技能。


---

## 🛠️ 本地开发与测试

```bash
# 运行单元测试与集成测试套件
npm test

# 运行 TypeScript 类型检查
npm run typecheck

# 构建打包
npm run build

# 本地调试运行
npm run dev
```

---

## 🤝 贡献政策与反馈

本项目目前由作者独立维护，暂不接收外部代码合并与 Pull Request (PR)。如果您遇到任何问题或有改进想法，非常欢迎在 [GitHub Issues](https://github.com/qingmeitks/qingmei-cli/issues) 中交流反馈。


详情请参阅 [贡献政策指南 (CONTRIBUTING.zh-CN.md)](CONTRIBUTING.zh-CN.md)。

---

## 📄 开源许可证

[MIT License](LICENSE) © Qingmei Team

