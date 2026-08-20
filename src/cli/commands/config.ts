import * as p from '@clack/prompts';
import chalk from 'chalk';
import {
  loadConfig,
  saveConfig,
  getEffectiveProviderConfig,
  getProviderDefinition,
  getProviderModels,
  openConfigFileInEditor,
  getContextDisplayBadge,
} from '../../config/loader.js';

import {
  SUPPORTED_PROVIDERS,
  CONFIG_PATH,
} from '../../config/defaults.js';

import { LLMClient, parseModelMetadataFromId } from '../../core/llm/client.js';
import { QingmeiConfig } from '../../config/types.js';


export async function runConfigInitWizard(): Promise<QingmeiConfig> {
  p.intro(chalk.bold('qingmei configuration setup'));

  // 1. Select Provider
  const providerChoices = SUPPORTED_PROVIDERS.map((prov) => ({
    value: prov.id,
    label: prov.name,
    hint: prov.defaultBaseUrl,
  }));

  const provider = (await p.select({
    message: 'Select AI model provider:',
    options: providerChoices,
  })) as string;

  if (p.isCancel(provider)) {
    p.cancel('Configuration setup cancelled.');
    process.exit(0);
  }

  const def = getProviderDefinition(provider)!;
  let apiKey = '';
  let baseUrl = def.defaultBaseUrl;

  // 2. Input API Key (if required)
  if (def.requiresApiKey) {
    const existingConfig = getEffectiveProviderConfig(provider);
    const keyInput = await p.password({
      message: `Enter API Key for ${def.name}:`,
      mask: '*',
    });

    if (p.isCancel(keyInput)) {
      p.cancel('Configuration setup cancelled.');
      process.exit(0);
    }
    apiKey = (keyInput as string).trim() || existingConfig.apiKey || '';
  }

  // 3. Custom Base URL (if custom or user wants to override)
  if (provider === 'custom' || provider === 'ollama') {
    const urlInput = await p.text({
      message: 'Enter Base URL:',
      defaultValue: def.defaultBaseUrl,
      placeholder: def.defaultBaseUrl,
    });
    if (p.isCancel(urlInput)) {
      p.cancel('Configuration setup cancelled.');
      process.exit(0);
    }
    baseUrl = (urlInput as string).trim() || def.defaultBaseUrl;
  }

  // 4. Test Connection Probe
  const s = p.spinner();
  s.start('Verifying API connection...');

  const tempClient = new LLMClient({
    apiKey,
    baseUrl,
    defaultModel: 'dummy',
    provider,
  });

  const probe = await tempClient.probeConnection();
  if (probe.ok) {
    s.stop(`Connection successful (${probe.latencyMs}ms)`);
  } else {
    s.stop(chalk.yellow(`Connection check warning: ${probe.error || 'Check credentials'}`));
  }

  // 5. Select Model (Preset models if available, otherwise manual input)
  const configuredModels = getProviderModels(provider);

  const modelOptions: Array<{ value: string; label: string; hint?: string }> = configuredModels.map((m) => {
    const badge = getContextDisplayBadge(m);
    const tag = badge ? `[${badge}]` : '';
    const reasoningTag = m.supportsReasoning ? ' [reasoning]' : '';
    const toolsTag = m.supportsTools ? ' [tools]' : '';
    const hintParts = [tag, reasoningTag, toolsTag].filter(Boolean);
    return {
      value: m.id,
      label: m.name || m.id,
      hint: hintParts.join('').trim() || undefined,
    };
  });

  let selectedModel = '';

  if (modelOptions.length > 0) {
    const chosen = await p.select({
      message: 'Select default model:',
      options: modelOptions,
      initialValue: modelOptions[0]?.value,
    });

    if (p.isCancel(chosen)) {
      p.cancel('Configuration setup cancelled.');
      process.exit(0);
    }
    selectedModel = chosen as string;
  } else {
    const textInput = await p.text({
      message: 'Enter model name/ID:',
      placeholder: 'model-id',
      validate: (val) => (!val?.trim() ? 'Model ID cannot be empty' : undefined),
    });

    if (p.isCancel(textInput)) {
      p.cancel('Configuration setup cancelled.');
      process.exit(0);
    }
    selectedModel = (textInput as string).trim();
  }

  // Collect models to save into config.json
  const modelsToSave = configuredModels.map((m) => ({
    id: m.id,
    name: m.name || m.id,
    context: m.context || (m.is1MContext ? '1M' : `${Math.round(m.contextWindow / 1000)}k`),
    contextWindow: m.contextWindow,
    is1MContext: m.is1MContext,
    supportsTools: m.supportsTools,
    supportsReasoning: m.supportsReasoning,
  }));

  if (!modelsToSave.some((m) => m.id === selectedModel)) {
    const meta = parseModelMetadataFromId(selectedModel, provider);
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



  // 6. Save Configuration with discovered models
  const updated = saveConfig({
    activeProvider: provider,
    activeModel: selectedModel,
    providers: {
      [provider]: {
        apiKey: apiKey || undefined,
        baseUrl,
        defaultModel: selectedModel,
        models: modelsToSave,
      },
    },
  });

  p.outro(chalk.green(`Configuration saved to ${CONFIG_PATH}`));
  return updated;
}


export function printConfigList(): void {
  const config = loadConfig();
  console.log(chalk.bold('\nQingmei Global Configuration:'));
  console.log(chalk.dim(`Config file: ${CONFIG_PATH}\n`));
  console.log(`Active Provider: ${chalk.cyan(config.activeProvider)}`);
  console.log(`Active Model:    ${chalk.cyan(config.activeModel)}`);
  console.log(`Security Mode:   ${chalk.cyan(config.securityMode)}\n`);

  console.log(chalk.bold('Configured Providers:'));
  for (const [pId, pConf] of Object.entries(config.providers)) {
    const isCurrent = pId === config.activeProvider;
    const hasKey = pConf.apiKey ? chalk.green('configured') : chalk.gray('none');
    const maskKey = pConf.apiKey
      ? `${pConf.apiKey.slice(0, 4)}...${pConf.apiKey.slice(-3)}`
      : 'none';
    const prefix = isCurrent ? chalk.green('* ') : '  ';

    console.log(
      `${prefix}${chalk.bold(pId)}: ${pConf.baseUrl || 'default'} (key: ${maskKey}) [${hasKey}]`
    );
  }
  console.log();
}

export function configSet(key: string, value: string): void {
  const config = loadConfig();
  if (key === 'activeProvider') {
    config.activeProvider = value;
  } else if (key === 'activeModel') {
    config.activeModel = value;
  } else if (key === 'securityMode') {
    config.securityMode = value as any;
  } else if (key.startsWith('providers.')) {
    const parts = key.split('.');
    const pId = parts[1];
    const field = parts[2];
    if (pId && field) {
      if (!config.providers[pId]) {
        config.providers[pId] = {};
      }
      (config.providers[pId] as any)[field] = value;
    }
  } else {
    console.log(chalk.red(`Unknown config key: ${key}`));
    return;
  }

  saveConfig(config);
  console.log(chalk.green(`Updated ${key} = ${value}`));
}

export function configGet(key: string): void {
  const config = loadConfig();
  if (key === 'activeProvider') {
    console.log(config.activeProvider);
  } else if (key === 'activeModel') {
    console.log(config.activeModel);
  } else if (key === 'securityMode') {
    console.log(config.securityMode);
  } else if (key.startsWith('providers.')) {
    const parts = key.split('.');
    const pId = parts[1];
    const field = parts[2];
    console.log((config.providers[pId] as any)?.[field] || '');
  } else {
    console.log(chalk.red(`Unknown config key: ${key}`));
  }
}

export function configEdit(): void {
  const result = openConfigFileInEditor();
  if (result.success) {
    console.log(chalk.green(`Opened config file in editor (${result.editorName}): ${result.path}`));
  } else {
    console.log(chalk.yellow(`Config file is located at: ${result.path}`));
  }
}

