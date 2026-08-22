import chalk from 'chalk';
import { QingmeiAgent } from '../../core/agent.js';
import { TuiPrompt } from '../ui/prompt.js';
import { LLMClient } from '../../core/llm/client.js';
import {
  loadConfig,
  saveConfig,
  getProviderDefinition,
  getAvailableConfiguredProviders,
  setProviderApiKey,
  removeProviderApiKey,
  maskApiKey,
  getModelMetadata,
  getProviderModels,
  getContextDisplayBadge,
} from '../../config/loader.js';
import { SUPPORTED_PROVIDERS, DEFAULT_PRESET_CONFIG } from '../../config/defaults.js';

export async function handleKeyCommand(
  arg: string,
  agent: QingmeiAgent,
  tuiPrompt: TuiPrompt
): Promise<void> {
  const parts = arg.trim().split(/\s+/).filter(Boolean);

  // 1. Direct Remove: /key rm <provider> or /key delete <provider>
  if (parts[0] === 'rm' || parts[0] === 'delete' || parts[0] === 'remove') {
    const targetProv = parts[1]?.toLowerCase();
    if (!targetProv) {
      tuiPrompt.addHistory(chalk.yellow('Usage: /key rm <provider> (e.g. /key rm deepseek)'));
      tuiPrompt.addHistory('');
      return;
    }
    await handleRemoveKeyFlow(targetProv, agent, tuiPrompt);
    return;
  }

  // 2. Direct Update: /key <provider> <apiKey>
  if (parts.length >= 2) {
    const targetProv = parts[0].toLowerCase();
    const newKey = parts[1];
    await handleUpdateKeyFlow(targetProv, newKey, agent, tuiPrompt);
    return;
  }

  // 3. Provider single arg: /key <provider>
  if (parts.length === 1 && parts[0]) {
    const targetProv = parts[0].toLowerCase();
    const pDef = getProviderDefinition(targetProv);
    if (pDef) {
      await handleUpdateKeyFlow(targetProv, undefined, agent, tuiPrompt);
      return;
    }
  }

  // 4. Interactive Management Menu: /key
  await showKeyManagementMenu(agent, tuiPrompt);
}

export async function showKeyManagementMenu(
  agent: QingmeiAgent,
  tuiPrompt: TuiPrompt
): Promise<void> {
  const providers = getAvailableConfiguredProviders();
  const config = loadConfig();

  const options = providers.map((p) => {
    const isCurrent = p.id === config.activeProvider;
    const currentTag = isCurrent ? chalk.cyanBright(' (current)') : '';
    const statusTag = p.isConfigured ? chalk.green('[configured]') : chalk.gray('[unconfigured]');
    const keyPreview = p.isConfigured ? chalk.dim(` ${p.maskedKey}`) : '';

    return {
      value: p.id,
      label: `${p.name}${currentTag}`,
      hint: `${statusTag}${keyPreview}`,
    };
  });

  const selectedProviderId = await tuiPrompt.selectModal({
    title: 'API Key Management Center',
    options,
    initialValue: config.activeProvider,
  });

  if (!selectedProviderId) return;

  const pDef = getProviderDefinition(selectedProviderId);
  if (!pDef) return;

  const provInfo = providers.find((p) => p.id === selectedProviderId);
  const isConfigured = provInfo?.isConfigured;

  // Secondary Action Menu for selected provider
  const actionOptions = [];

  if (isConfigured) {
    actionOptions.push({
      value: 'update',
      label: 'Update API Key',
      hint: `Current: ${provInfo?.maskedKey}`,
    });
    actionOptions.push({
      value: 'test',
      label: 'Test Connection / Auth',
      hint: 'Probe connectivity with current key',
    });
    actionOptions.push({
      value: 'remove',
      label: chalk.redBright('Remove / Unbind API Key'),
      hint: 'Clear key from config',
    });
  } else {
    actionOptions.push({
      value: 'update',
      label: 'Set API Key',
      hint: 'Configure key for this provider',
    });
  }

  const action = await tuiPrompt.selectModal({
    title: `Manage API Key: ${pDef.name}`,
    options: actionOptions,
    initialValue: 'update',
  });

  if (!action) return;

  if (action === 'update') {
    await handleUpdateKeyFlow(selectedProviderId, undefined, agent, tuiPrompt);
  } else if (action === 'test') {
    await handleTestKeyFlow(selectedProviderId, provInfo?.apiKey || '', agent, tuiPrompt);
  } else if (action === 'remove') {
    await handleRemoveKeyFlow(selectedProviderId, agent, tuiPrompt);
  }
}

export async function handleTestKeyFlow(
  providerId: string,
  apiKey: string,
  agent: QingmeiAgent,
  tuiPrompt: TuiPrompt
): Promise<void> {
  const pDef = getProviderDefinition(providerId);
  const provName = pDef?.name || providerId;

  if (!apiKey) {
    tuiPrompt.addHistory(chalk.yellow(`! No API Key configured for ${provName}.`));
    tuiPrompt.addHistory('');
    return;
  }

  tuiPrompt.startSpinner(`Testing connection to ${provName}...`);
  const probeModel = DEFAULT_PRESET_CONFIG.providers[providerId]?.defaultModel || 'dummy';
  const res = await LLMClient.verifyApiKey(providerId, apiKey, pDef?.defaultBaseUrl, probeModel);
  tuiPrompt.stopSpinner();

  if (res.success) {
    tuiPrompt.addHistory(chalk.green(`✓ Connection verified successfully for ${provName} (${res.latencyMs}ms).`));
  } else {
    tuiPrompt.addHistory(chalk.red(`✗ Connection failed for ${provName}: ${res.error || 'Authentication error'}`));
  }
  tuiPrompt.addHistory('');
}

export async function handleUpdateKeyFlow(
  providerId: string,
  rawKey: string | undefined,
  agent: QingmeiAgent,
  tuiPrompt: TuiPrompt
): Promise<boolean> {
  const pDef = getProviderDefinition(providerId);
  const provName = pDef?.name || providerId;
  const config = loadConfig();
  const existingKey = config.providers[providerId]?.apiKey;

  let newKey = rawKey?.trim();

  // If key not passed directly, prompt user via text modal
  if (!newKey) {
    const masked = maskApiKey(existingKey);
    const input = await tuiPrompt.textModal({
      title: `Enter API Key for ${provName}`,
      placeholder: existingKey ? `Current: ${masked}` : 'Paste API Key here',
      isPassword: true,
    });

    if (!input || !input.trim()) {
      tuiPrompt.addHistory(chalk.dim(`Cancelled API Key update for ${provName}.`));
      tuiPrompt.addHistory('');
      return false;
    }
    newKey = input.trim();
  }

  // 1. Lightweight Connection & Auth Probe
  tuiPrompt.startSpinner(`Verifying API Key connectivity for ${provName}...`);
  const probeModel = DEFAULT_PRESET_CONFIG.providers[providerId]?.defaultModel || 'dummy';
  const verifyResult = await LLMClient.verifyApiKey(
    providerId,
    newKey,
    config.providers[providerId]?.baseUrl || pDef?.defaultBaseUrl,
    probeModel
  );
  tuiPrompt.stopSpinner();

  // 2. Handle Verification Failure (Diagnostics & Action Suggestions)
  if (!verifyResult.success) {
    const errorMsg = verifyResult.error || 'Authentication failed';
    const choice = await tuiPrompt.selectModal({
      title: `API Key Verification Failed (${provName})`,
      options: [
        {
          value: 'reenter',
          label: '[ Re-enter API Key ]',
          hint: 'Try entering or pasting the key again',
        },
        {
          value: 'save_anyway',
          label: '[ Save Anyway ]',
          hint: 'Persist key regardless of verification failure',
        },
        {
          value: 'cancel',
          label: '[ Cancel ]',
          hint: 'Abort without saving',
        },
      ],
      initialValue: 'reenter',
    });

    if (choice === 'reenter') {
      return handleUpdateKeyFlow(providerId, undefined, agent, tuiPrompt);
    }
    if (choice !== 'save_anyway') {
      tuiPrompt.addHistory(chalk.yellow(`! Cancelled API Key update for ${provName}.`));
      tuiPrompt.addHistory('');
      return false;
    }
  }

  // 3. Persist Key in Config
  setProviderApiKey(providerId, newKey);
  const isCurrentActive = providerId === config.activeProvider || providerId === agent.activeModel.provider;

  // 4. Runtime Hot-Reloading or Switch Prompt
  if (isCurrentActive) {
    const updatedConf = loadConfig();
    const pConf = updatedConf.providers[providerId] || {};
    const reloadedClient = new LLMClient({
      apiKey: newKey,
      baseUrl: pConf.baseUrl || pDef?.defaultBaseUrl || 'https://api.openai.com/v1',
      defaultModel: agent.activeModel.id,
      provider: providerId,
    });

    agent.setLLMClient(reloadedClient);
    agent.pool.updateConfig({ llmClient: reloadedClient });

    tuiPrompt.addHistory(
      chalk.green(`✓ API Key updated & verified for ${provName} (active client hot-reloaded).`)
    );
    tuiPrompt.addHistory('');
    return true;
  }

  // Updated key for a non-active provider:
  // Directly ask whether to switch to default model, select a specific model, or keep current
  const defaultModelId = DEFAULT_PRESET_CONFIG.providers[providerId]?.defaultModel || config.providers[providerId]?.defaultModel || 'default';

  const switchChoice = await tuiPrompt.selectModal({
    title: `API Key Saved: ${provName}`,
    options: [
      {
        value: 'use_default',
        label: `Switch to ${provName} [${defaultModelId}]`,
        hint: 'Use default preset model',
      },
      {
        value: 'select_model',
        label: `Select specific model for ${provName}`,
        hint: 'Choose from available models list',
      },
      {
        value: 'stay',
        label: `Keep current model [${agent.activeModel.id}]`,
        hint: 'Do not switch active provider',
      },
    ],
    initialValue: 'use_default',
  });

  if (!switchChoice || switchChoice === 'stay') {
    tuiPrompt.addHistory(
      chalk.green(`✓ Saved API Key for ${provName}. Active model remains [${agent.activeModel.id}].`)
    );
    tuiPrompt.addHistory('');
    return true;
  }

  if (switchChoice === 'select_model') {
    await promptAndSetModel(providerId, agent, tuiPrompt);
    return true;
  }

  if (switchChoice === 'use_default') {
    applyModelSwitch(providerId, defaultModelId, newKey, agent, tuiPrompt);
    tuiPrompt.addHistory(
      chalk.green(`✓ Saved Key for ${provName} and switched active model to [${defaultModelId}].`)
    );
    tuiPrompt.addHistory('');
    return true;
  }

  return true;
}

export async function promptAndSetModel(
  providerId: string,
  agent: QingmeiAgent,
  tuiPrompt: TuiPrompt
): Promise<string | null> {
  const pDef = getProviderDefinition(providerId);
  const provName = pDef?.name || providerId;
  const config = loadConfig();
  const providerModels = getProviderModels(providerId, config);

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
      title: `Select Model for ${provName}`,
      options: modelChoices,
      initialValue: modelChoices[0]?.value,
    });
  } else {
    const textInput = await tuiPrompt.textModal({
      title: `Enter Model ID for ${provName}`,
      placeholder: 'e.g. gpt-4o or gemini-3.7-flash',
    });
    if (textInput) {
      selectedModel = textInput.trim();
    }
  }

  if (!selectedModel) {
    return null;
  }

  const updatedConf = loadConfig();
  const pConf = updatedConf.providers[providerId] || {};
  applyModelSwitch(providerId, selectedModel, pConf.apiKey || '', agent, tuiPrompt);
  tuiPrompt.addHistory(
    chalk.green(`✓ Switched model to [${selectedModel}] (${provName}).`)
  );
  tuiPrompt.addHistory('');
  return selectedModel;
}

export function applyModelSwitch(
  providerId: string,
  modelId: string,
  apiKey: string,
  agent: QingmeiAgent,
  tuiPrompt: TuiPrompt
): void {
  const pDef = getProviderDefinition(providerId);
  const config = loadConfig();
  const pConf = config.providers[providerId] || {};

  saveConfig({
    activeProvider: providerId,
    activeModel: modelId,
  });

  agent.setModel(modelId, providerId);
  const newClient = new LLMClient({
    apiKey: apiKey || pConf.apiKey || '',
    baseUrl: pConf.baseUrl || pDef?.defaultBaseUrl || 'https://api.openai.com/v1',
    defaultModel: modelId,
    provider: providerId,
  });

  agent.setLLMClient(newClient);
  agent.pool.updateConfig({
    activeModel: agent.activeModel,
    llmClient: newClient,
  });

  const currentUsage = agent.getContextUsage();
  const sessionBar = agent.pool.getStatusBarSecondLine(process.stdout.columns || 80);
  tuiPrompt.updateState(
    agent.securityMode,
    agent.activeModel,
    agent.isWorkspaceTrusted,
    agent.thinkingEffort,
    currentUsage.display,
    sessionBar
  );
}

export async function handleRemoveKeyFlow(
  providerId: string,
  agent: QingmeiAgent,
  tuiPrompt: TuiPrompt
): Promise<boolean> {
  const pDef = getProviderDefinition(providerId);
  const provName = pDef?.name || providerId;

  const confirmed = await tuiPrompt.confirmModal({
    title: `Remove API Key: ${provName}`,
    message: `Are you sure you want to remove and unbind the API Key for ${provName}?`,
    initialValue: false,
  });

  if (!confirmed) {
    tuiPrompt.addHistory(chalk.dim(`Cancelled removing API Key for ${provName}.`));
    tuiPrompt.addHistory('');
    return false;
  }

  // 1. Remove Key from config
  removeProviderApiKey(providerId);

  // 2. Trigger Post-RemoveKey Fallback Strategy
  await handlePostRemoveKeyFallback(providerId, agent, tuiPrompt);
  return true;
}

export async function handlePostRemoveKeyFallback(
  removedProvider: string,
  agent: QingmeiAgent,
  tuiPrompt: TuiPrompt
): Promise<void> {
  const pDef = getProviderDefinition(removedProvider);
  const provName = pDef?.name || removedProvider;
  const config = loadConfig();

  const isCurrentActive =
    removedProvider === config.activeProvider || removedProvider === agent.activeModel.provider;

  // Case 1: Removed a non-active provider's key
  if (!isCurrentActive) {
    tuiPrompt.addHistory(chalk.green(`✓ Removed API Key for ${provName}. Active model is unaffected.`));
    tuiPrompt.addHistory('');
    return;
  }

  // Case 2: Removed current active provider's key
  const available = getAvailableConfiguredProviders().filter(
    (p) => p.isConfigured && p.id !== removedProvider
  );

  if (available.length > 0) {
    // Other configured providers exist: prompt smart fallback
    const targetFallback = available[0];
    const fallbackModel = targetFallback.defaultModel || 'default';

    const switchChoice = await tuiPrompt.selectModal({
      title: `Active Provider Key Removed (${provName})`,
      options: [
        {
          value: 'auto_fallback',
          label: `Switch to ${targetFallback.name} [${fallbackModel}]`,
          hint: 'Recommended fallback',
        },
        {
          value: 'pick_other',
          label: 'Choose from other configured providers',
          hint: `${available.length} available`,
        },
      ],
      initialValue: 'auto_fallback',
    });

    let chosenProvider = targetFallback;
    let chosenModel = fallbackModel;

    if (switchChoice === 'pick_other') {
      const pick = await tuiPrompt.selectModal({
        title: 'Select Fallback AI Provider',
        options: available.map((a) => ({
          value: a.id,
          label: `${a.name} [${a.defaultModel || 'default'}]`,
        })),
        initialValue: available[0].id,
      });

      if (pick) {
        const found = available.find((a) => a.id === pick);
        if (found) {
          chosenProvider = found;
          chosenModel = found.defaultModel || 'default';
        }
      }
    }

    // Apply model switch
    saveConfig({
      activeProvider: chosenProvider.id,
      activeModel: chosenModel,
    });

    agent.setModel(chosenModel, chosenProvider.id);
    const updatedConf = loadConfig();
    const provConf = updatedConf.providers[chosenProvider.id] || {};
    const newClient = new LLMClient({
      apiKey: provConf.apiKey || chosenProvider.apiKey || '',
      baseUrl: provConf.baseUrl || 'https://api.openai.com/v1',
      defaultModel: chosenModel,
      provider: chosenProvider.id,
    });

    agent.setLLMClient(newClient);
    agent.pool.updateConfig({
      activeModel: agent.activeModel,
      llmClient: newClient,
    });

    const currentUsage = agent.getContextUsage();
    const sessionBar = agent.pool.getStatusBarSecondLine(process.stdout.columns || 80);
    tuiPrompt.updateState(
      agent.securityMode,
      agent.activeModel,
      agent.isWorkspaceTrusted,
      agent.thinkingEffort,
      currentUsage.display,
      sessionBar
    );

    tuiPrompt.addHistory(
      chalk.green(
        `✓ Removed API Key for ${provName}. Switched active model to [${chosenModel}] (${chosenProvider.name}).`
      )
    );
    tuiPrompt.addHistory('');
    return;
  }

  // Case 3: No configured providers remaining at all
  tuiPrompt.addHistory(
    chalk.yellow(`⚠️ Removed API Key for ${provName}. No configured AI providers remaining!`)
  );

  const recoveryAction = await tuiPrompt.selectModal({
    title: 'No Active AI Provider Configured',
    options: [
      {
        value: 'enter_key',
        label: `Configure a new API Key for ${provName}`,
        hint: 'Re-enter API key now',
      },
      {
        value: 'cancel',
        label: 'Continue in restricted/offline mode',
        hint: 'AI generation will require key setup',
      },
    ],
    initialValue: 'enter_key',
  });

  if (recoveryAction === 'enter_key') {
    await handleUpdateKeyFlow(removedProvider, undefined, agent, tuiPrompt);
  } else {
    tuiPrompt.addHistory(chalk.dim('Please run "/key" or "/model" to configure an AI provider before prompting.'));
    tuiPrompt.addHistory('');
  }
}
