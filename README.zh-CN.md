# Qingmei (青袂) - 极简现代化 TypeScript Agent CLI

<p align="center">
  <a href="README.md">English</a> | <b>简体中文</b> | <a href="DESIGN.zh-CN.md">架构设计</a> | <a href="CHANGELOG.zh-CN.md">更新日志</a>
</p>

---

**Qingmei (青袂)** 是一款基于 TypeScript 和 Node.js 构建的现代化、模块化、高密度的自主 AI Agent 命令行终端工具（CLI）。它深度集成了 **Multi-Session 多会话并发执行池**、**Model Context Protocol (MCP)** 协议规范、具备完整的 **Skill 技能扩展体系**、支持 **4 级安全防护模式**，并拥有零 Emoji 干扰、纯文字高密度的全包围一体化外框交互体验。

---

## 🌟 核心特性

- **多会话并发执行与无缝切换 (v0.1.0 Multi-Session)**：
  - 单 Workspace 下支持多个并发会话，每个会话享有独立的上下文记忆、状态机与异步执行线程。
  - 支持后台非阻塞执行任务，随时在多个会话之间自由切入查看与交互。
  - 输入框为空时，按 `Tab` 键即可一键快速轮巡切换会话；支持 `/switch` 交互式选择器。
  - `/quit` 或 `/exit` 退出时具备**运行守卫 (Exit Guard)**：若有后台未完成任务将主动拦截并弹出提示。
- **自主 ReAct 推理闭环**：多步工具调用、思维链 (Thinking/Reasoning) 实时流式呈现、智能循环检测与自我纠错机制。
- **全包围一体式终端界面 (Integrated Boxed TUI)**：
  - 界面全屏铺满终端高与宽，外框外部保留舒适左右 Padding 留白；标题位于顶部，输入舱与状态栏锚定在底部。
  - 状态栏双层自适应架构：
    - **Line 1 (指标栏)**：实时展示上下文使用量（如 `[1.8k/1M (<0.1%)]`）、运行模式 `[interactive]`、模型 `[gemini-3.7-flash]`、1M 规格 `[1M]`、推理强度 `[high]` 与未信任警告。
    - **Line 2 (自适应会话栏 + 路径)**：智能适配标准模式（`[#1 (running)] [#2]*`）、紧凑模式与超宽折叠聚合模式（`#5* [running] (8 sessions: 2 running, 6 ready) | ~/path`）。
- **工作区信任与路径沙箱 (Workspace Trust & Path Sandboxing)**：
  - 首次打开未信任工作区时主动阻断并弹出信任确认，未信任模式下自动锁定为受限只读，禁止写文件与执行 Shell。
  - 底层内置路径沙箱防逃逸机制，物理拦截越过项目根目录的恶意路径穿越与敏感系统文件篡改。
- **4 级安全防御模式 (Security Spectrum)**：
  - **`[interactive]`**：只读工具自动执行，写入文件及终端命令执行前强制进行人工确认。
  - **`[auto]`**：全自主放行执行，无需任何交互中断。
  - **`[readonly]`**：严格只读分析模式，物理拦截所有文件修改与 Shell 执行请求。
  - **`[chat]`**：**纯对话模式**，禁用并剔除所有 Tool Schema，零 Token 开销，极速响应，杜绝模型幻觉调用工具。
- **超大上下文感知 (1M Context Aware)**：
  - 精准识别 1M+ 超长上下文模型（如 DeepSeek-V4 系列、Gemini 3.8 / 3.7 / 3.6 系列），动态调整 Token 预算分配与长上下文提示。
- **精准厂商预设 (Curated Presets)**：
  - **DeepSeek**：预设 `deepseek-v4-flash`（1M 上下文、支持推理与工具）与 `deepseek-v4-pro`（1M 上下文、支持工具）。
  - **Google Gemini**：预设 `gemini-3.8-flash`（1M 上下文、支持推理与工具）、`gemini-3.7-flash`（1M 上下文、支持推理与工具）、`gemini-3.6-flash`（1M 上下文、支持工具）与 `gemini-3.1-pro-preview`（1M 上下文）。
  - **Anthropic Claude**：预设 `claude-sonnet-4-6`（1M 上下文、支持推理与工具）与 `claude-opus-4-6`（1M 上下文、支持推理与工具）。
  - **OpenAI**：预设 `gpt-5.6-sol`、`gpt-5.6-terra`、`gpt-5.6-luna`、`gpt-5.5`（1M 上下文、支持推理与工具）与 `gpt-5.4-mini`（1M 上下文、支持工具）。
  - **GLM / 智谱 AI**：预设 `GLM-5.3-Flash`（1M 上下文、支持推理与工具）、`GLM-5.3`、`GLM-5.2`（1M 上下文）。
  - **Grok / xAI**：预设 `grok-4.6`（1M 上下文、支持推理与工具）、`grok-4.5`（1M 上下文、支持推理与工具）、`grok-4.3`（1M 上下文）。
  - **Qwen / 通义千问**：预设 `qwen3.8-max`（1M 上下文、支持推理与工具）、`qwen3.8-flash`（1M 上下文、支持推理与工具）、`qwen3.7-max`（1M 上下文、支持推理与工具）、`qwen3.7-plus`、`qwen3.7-flash`（1M 上下文）。
- **Token 消耗与 Prompt Cache 命中率统计**：
  - 自动捕获各模型服务端 KV Cache / Prompt Cache 命中数据，单轮生成后输出低侵入式耗时与缓存指标（如 `[1.4s | in: 1,200 (cached: 1,000, 83.3%) | out: 300]`）。
  - 专属 `/usage`（Token 账单与缓存节省分析）与 `/stats`（会话全景活动与工具执行诊断）命令。
  - 优雅退出总结卡片：呈现青色 `QINGMEI` 点阵文字图标与整洁分行的资源消耗总结。
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
npx @qingmeitks/cli
```

#### 方式 B：全局安装
```bash
# 全局安装青袂 CLI
npm install -g @qingmeitks/cli

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

> **首次启动引导**：若尚未配置 AI 厂商，青袂将自动启动交互式配置向导，引导您选择厂商（DeepSeek / Gemini / GLM / Grok / Qwen 等）、输入 API Key、验证网络连通性，并自动完成预设模型选择。

---

## ⌨️ REPL 斜杠指令一览

在 `qingmei` 终端交互会话中输入 `/` 即可触发实时提示与 `Tab` 补全：

| 指令 | 作用描述 | 示例 |
| :--- | :--- | :--- |
| **`/new [name]`** | 新建并切入新会话 | `/new 接口重构` |
| **`/switch [id]`** | 切换活动会话（空参弹出选择器，或在输入框为空时按 `Tab`） | `/switch 1` |
| **`/sessions`** | 查看当前内存所有会话及磁盘存档快照 | `/sessions` |
| **`/rename [name]`** | 重命名当前活动会话 | `/rename API设计` |
| **`/close [id]`** | 关闭并释放指定会话内存 | `/close 2` |
| **`/save [name]`** | 命名保存当前会话快照至磁盘 | `/save checkpoint-1` |
| **`/resume [id]`** | 从磁盘恢复/唤醒历史会话 | `/resume sess_123` |
| **`/delete [id]`** | 从磁盘删除指定会话快照（支持 `/delete all` 一键清空） | `/delete sess_123` |
| **`/export [id]`** | 导出会话为 Markdown 报告 | `/export` |
| **`/mode [mode]`** | 快速切换运行模式（`interactive` 交互、`auto` 自动、`readonly` 只读、`chat` 纯对话） | `/mode auto` |
| **`/model [name]`** | 切换 AI 厂商与模型（支持就地更新与解绑 API Key） | `/model` |
| **`/key [prov] [key]`** | 独立管理厂商 API Key（脱敏预览、探活排错、快捷修改、`/key rm <prov>`） | `/key deepseek sk-xxxx` |
| **`/effort [level]`** | 调整思考/推理强度（`off`, `low`, `medium`, `high`） | `/effort high` |
| **`/skills`** | 查看已安装的技能列表，并可按需开启或禁用 | `/skills` |
| **`/mcp`** | 查看已连接的 MCP 服务器健康状态与工具清单 | `/mcp` |
| **`/trust [path]`** | 信任当前或指定工作区，解锁完整写/执行工具与自定义技能 | `/trust` |
| **`/untrust [path]`** | 撤销工作区信任，立即进入受限只读保护模式 | `/untrust` |
| **`/compact`** | 立即压缩与优化当前会话上下文（折叠长日志并提炼关键进展摘要） | `/compact` |
| **`/usage`** | 查看当前会话的 Token 消耗明细与 Prompt Cache 缓存命中率 | `/usage` |
| **`/stats`** | 查看会话全景活动诊断（时长、轮次、工具调用成功率与 Token 概览） | `/stats` |
| **`/clear`** | 清空终端屏幕视口（保留当前会话上下文记忆） | `/clear` |
| **`/config`** | 查看当前生效的全局配置（支持 `/config edit` 一键唤起系统编辑器） | `/config` |
| **`/help`** | 显示完整的指令帮助清单 | `/help` |
| **`/exit` 或 `/quit`** | 退出青袂终端（若有后台执行中的会话将触发退出确认拦截） | `/quit` |

---

## ⌨️ 常用快捷键一览

| 快捷键 | 功能描述 |
| :--- | :--- |
| **`Tab`** | 输入框为空时，一键快速轮巡切换活动会话；输入命令或 `@` 时用于补全 |
| **`Up` / `Down`** | 输入框命令历史回溯（以及斜杠指令与 `@mention` 候选下拉列表选择） |
| **`Shift + Up` / `Shift + Down`** | 上下平滑滚动浏览主视口历史对话记录 |
| **`Esc` / `Ctrl + C`** | 模型思考/生成过程中立即中断停止当前回答；输入状态下清空当前输入文本 |
| **`/exit` 或 `/quit`** | 退出青袂 CLI（退出程序专属指令） |

---

## 🛠️ 核心操作技巧

### 1. 文件精准引用 (`@file`)
在输入框中输入 `@` 字符，将自动扫描当前工作区所有代码与配置文件，弹出模糊匹配补全浮层，选中的文件内容将自动作为结构化上下文注入当前提问中。

### 2. 本地 Shell 直通 (`!<cmd>`)
输入以 `!` 开头的指令（如 `!git status` 或 `!npm test`），将直接在宿主环境中执行系统 Shell 命令，并实时捕获输出至历史视口中。

---

## 📄 开源许可证

本项目遵循 [MIT License](LICENSE)。
