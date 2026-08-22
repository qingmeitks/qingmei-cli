import child_process from 'child_process';
import chalk from 'chalk';
import * as p from '@clack/prompts';
import {
  loadConfig,
  isConfigured,
  saveConfig,
  getModelMetadata,
  getProviderDefinition,
  getProviderModels,
  openConfigFileInEditor,
  getContextDisplayBadge,
} from '../config/loader.js';

import { runConfigInitWizard } from './commands/config.js';
import { QingmeiAgent } from '../core/agent.js';
import { LLMClient, parseModelMetadataFromId } from '../core/llm/client.js';

import path from 'path';
import { ToolRegistry } from '../tools/registry.js';
import { MCPManager } from '../mcp/manager.js';
import { SkillManager } from '../skills/manager.js';
import { TuiPrompt } from './ui/prompt.js';
import { SecurityMode, ModelMetadata, QingmeiConfig, ProviderConfig, ModelConfig, ThinkingEffort } from '../config/types.js';
import { SUPPORTED_PROVIDERS, CONFIG_PATH } from '../config/defaults.js';
import { isWorkspaceTrusted, addTrustedWorkspace, removeTrustedWorkspace } from '../core/security/trust.js';
import { expandMentions } from '../core/context/mention.js';
import {
  handleNewSession,
  handleSwitchSession,
  handleListSessions,
  handleRenameSession,
  handleCloseSession,
  handleSaveSession,
  handleResumeSession,
  handleDeleteSession,
  handleExportSession,
  handleQuitWithRunningGuard,
  applySwitchedSessionToTui,
} from './commands/session.js';

export function clearTerminal(): void {
  process.stdout.write('\x1b[0 q\x1b[2J\x1b[3J\x1b[H\x1b[?25h');
}

export async function startRepl(): Promise<void> {
  // 1. Check if configured, otherwise auto-trigger setup wizard
  if (!isConfigured()) {
    console.log(chalk.yellow('\nNo active AI provider configured. Starting initial setup...\n'));
    await runConfigInitWizard();
  }

  const config = loadConfig();
  const providerDef = config.providers[config.activeProvider] || {};
  const activeModelMeta = getModelMetadata(config.activeModel, config.activeProvider);

  // 2. Workspace Trust Check
  const currentCwd = process.cwd();
  let isTrusted = isWorkspaceTrusted(currentCwd, config.trustedWorkspaces);

  if (!isTrusted) {
    p.intro(chalk.bold.yellow('Workspace Trust Required'));
    p.note(
      `You are opening Qingmei in an untrusted directory:\n${chalk.cyan(currentCwd)}\n\nUntrusted workspaces disable mutating actions and custom local scripts to protect against prompt injection and malicious code.`,
      'Security Protection'
    );

    const trustChoice = await p.select({
      message: 'Do you trust the files and authors in this workspace?',
      options: [
        {
          value: 'trust',
          label: 'Yes, trust this workspace',
          hint: 'Enables full agent tools according to your security mode',
        },
        {
          value: 'restricted',
          label: 'No, run in Restricted Mode',
          hint: 'Strict read-only analysis; file modifications & shell execution are blocked',
        },
        {
          value: 'exit',
          label: 'Exit',
          hint: 'Close Qingmei safely',
        },
      ],
    });

    if (p.isCancel(trustChoice) || trustChoice === 'exit') {
      p.outro(chalk.gray('Exited Qingmei.'));
      process.exit(0);
    }

    if (trustChoice === 'trust') {
      addTrustedWorkspace(currentCwd);
      isTrusted = true;
      p.outro(chalk.green(`✓ Workspace trusted: ${currentCwd}`));
    } else {
      isTrusted = false;
      p.outro(chalk.yellow(`! Running in restricted mode for ${currentCwd}`));
    }
  }

  // 3. Initialize Core Subsystems
  const llmClient = new LLMClient({
    apiKey: providerDef.apiKey || '',
    baseUrl: providerDef.baseUrl || 'https://api.openai.com/v1',
    defaultModel: config.activeModel,
    provider: config.activeProvider,
  });

  const toolRegistry = new ToolRegistry(true);
  const mcpManager = new MCPManager();
  const skillManager = new SkillManager();

  // Connect to background MCP servers
  await mcpManager.connectAll(toolRegistry);

  const agent = new QingmeiAgent({
    workingDirectory: currentCwd,
    securityMode: isTrusted ? (config.securityMode || 'interactive') : 'readonly',
    isWorkspaceTrusted: isTrusted,
    thinkingEffort: config.thinkingEffort || 'medium',
    compactionConfig: config.compaction,
    llmClient,
    activeModel: activeModelMeta,
    skillManager,
    mcpManager,
  });
  agent.dispatcher.registry = toolRegistry;

  const initialUsage = agent.getContextUsage();
  const initialBar = agent.pool.getStatusBarSecondLine(process.stdout.columns || 80);
  const tuiPrompt = new TuiPrompt({
    mode: agent.securityMode,
    model: agent.activeModel,
    cwd: agent.workingDirectory,
    isWorkspaceTrusted: agent.isWorkspaceTrusted,
    thinkingEffort: agent.thinkingEffort,
    contextUsage: initialUsage.display,
    sessionBarText: initialBar,
  });

  // 4. Main REPL loop
  clearTerminal();
  while (true) {
    const currentUsage = agent.getContextUsage();
    const sessionBarText = agent.pool.getStatusBarSecondLine(process.stdout.columns || 80);
    tuiPrompt.updateState(
      agent.securityMode,
      agent.activeModel,
      agent.isWorkspaceTrusted,
      agent.thinkingEffort,
      currentUsage.display,
      sessionBarText
    );

    const input = await tuiPrompt.readLine({
      onEmptyTab: () => {
        const next = agent.pool.nextSession();
        applySwitchedSessionToTui(next, agent, tuiPrompt);
        const usage = agent.getContextUsage();
        const bar = agent.pool.getStatusBarSecondLine(process.stdout.columns || 80);
        tuiPrompt.updateState(
          agent.securityMode,
          agent.activeModel,
          agent.isWorkspaceTrusted,
          agent.thinkingEffort,
          usage.display,
          bar
        );
      },
    });

    if (!input) continue;

    // 1. Record user instruction in history and clear any previous live lines
    tuiPrompt.clearLiveLines();
    tuiPrompt.addHistory(`${chalk.cyan('> ')}${chalk.bold(input)}`);
    tuiPrompt.renderBox('', 0, 0);

    // Handle Shell Passthrough (!<cmd>)
    if (input.startsWith('!')) {
      const rawCmd = input.slice(1).trim();
      if (!rawCmd) {
        continue;
      }

      try {
        const startTime = Date.now();
        tuiPrompt.startSpinner(`Executing: ${rawCmd}...`);
        const output = child_process.execSync(rawCmd, {
          cwd: agent.workingDirectory,
          encoding: 'utf-8',
          timeout: 60000,
          maxBuffer: 10 * 1024 * 1024,
        });
        const elapsed = Date.now() - startTime;
        tuiPrompt.stopSpinner();
        if (output.trim()) {
          tuiPrompt.addHistory(output.trim());
          tuiPrompt.addHistory('');
        }
        tuiPrompt.addHistory(chalk.dim(`[Process exited with 0 (${elapsed}ms)]`));
        tuiPrompt.addHistory('');
      } catch (err: any) {
        tuiPrompt.stopSpinner();
        if (err.stdout && err.stdout.trim()) {
          tuiPrompt.addHistory(err.stdout.trim());
        }
        if (err.stderr && err.stderr.trim()) {
          tuiPrompt.addHistory(chalk.red(err.stderr.trim()));
        } else if (err.message) {
          tuiPrompt.addHistory(chalk.red(`Command failed: ${err.message}`));
        }
        const exitCode = typeof err.status === 'number' ? err.status : 1;
        tuiPrompt.addHistory(chalk.red.dim(`[Process exited with code ${exitCode}]`));
        tuiPrompt.addHistory('');
      }
      tuiPrompt.renderBox('', 0, 0);
      continue;
    }

    // Handle Slash Commands
    if (input.startsWith('/')) {
      const [cmd, ...args] = input.slice(1).split(/\s+/);
      const argStr = args.join(' ').trim();

      try {
        const handled = await handleSlashCommand(cmd, argStr, agent, tuiPrompt);
        if (handled === 'exit') {
          await mcpManager.disconnectAll();
          process.stdout.write('\x1b[2J\x1b[3J\x1b[H\x1b[?25h');
          process.exit(0);
        }
      } catch (err: any) {
        tuiPrompt.addHistory(chalk.red(`Error executing slash command: ${err.message}`));
        tuiPrompt.addHistory('');
      } finally {
        process.stdin.resume();
      }
      tuiPrompt.renderBox('', 0, 0);
      continue;
    }

    // Handle Agent Execution (with @mention auto context expansion)
    try {
      let currentReasoning = '';
      let currentText = '';

      // Expand any @filepath references into structured context
      const mentionResult = expandMentions(input, agent.workingDirectory);
      const finalPrompt = mentionResult.expandedPrompt;

      if (mentionResult.referencedFiles.length > 0) {
        const fileNames = mentionResult.referencedFiles.map((f) => chalk.cyan(`@${f.relativePath}`)).join(', ');
        tuiPrompt.addHistory(chalk.dim(`[Attached referenced context from: ${fileNames}]`));
      }

      // Start animated live activity spinner in history area
      tuiPrompt.startSpinner('Thinking...');

      await agent.run(finalPrompt, {
        onReasoningChunk: (delta) => {
          currentReasoning += delta;
          tuiPrompt.updateSpinner('Thinking (reasoning)...');
          tuiPrompt.setLiveLines([chalk.gray(`[thinking: ${currentReasoning.trim()}]`)]);
        },
        onTextChunk: (delta) => {
          currentText += delta;
          tuiPrompt.updateSpinner('Generating response...');
          tuiPrompt.setLiveLines([chalk.white(currentText)]);
        },
        onToolCallStart: (name) => {
          tuiPrompt.setLiveLines([chalk.cyan(`> call: ${name}`)]);
          tuiPrompt.updateSpinner(`Executing tool: ${name}...`);
        },
        onToolCallResult: (name, output, durationMs, success) => {
          const statusIcon = success ? chalk.green('✓') : chalk.red('✗');
          const durationStr = chalk.dim(`(${durationMs}ms)`);
          tuiPrompt.setLiveLines([`${statusIcon} ${chalk.dim(name)} ${durationStr}`]);
          tuiPrompt.updateSpinner('Thinking...');
        },
        onConfirm: async (description) => {
          tuiPrompt.stopSpinner();
          tuiPrompt.clearLiveLines();
          const confirmed = await tuiPrompt.confirmModal({
            title: 'Confirm Tool Action',
            message: `Allow action: ${description}`,
            initialValue: true,
          });
          tuiPrompt.startSpinner('Executing...');
          return confirmed;
        },
      });

      // Stop spinner and clear temporary execution process from live lines
      tuiPrompt.stopSpinner();
      tuiPrompt.clearLiveLines();

      // Keep ONLY the final result in permanent history
      if (currentText.trim()) {
        tuiPrompt.addHistory(currentText.trim());
        tuiPrompt.addHistory('');
      }

      const updatedUsage = agent.getContextUsage();
      const updatedBar = agent.pool.getStatusBarSecondLine(process.stdout.columns || 80);
      tuiPrompt.updateState(
        agent.securityMode,
        agent.activeModel,
        agent.isWorkspaceTrusted,
        agent.thinkingEffort,
        updatedUsage.display,
        updatedBar
      );
      tuiPrompt.renderBox('', 0, 0);
    } catch (err: any) {
      tuiPrompt.stopSpinner();
      tuiPrompt.clearLiveLines();
      tuiPrompt.addHistory(chalk.red(`Execution Error: ${err.message || String(err)}`));
      tuiPrompt.addHistory('');
      tuiPrompt.renderBox('', 0, 0);
    }
  }
}

async function handleSlashCommand(
  cmd: string,
  arg: string,
  agent: QingmeiAgent,
  tuiPrompt: TuiPrompt
): Promise<string | void> {
  switch (cmd) {
    case 'help': {
      tuiPrompt.addHistory([
        chalk.bold('Available Slash Commands:'),
        `  ${chalk.cyan('/new [name]')}       - Create and switch to a new session`,
        `  ${chalk.cyan('/switch [id]')}     - Switch active session (or press Tab on empty input)`,
        `  ${chalk.cyan('/sessions')}        - List all open sessions and saved snapshots`,
        `  ${chalk.cyan('/rename [name]')}   - Rename current active session`,
        `  ${chalk.cyan('/close [id]')}      - Close current or specified session`,
        `  ${chalk.cyan('/save [name]')}     - Save session snapshot to disk`,
        `  ${chalk.cyan('/resume [id]')}     - Resume a saved snapshot from disk`,
        `  ${chalk.cyan('/delete [id]')}     - Delete a saved snapshot from disk`,
        `  ${chalk.cyan('/export [id]')}     - Export session to Markdown report`,
        `  ${chalk.cyan('/mode [mode]')}      - Switch mode: interactive, auto, readonly, chat`,
        `  ${chalk.cyan('/model [name]')}     - Switch AI model & provider`,
        `  ${chalk.cyan('/effort [level]')}   - Set reasoning effort: off, low, medium, high`,
        `  ${chalk.cyan('/skills')}           - View and toggle active skills`,
        `  ${chalk.cyan('/mcp')}              - Check MCP server connections and tools`,
        `  ${chalk.cyan('/trust [path]')}     - Trust current workspace (enable full tools)`,
        `  ${chalk.cyan('/untrust [path]')}   - Untrust workspace (switch to restricted mode)`,
        `  ${chalk.cyan('/compact')}          - Compact and optimize context memory`,
        `  ${chalk.cyan('/clear')}            - Clear screen viewport (retains session memory)`,
        `  ${chalk.cyan('/config')}           - Show current configuration`,
        `  ${chalk.cyan('/help')}             - Show this help message`,
        `  ${chalk.cyan('/exit')} / ${chalk.cyan('/quit')}     - Exit REPL (warns if tasks running)`,
        '',
      ]);
      break;
    }

    case 'new': {
      await handleNewSession(arg, agent, tuiPrompt);
      break;
    }

    case 'switch': {
      await handleSwitchSession(arg, agent, tuiPrompt);
      break;
    }

    case 'sessions': {
      await handleListSessions(agent, tuiPrompt);
      break;
    }

    case 'rename': {
      await handleRenameSession(arg, agent, tuiPrompt);
      break;
    }

    case 'close': {
      await handleCloseSession(arg, agent, tuiPrompt);
      break;
    }

    case 'save': {
      await handleSaveSession(arg, agent, tuiPrompt);
      break;
    }

    case 'resume': {
      await handleResumeSession(arg, agent, tuiPrompt);
      break;
    }

    case 'delete': {
      await handleDeleteSession(arg, agent, tuiPrompt);
      break;
    }

    case 'export': {
      await handleExportSession(arg, agent, tuiPrompt);
      break;
    }

    case 'session': {
      const parts = arg.trim().split(/\s+/).filter(Boolean);
      const sub = parts[0]?.toLowerCase();
      const subArg = parts.slice(1).join(' ');

      if (!sub || sub === 'list') {
        await handleListSessions(agent, tuiPrompt);
      } else if (sub === 'new') {
        await handleNewSession(subArg, agent, tuiPrompt);
      } else if (sub === 'switch') {
        await handleSwitchSession(subArg, agent, tuiPrompt);
      } else if (sub === 'rename') {
        await handleRenameSession(subArg, agent, tuiPrompt);
      } else if (sub === 'close') {
        await handleCloseSession(subArg, agent, tuiPrompt);
      } else if (sub === 'save') {
        await handleSaveSession(subArg, agent, tuiPrompt);
      } else if (sub === 'resume') {
        await handleResumeSession(subArg, agent, tuiPrompt);
      } else if (sub === 'delete') {
        await handleDeleteSession(subArg, agent, tuiPrompt);
      } else if (sub === 'export') {
        await handleExportSession(subArg, agent, tuiPrompt);
      } else {
        tuiPrompt.addHistory(chalk.yellow(`Unknown /session subcommand: "${sub}". Available: new, switch, list, rename, close, save, resume, delete, export`));
        tuiPrompt.addHistory('');
      }
      break;
    }

    case 'effort': {
      const validEfforts: ThinkingEffort[] = ['off', 'low', 'medium', 'high'];
      let targetEffort = arg.toLowerCase().trim();
      if (targetEffort === 'med') targetEffort = 'medium';

      if (targetEffort && validEfforts.includes(targetEffort as ThinkingEffort)) {
        const effort = targetEffort as ThinkingEffort;
        agent.setThinkingEffort(effort);
        saveConfig({ thinkingEffort: effort });
        tuiPrompt.updateState(
          agent.securityMode,
          agent.activeModel,
          agent.isWorkspaceTrusted,
          effort,
          agent.getContextUsage().display
        );
        tuiPrompt.addHistory(chalk.green(`✓ Switched reasoning effort to [${effort}]`));
        tuiPrompt.addHistory('');
        break;
      }

      // Native centered modal picker
      const choice = await tuiPrompt.selectModal({
        title: 'Select Reasoning / Thinking Effort',
        initialValue: agent.thinkingEffort,
        options: [
          {
            value: 'off',
            label: '[off] - Disable thinking',
            hint: 'Fastest response, zero reasoning token overhead',
          },
          {
            value: 'low',
            label: '[low] - Lightweight thinking',
            hint: 'Fast & low latency (~1k tokens)',
          },
          {
            value: 'medium',
            label: '[medium] - Balanced thinking',
            hint: 'Balanced depth & latency (~8k tokens)',
          },
          {
            value: 'high',
            label: '[high] - Deep reasoning',
            hint: 'Maximum reasoning power (~32k tokens)',
          },
        ],
      });

      if (choice) {
        const effort = choice as ThinkingEffort;
        agent.setThinkingEffort(effort);
        saveConfig({ thinkingEffort: effort });
        tuiPrompt.updateState(
          agent.securityMode,
          agent.activeModel,
          agent.isWorkspaceTrusted,
          effort,
          agent.getContextUsage().display
        );
        tuiPrompt.addHistory(chalk.green(`✓ Switched reasoning effort to [${effort}]`));
        tuiPrompt.addHistory('');
      }
      break;
    }

    case 'mode': {
      const validModes: SecurityMode[] = ['interactive', 'auto', 'readonly', 'chat'];
      if (arg && validModes.includes(arg as SecurityMode)) {
        agent.setSecurityMode(arg as SecurityMode);
        saveConfig({ securityMode: arg as SecurityMode });
        tuiPrompt.addHistory(chalk.green(`✓ Switched security mode to [${arg}]`));
        tuiPrompt.addHistory('');
      } else {
        const selected = (await tuiPrompt.selectModal({
          title: 'Select Execution Mode',
          initialValue: agent.securityMode,
          options: [
            { value: 'interactive', label: '[interactive] - Balanced (confirm mutating actions)' },
            { value: 'auto', label: '[auto] - Autonomous (auto-approve all tools)' },
            { value: 'readonly', label: '[readonly] - Read-only analysis (prohibit write/exec)' },
            { value: 'chat', label: '[chat] - Pure chat (zero tool overhead, fast response)' },
          ],
        })) as SecurityMode | null;

        if (selected) {
          agent.setSecurityMode(selected);
          saveConfig({ securityMode: selected });
          tuiPrompt.addHistory(chalk.green(`✓ Switched security mode to [${selected}]`));
          tuiPrompt.addHistory('');
        }
      }
      break;
    }

    case 'model': {
      if (arg) {
        const config = loadConfig();
        const found = getModelMetadata(arg, undefined, config);
        const targetProvider = found.provider || agent.activeModel.provider || config.activeProvider;
        agent.setModel(arg, targetProvider);
        saveConfig({ activeModel: arg, activeProvider: targetProvider });
        tuiPrompt.addHistory(chalk.green(`✓ Switched model to [${arg}] (${targetProvider})`));
        tuiPrompt.addHistory('');
      } else {
        const config = loadConfig();
        const currentProvider = config.activeProvider;

        // Step 1: Select Provider
        const providerOptions = SUPPORTED_PROVIDERS.map((pDef) => {
          const isCurrent = pDef.id === currentProvider;
          const isConfigured = Boolean(config.providers[pDef.id]?.apiKey || !pDef.requiresApiKey);
          const status = isConfigured ? chalk.green('configured') : chalk.gray('unconfigured');
          const currentBadge = isCurrent ? chalk.cyanBright(' (current)') : '';
          const tag1M = pDef.is1MSupported ? chalk.yellowBright(' [1M]') : '';
          return {
            value: pDef.id,
            label: `${pDef.name}${currentBadge}`,
            hint: `${tag1M} ${status}`.trim(),
          };
        });

        const selectedProvider = await tuiPrompt.selectModal({
          title: 'Select AI Model Provider',
          options: providerOptions,
          initialValue: currentProvider,
        });

        if (!selectedProvider) {
          break;
        }

        const pDef = getProviderDefinition(selectedProvider);
        let provConf = config.providers[selectedProvider] || {};
        let apiKey = provConf.apiKey;

        if (pDef?.requiresApiKey && !apiKey) {
          const keyInput = await tuiPrompt.textModal({
            title: `Enter API Key for ${pDef.name}`,
            isPassword: true,
          });

          if (!keyInput) {
            break;
          }

          apiKey = keyInput.trim();
          saveConfig({
            providers: {
              [selectedProvider]: {
                apiKey,
                baseUrl: pDef.defaultBaseUrl,
              },
            },
          });
        }

        // Step 2: Select Model
        const providerModels = getProviderModels(selectedProvider, config);

        const modelChoices: Array<{ value: string; label: string; hint?: string }> = providerModels.map((m) => {
          const badge = getContextDisplayBadge(m);
          const tag = badge
            ? m.is1MContext
              ? chalk.yellowBright(`[${badge}]`)
              : chalk.dim(`[${badge}]`)
            : '';
          const reasoningTag = m.supportsReasoning ? chalk.magenta(' [reasoning]') : '';
          const toolsTag = m.supportsTools ? chalk.blue(' [tools]') : '';
          const hintParts = [tag, reasoningTag, toolsTag].filter(Boolean);
          return {
            value: m.id,
            label: m.name || m.id,
            hint: hintParts.join('').trim() || undefined,
          };
        });

        let selectedModel: string | null = null;

        if (modelChoices.length > 0) {
          selectedModel = await tuiPrompt.selectModal({
            title: `Select Model for ${pDef?.name || selectedProvider}`,
            options: modelChoices,
            initialValue: modelChoices[0]?.value,
          });

          if (!selectedModel) {
            break;
          }
        } else {
          const textInput = await tuiPrompt.textModal({
            title: `Enter Model ID for ${pDef?.name || selectedProvider}`,
            placeholder: 'e.g. gpt-4o or claude-3-5-sonnet',
          });

          if (!textInput) {
            break;
          }
          selectedModel = textInput.trim();
        }

        const modelsToSave = providerModels.map((m) => ({
          id: m.id,
          name: m.name || m.id,
          context: m.context || (m.is1MContext ? '1M' : `${Math.round(m.contextWindow / 1000)}k`),
          contextWindow: m.contextWindow,
          is1MContext: m.is1MContext,
          supportsTools: m.supportsTools,
          supportsReasoning: m.supportsReasoning,
        }));

        if (!modelsToSave.some((m) => m.id === selectedModel)) {
          const meta = parseModelMetadataFromId(selectedModel, selectedProvider);
          modelsToSave.push({
            id: selectedModel,
            name: selectedModel,
            context: meta.context || (meta.is1MContext ? '1M' : `${Math.round(meta.contextWindow / 1000)}k`),
            contextWindow: meta.contextWindow,
            is1MContext: meta.is1MContext,
            supportsTools: meta.supportsTools,
            supportsReasoning: meta.supportsReasoning,
          });
        }

        // Save and activate
        saveConfig({
          activeProvider: selectedProvider,
          activeModel: selectedModel,
          providers: {
            [selectedProvider]: {
              apiKey: apiKey || provConf.apiKey,
              defaultModel: selectedModel,
              baseUrl: provConf.baseUrl || pDef?.defaultBaseUrl,
              models: modelsToSave,
            },
          },
        });

        agent.setModel(selectedModel, selectedProvider);
        const updatedConf = loadConfig();
        const updatedPConf = updatedConf.providers[selectedProvider] || {};
        agent.setLLMClient(
          new LLMClient({
            apiKey: updatedPConf.apiKey || '',
            baseUrl: updatedPConf.baseUrl || pDef?.defaultBaseUrl || 'https://api.openai.com/v1',
            defaultModel: selectedModel,
            provider: selectedProvider,
          })
        );

        tuiPrompt.addHistory(chalk.green(`✓ Switched model to [${selectedModel}] (${selectedProvider})`));
        tuiPrompt.addHistory('');
        clearTerminal();
      }
      break;
    }

    case 'skills': {
      const allSkills = agent.skillManager.getAllSkills();
      if (allSkills.length === 0) {
        tuiPrompt.addHistory(chalk.gray('No skills found in ~/.qingmei/skills'));
        tuiPrompt.addHistory('');
        break;
      }

      const selected = (await p.multiselect({
        message: 'Toggle active skills:',
        options: allSkills.map((s) => ({
          value: s.metadata.name,
          label: `${s.metadata.name} (${s.source})`,
          hint: s.metadata.description,
        })),
        initialValues: agent.skillManager.getActiveSkills().map((s) => s.metadata.name),
      })) as string[];

      if (!p.isCancel(selected)) {
        const selectedSet = new Set(selected);
        for (const s of allSkills) {
          if (selectedSet.has(s.metadata.name)) {
            agent.skillManager.enableSkill(s.metadata.name);
          } else {
            agent.skillManager.disableSkill(s.metadata.name);
          }
        }
        tuiPrompt.addHistory(chalk.green(`✓ Updated active skills: ${Array.from(selectedSet).join(', ') || 'none'}`));
        tuiPrompt.addHistory('');
      }
      clearTerminal();
      break;
    }

    case 'mcp': {
      const infos = await agent.mcpManager.getServerInfos();
      const mcpLines = [chalk.bold('MCP Servers:')];
      if (infos.length === 0) {
        mcpLines.push(chalk.gray('  No MCP servers configured in ~/.qingmei/mcp.json'));
      } else {
        for (const s of infos) {
          const lat = s.latencyMs ? ` (${s.latencyMs}ms)` : '';
          mcpLines.push(`  * ${s.name} [${s.transportType}] [${s.status}]${lat} - ${s.toolCount} tools`);
        }
      }
      mcpLines.push('');
      tuiPrompt.addHistory(mcpLines);
      break;
    }

    case 'trust': {
      const targetDir = arg ? path.resolve(arg) : agent.workingDirectory;
      addTrustedWorkspace(targetDir);
      agent.setWorkspaceTrusted(true);
      const conf = loadConfig();
      agent.setSecurityMode(conf.securityMode || 'interactive');
      tuiPrompt.updateState(
        agent.securityMode,
        agent.activeModel,
        true,
        agent.thinkingEffort,
        agent.getContextUsage().display
      );
      tuiPrompt.addHistory(chalk.green(`✓ Trusted workspace: ${targetDir} (full tools enabled in [${agent.securityMode}] mode)`));
      tuiPrompt.addHistory('');
      clearTerminal();
      break;
    }

    case 'untrust': {
      const targetDir = arg ? path.resolve(arg) : agent.workingDirectory;
      removeTrustedWorkspace(targetDir);
      agent.setWorkspaceTrusted(false);
      agent.setSecurityMode('readonly');
      tuiPrompt.updateState(
        agent.securityMode,
        agent.activeModel,
        false,
        agent.thinkingEffort,
        agent.getContextUsage().display
      );
      tuiPrompt.addHistory(chalk.yellow(`! Untrusted workspace: ${targetDir} (switched to restricted [readonly] mode)`));
      tuiPrompt.addHistory('');
      clearTerminal();
      break;
    }

    case 'compact': {
      const result = agent.compactSession();
      const currentUsage = agent.getContextUsage();
      tuiPrompt.updateState(
        agent.securityMode,
        agent.activeModel,
        agent.isWorkspaceTrusted,
        agent.thinkingEffort,
        currentUsage.display
      );
      if (result.summarizedMessagesCount > 0 || result.foldedToolOutputsCount > 0) {
        tuiPrompt.addHistory(
          chalk.green(`⚡ Context compacted: saved ~${result.savedTokens} tokens (${result.summarizedMessagesCount} messages summarized, ${result.foldedToolOutputsCount} tool outputs folded).`)
        );
      } else {
        tuiPrompt.addHistory(
          chalk.cyan(`✓ Context is already compact and optimized (Usage: ${currentUsage.display}).`)
        );
      }
      tuiPrompt.addHistory('');
      break;
    }

    case 'clear': {
      clearTerminal();
      tuiPrompt.clearHistory();
      break;
    }

    case 'config': {
      if (arg === 'edit') {
        openConfigFileInEditor();
        const reloaded = loadConfig();
        agent.setModel(reloaded.activeModel, reloaded.activeProvider);
        const pConf = reloaded.providers[reloaded.activeProvider] || {};
        agent.setLLMClient(
          new LLMClient({
            apiKey: pConf.apiKey || '',
            baseUrl: pConf.baseUrl || 'https://api.openai.com/v1',
            defaultModel: reloaded.activeModel,
            provider: reloaded.activeProvider,
          })
        );
        tuiPrompt.addHistory(chalk.green(`✓ Reloaded configuration (~/.qingmei/config.json)`));
        tuiPrompt.addHistory('');
        clearTerminal();
        break;
      }

      const conf = loadConfig();
      tuiPrompt.addHistory([
        chalk.bold('Qingmei Global Configuration:'),
        chalk.dim(`Config file: ${CONFIG_PATH}`),
        `  Active Provider: ${chalk.cyan(conf.activeProvider)}`,
        `  Active Model:    ${chalk.cyan(conf.activeModel)}`,
        `  Security Mode:   ${chalk.cyan(conf.securityMode)}`,
        chalk.dim('  Tip: Use "/config edit" to edit config.json in your editor.'),
        '',
      ]);
      break;
    }

    case 'exit':
    case 'quit': {
      const canExit = await handleQuitWithRunningGuard(agent, tuiPrompt);
      if (canExit) {
        return 'exit';
      }
      break;
    }

    default:
      tuiPrompt.addHistory(chalk.yellow(`Unknown command: /${cmd}. Type /help for available commands.`));
      tuiPrompt.addHistory('');
      break;
  }
}
