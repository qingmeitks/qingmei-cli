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
import { SessionManager } from '../core/session.js';
import { TuiPrompt } from './ui/prompt.js';
import { TerminalRenderer } from './ui/renderer.js';
import { SecurityMode, ModelMetadata, QingmeiConfig, ProviderConfig, ModelConfig, ThinkingEffort } from '../config/types.js';
import { SUPPORTED_PROVIDERS, CONFIG_PATH } from '../config/defaults.js';
import { isWorkspaceTrusted, addTrustedWorkspace, removeTrustedWorkspace } from '../core/security/trust.js';
import { expandMentions } from '../core/context/mention.js';


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
    p.intro(chalk.bold.yellow('🛡️ Workspace Trust Required'));
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
  const sessionManager = new SessionManager();

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
    sessionManager,
  });
  agent.dispatcher.registry = toolRegistry;


  const initialUsage = agent.getContextUsage();
  const tuiPrompt = new TuiPrompt({
    mode: agent.securityMode,
    model: agent.activeModel,
    cwd: agent.workingDirectory,
    isWorkspaceTrusted: agent.isWorkspaceTrusted,
    thinkingEffort: agent.thinkingEffort,
    contextUsage: initialUsage.display,
  });

  // 4. Main REPL loop (Clear terminal before rendering the pristine boxed TUI)
  clearTerminal();
  while (true) {
    const currentUsage = agent.getContextUsage();
    tuiPrompt.updateState(
      agent.securityMode,
      agent.activeModel,
      agent.isWorkspaceTrusted,
      agent.thinkingEffort,
      currentUsage.display
    );

    const input = await tuiPrompt.readLine();



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
      tuiPrompt.updateState(
        agent.securityMode,
        agent.activeModel,
        agent.isWorkspaceTrusted,
        agent.thinkingEffort,
        updatedUsage.display
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
        `  ${chalk.cyan('/mode [mode]')}    - Switch mode: interactive, auto, readonly, chat`,
        `  ${chalk.cyan('/model [name]')}   - Switch AI model & provider`,
        `  ${chalk.cyan('/effort [level]')} - Set reasoning effort: off, low, medium, high`,
        `  ${chalk.cyan('/skills')}         - View and toggle active skills`,
        `  ${chalk.cyan('/mcp')}            - Check MCP server connections and tools`,
        `  ${chalk.cyan('/trust [path]')}   - Trust current or specified workspace (enable mutating tools)`,
        `  ${chalk.cyan('/untrust [path]')} - Untrust current or specified workspace (switch to restricted mode)`,
        `  ${chalk.cyan('/compact')}        - Compact and optimize context memory (fold tool logs & summarize)`,
        `  ${chalk.cyan('/session')}        - Session management: -l (list), -s (save), -r (resume), -d (delete), -e (export)`,
        `  ${chalk.cyan('/clear')}          - Clear screen and reset conversation memory`,
        `  ${chalk.cyan('/config')}         - Show current configuration`,
        `  ${chalk.cyan('/help')}           - Show this help message`,
        `  ${chalk.cyan('/exit')} / ${chalk.cyan('/quit')}   - Exit REPL`,
        '',
      ]);
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
          const status = isConfigured ? chalk.green('✓ configured') : chalk.gray('unconfigured');
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

        // Prompt for API key if required and not configured
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

        // Step 2: Select Model from config (Preset models or manual input)
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
      agent.session.clear();
      tuiPrompt.clearHistory();
      tuiPrompt.addHistory(chalk.green('✓ Session reset. Starting fresh conversation.'));
      tuiPrompt.addHistory('');
      break;
    }


    case 'session': {
      const parts = arg.trim().split(/\s+/).filter(Boolean);
      const sub = parts[0]?.toLowerCase();
      const subArg = parts.slice(1).join(' ');

      // 1. /session list / -l
      if (!sub || sub === 'list' || sub === '-l') {
        const sessions = agent.listSessions();
        if (sessions.length === 0) {
          tuiPrompt.addHistory(chalk.dim('  No saved sessions found in this workspace.'));
          tuiPrompt.addHistory('');
          break;
        }

        const lines: string[] = [chalk.bold('Workspace Session History:')];
        for (const s of sessions) {
          const isActive = s.id === agent.session.sessionId ? chalk.green(' [ACTIVE]') : '';
          const nameTag = s.name ? chalk.cyan(`[${s.name}] `) : '';
          const dateStr = new Date(s.updatedAt || s.createdAt).toLocaleString();
          const stats = chalk.dim(`(${s.messageCount} msgs, ~${s.usedTokens} tokens, ${dateStr})`);
          lines.push(`  * ${chalk.yellow(s.id)} ${nameTag}${isActive} ${stats}`);
          if (s.preview) {
            lines.push(chalk.dim(`    "${s.preview}"`));
          }
        }
        lines.push('');
        lines.push(chalk.dim('  Tip: Use "/session -r <id>" to resume, "/session -s <name>" to save, or "/session -d <id>" to delete.'));
        lines.push('');
        tuiPrompt.addHistory(lines);
        break;
      }

      // 2. /session save / -s [name]
      if (sub === 'save' || sub === '-s') {
        let saveName = subArg;
        if (!saveName) {
          const nameInput = await tuiPrompt.textModal({
            title: 'Save Session Snapshot',
            placeholder: 'Enter snapshot name (optional)',
          });
          if (nameInput?.trim()) {
            saveName = nameInput.trim();
          }
        }
        const snapshot = agent.saveActiveSession(saveName || undefined);
        const nameLabel = snapshot.name ? ` [${snapshot.name}]` : '';
        tuiPrompt.addHistory(chalk.green(`✓ Session saved successfully:${nameLabel} (ID: ${snapshot.id})`));
        tuiPrompt.addHistory('');
        break;
      }

      // 3. /session resume / -r [session-id]
      if (sub === 'resume' || sub === '-r') {
        let targetId = subArg;
        const allSessions = agent.listSessions();

        if (!targetId) {
          if (allSessions.length === 0) {
            tuiPrompt.addHistory(chalk.yellow('! No previous sessions found to resume.'));
            tuiPrompt.addHistory('');
            break;
          }

          const options = allSessions.map((s) => {
            const dateStr = new Date(s.updatedAt || s.createdAt).toLocaleString();
            const tag = s.name ? `[${s.name}] ` : '';
            return {
              value: s.id,
              label: `${tag}${s.id} (${dateStr})`,
              hint: s.preview ? `"${s.preview.slice(0, 40)}"` : `${s.messageCount} msgs`,
            };
          });

          const choice = await tuiPrompt.selectModal({
            title: 'Select Session to Resume',
            options,
          });

          if (!choice) {
            break;
          }
          targetId = choice;
        }

        const success = agent.resumeSession(targetId);
        if (success) {
          const currentUsage = agent.getContextUsage();
          tuiPrompt.updateState(
            agent.securityMode,
            agent.activeModel,
            agent.isWorkspaceTrusted,
            agent.thinkingEffort,
            currentUsage.display
          );

          tuiPrompt.clearHistory();
          const nameLabel = agent.session.sessionName ? ` [${agent.session.sessionName}]` : '';
          tuiPrompt.addHistory(chalk.green(`✓ Resumed session:${nameLabel} (ID: ${agent.session.sessionId}, ${agent.session.messages.length} messages)`));
          tuiPrompt.addHistory('');

          // Re-populate visible history with past dialogue
          for (const m of agent.session.messages) {
            if (m.role === 'user' && m.content) {
              tuiPrompt.addHistory(`${chalk.cyan('> ')}${chalk.bold(m.content)}`);
            } else if (m.role === 'assistant' && m.content) {
              tuiPrompt.addHistory(m.content);
              tuiPrompt.addHistory('');
            }
          }
        } else {
          tuiPrompt.addHistory(chalk.red(`✗ Could not find session "${targetId}". Use "/session -l" to list available sessions.`));
          tuiPrompt.addHistory('');
        }
        break;
      }

      // 4. /session delete / -d [session-id | all]
      if (sub === 'delete' || sub === '-d') {
        let targetId = subArg;
        const allSessions = agent.listSessions();

        if (allSessions.length === 0) {
          tuiPrompt.addHistory(chalk.dim('  No sessions found to delete.'));
          tuiPrompt.addHistory('');
          break;
        }

        if (targetId === 'all' || targetId === '--all') {
          const confirmed = await tuiPrompt.confirmModal({
            title: 'Clear All Workspace Sessions',
            message: `Are you sure you want to delete all ${allSessions.length} session snapshots?`,
            initialValue: false,
          });
          if (confirmed) {
            const count = agent.deleteAllSessions();
            tuiPrompt.addHistory(chalk.green(`✓ Successfully deleted all ${count} sessions for this workspace.`));
            tuiPrompt.addHistory('');
          }
          break;
        }

        if (!targetId) {
          const options = allSessions.map((s) => {
            const dateStr = new Date(s.updatedAt || s.createdAt).toLocaleString();
            const tag = s.name ? `[${s.name}] ` : '';
            return {
              value: s.id,
              label: `${tag}${s.id} (${dateStr})`,
              hint: s.preview ? `"${s.preview.slice(0, 36)}"` : `${s.messageCount} msgs`,
            };
          });

          // Add Delete All option
          options.unshift({
            value: '__ALL__',
            label: chalk.redBright('🗑️  [Clear All Sessions]'),
            hint: `Permanently delete all ${allSessions.length} files`,
          });

          const choice = await tuiPrompt.selectModal({
            title: 'Select Session to Delete',
            options,
          });

          if (!choice) {
            break;
          }
          targetId = choice;
        }

        if (targetId === '__ALL__') {
          const confirmed = await tuiPrompt.confirmModal({
            title: 'Clear All Workspace Sessions',
            message: `Are you sure you want to delete all ${allSessions.length} session snapshots?`,
            initialValue: false,
          });
          if (confirmed) {
            const count = agent.deleteAllSessions();
            tuiPrompt.addHistory(chalk.green(`✓ Successfully deleted all ${count} sessions for this workspace.`));
            tuiPrompt.addHistory('');
          }
          break;
        }

        const success = agent.deleteSession(targetId);
        if (success) {
          tuiPrompt.addHistory(chalk.green(`✓ Deleted session: ${targetId}`));
        } else {
          tuiPrompt.addHistory(chalk.red(`✗ Could not delete session "${targetId}".`));
        }
        tuiPrompt.addHistory('');
        break;
      }



      // 5. /session export / -e [session-id] [path]
      if (sub === 'export' || sub === '-e') {
        const exportArgs = parts.slice(1);
        let targetSessionId: string | undefined;
        let targetPath: string | undefined;

        if (exportArgs.length === 1) {
          const single = exportArgs[0];
          if (single.includes('/') || single.includes('\\') || single.endsWith('.md') || single.startsWith('.')) {
            targetPath = single;
          } else {
            targetSessionId = single;
          }
        } else if (exportArgs.length >= 2) {
          targetSessionId = exportArgs[0];
          targetPath = exportArgs[1];
        }

        try {
          const outPath = agent.exportSession(targetSessionId, targetPath);
          tuiPrompt.addHistory(chalk.green(`✓ Session exported to: ${outPath}`));
        } catch (err: any) {
          tuiPrompt.addHistory(chalk.red(`✗ Export failed: ${err.message || String(err)}`));
        }
        tuiPrompt.addHistory('');
        break;
      }

      tuiPrompt.addHistory(chalk.yellow(`Unknown /session subcommand: "${sub}". Available: -l (list), -s (save), -r (resume), -d (delete), -e (export)`));
      tuiPrompt.addHistory('');
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
    case 'quit':
      return 'exit';

    default:
      tuiPrompt.addHistory(chalk.yellow(`Unknown command: /${cmd}. Type /help for available commands.`));
      tuiPrompt.addHistory('');
      break;
  }
}
