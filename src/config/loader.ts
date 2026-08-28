import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  QingmeiConfig,
  ProviderConfig,
  SecurityMode,
  ModelMetadata,
  ModelConfig,
  QingmeiConfigSchema,
} from './types.js';
import {
  QINGMEI_HOME,
  CONFIG_PATH,
  MCP_CONFIG_PATH,
  SKILLS_DIR,
  SESSIONS_DIR,
  EXPORT_DIR,
  GLOBAL_INSTRUCTIONS_PATH,
  SUPPORTED_PROVIDERS,
  DEFAULT_PRESET_CONFIG,
  ProviderDefinition,
  getConfigPath,
  getMcpConfigPath,
  getQingmeiHome,
} from './defaults.js';
import { parseModelMetadataFromId } from '../core/llm/client.js';


export function ensureQingmeiEnvironment(): void {
  const homeDir = getQingmeiHome();
  const configPath = getConfigPath();
  const mcpPath = getMcpConfigPath();

  // 1. Create directory structure if missing
  if (!fs.existsSync(homeDir)) {
    fs.mkdirSync(homeDir, { recursive: true });
  }
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }

  // 2. Initialize default config.json with all preset providers and models if missing
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_PRESET_CONFIG, null, 2), 'utf-8');
  }

  // 3. Initialize default mcp.json if missing
  if (!fs.existsSync(mcpPath)) {
    const defaultMcpConfig = {
      $schema: 'https://qingmei.ai/schemas/mcp.json',
      mcpServers: {},
    };
    fs.writeFileSync(mcpPath, JSON.stringify(defaultMcpConfig, null, 2), 'utf-8');
  }

  // 4. Initialize default QINGMEI.md if missing
  if (!fs.existsSync(GLOBAL_INSTRUCTIONS_PATH)) {
    const defaultGlobalInstructions = `# Global User Directives (QINGMEI.md)

Write your personal preferences and global coding standards here:
- Prefer concise, truthful, and high-density explanations.
- Follow strict typing and clean architecture.
- Do not add unnecessary comments; explain only non-obvious logic.
`;
    fs.writeFileSync(GLOBAL_INSTRUCTIONS_PATH, defaultGlobalInstructions, 'utf-8');
  }
}

export const ensureQingmeiDirectories = ensureQingmeiEnvironment;

export function loadRawConfigFile(): QingmeiConfig | null {
  try {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) {
      return null;
    }
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(content);
    return QingmeiConfigSchema.parse(parsed);
  } catch {
    return null;
  }
}

export function openConfigFileInEditor(): { success: boolean; editorName: string; path: string } {
  ensureQingmeiEnvironment();
  const configPath = getConfigPath();
  const editor = process.env.EDITOR || process.env.VISUAL || (process.platform === 'darwin' ? 'open' : 'nano');
  try {
    if (editor === 'open') {
      spawnSync('open', ['-t', configPath], { stdio: 'inherit' });
    } else {
      spawnSync(editor, [configPath], { stdio: 'inherit' });
    }
    return { success: true, editorName: editor, path: configPath };
  } catch {
    return { success: false, editorName: editor, path: configPath };
  }
}

export function getProviderDefinition(providerId: string): ProviderDefinition | undefined {
  return SUPPORTED_PROVIDERS.find((p) => p.id === providerId);
}

export function getEffectiveProviderConfig(
  providerId: string,
  rawConfig?: QingmeiConfig | null
): ProviderConfig {
  const config = rawConfig ?? loadRawConfigFile();
  const fileProviderConfig = config?.providers?.[providerId] || {};
  const def = getProviderDefinition(providerId);
  const presetProv = DEFAULT_PRESET_CONFIG.providers[providerId] || {};

  let apiKey = fileProviderConfig.apiKey;
  if (def?.apiKeyEnvName && process.env[def.apiKeyEnvName]) {
    apiKey = process.env[def.apiKeyEnvName];
  }

  let baseUrl = fileProviderConfig.baseUrl;
  if (def?.baseUrlEnvName && process.env[def.baseUrlEnvName]) {
    baseUrl = process.env[def.baseUrlEnvName];
  }
  if (!baseUrl) {
    baseUrl = def?.defaultBaseUrl || presetProv.baseUrl;
  }

  let defaultModel = fileProviderConfig.defaultModel || presetProv.defaultModel || '';
  let models =
    fileProviderConfig.models && fileProviderConfig.models.length > 0
      ? fileProviderConfig.models
      : presetProv.models || [];

  return {
    apiKey,
    baseUrl: baseUrl || def?.defaultBaseUrl,
    defaultModel,
    models,
  };
}


export function loadConfig(): QingmeiConfig {
  ensureQingmeiEnvironment();
  const raw = loadRawConfigFile();

  // 1. Active Provider Resolution
  let activeProvider = raw?.activeProvider || DEFAULT_PRESET_CONFIG.activeProvider;
  if (process.env.QINGMEI_PROVIDER) {
    activeProvider = process.env.QINGMEI_PROVIDER;
  }

  // 2. Active Model Resolution
  let activeModel = raw?.activeModel || DEFAULT_PRESET_CONFIG.activeModel;
  if (process.env.QINGMEI_MODEL) {
    activeModel = process.env.QINGMEI_MODEL;
  }

  // 3. Security Mode Resolution
  let securityMode: SecurityMode = raw?.securityMode || 'interactive';
  if (process.env.QINGMEI_SECURITY_MODE) {
    const envMode = process.env.QINGMEI_SECURITY_MODE as SecurityMode;
    if (['interactive', 'auto', 'readonly', 'chat'].includes(envMode)) {
      securityMode = envMode;
    }
  }

  // 4. Thinking Effort Resolution
  const thinkingEffort = raw?.thinkingEffort || DEFAULT_PRESET_CONFIG.thinkingEffort || 'medium';

  // 5. Effective Providers dictionary
  const effectiveProviders: Record<string, ProviderConfig> = {};
  for (const p of SUPPORTED_PROVIDERS) {
    effectiveProviders[p.id] = getEffectiveProviderConfig(p.id, raw);
  }

  // Also include any user-defined custom providers in config.json
  if (raw?.providers) {
    for (const [key, val] of Object.entries(raw.providers)) {
      if (!effectiveProviders[key]) {
        effectiveProviders[key] = val;
      }
    }
  }

  return {
    activeProvider,
    activeModel,
    securityMode,
    thinkingEffort,
    compaction: raw?.compaction || DEFAULT_PRESET_CONFIG.compaction,
    providers: effectiveProviders,
    models: raw?.models,
    trustedWorkspaces: raw?.trustedWorkspaces || [],
  };
}

export function saveConfig(updates: Partial<QingmeiConfig>): QingmeiConfig {
  ensureQingmeiEnvironment();
  const existing = loadRawConfigFile() || DEFAULT_PRESET_CONFIG;

  const merged: QingmeiConfig = {
    ...existing,
    ...updates,
    providers: {
      ...existing.providers,
      ...(updates.providers || {}),
    },
    thinkingEffort: updates.thinkingEffort || existing.thinkingEffort || 'medium',
    compaction: {
      ...(existing.compaction || DEFAULT_PRESET_CONFIG.compaction!),
      ...(updates.compaction || {}),
    },
    trustedWorkspaces:
      updates.trustedWorkspaces !== undefined
        ? updates.trustedWorkspaces
        : (existing.trustedWorkspaces || []),
  };

  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8');
  return loadConfig();
}




export function isConfigured(): boolean {
  const config = loadConfig();
  const provider = config.activeProvider;
  const def = getProviderDefinition(provider);

  if (!def) {
    const customProv = config.providers[provider];
    return Boolean(customProv?.apiKey || customProv?.baseUrl);
  }
  if (!def.requiresApiKey) return true; // e.g. Ollama

  const providerConfig = config.providers[provider];
  return Boolean(providerConfig?.apiKey && providerConfig.apiKey.trim().length > 0);
}

function parseModelItem(item: ModelConfig | string, prov: string): ModelMetadata {
  if (typeof item === 'string') {
    return parseModelMetadataFromId(item, prov);
  }

  const baseMeta = parseModelMetadataFromId(item.id, item.provider || prov, item.contextWindow);
  const hasExplicitContext =
    item.hasExplicitContext ??
    (typeof item.contextWindow === 'number' || typeof item.is1MContext === 'boolean' || baseMeta.hasExplicitContext);

  const cw = item.contextWindow ?? baseMeta.contextWindow;
  const is1M = item.is1MContext ?? (cw >= 1000000 || baseMeta.is1MContext);
  const contextDisplay =
    item.context ||
    (is1M ? '1M' : cw >= 1000 ? `${Math.round(cw / 1000)}k` : `${cw}`);

  return {
    id: item.id,
    name: item.name || item.id,
    provider: item.provider || prov,
    context: contextDisplay,
    contextWindow: cw,
    is1MContext: is1M,
    hasExplicitContext,
    supportsTools: item.supportsTools ?? baseMeta.supportsTools,
    supportsReasoning: item.supportsReasoning ?? baseMeta.supportsReasoning,
  };
}

export function getProviderModels(providerId: string, config?: QingmeiConfig): ModelMetadata[] {
  const conf = config || loadConfig();
  const provConf = conf.providers[providerId];
  const result: ModelMetadata[] = [];

  if (provConf?.models && Array.isArray(provConf.models)) {
    for (const m of provConf.models) {
      result.push(parseModelItem(m, providerId));
    }
  }

  return result;
}

export function getAllConfiguredModels(config?: QingmeiConfig): ModelMetadata[] {
  const conf = config || loadConfig();
  const result: ModelMetadata[] = [];

  for (const [pId] of Object.entries(conf.providers)) {
    const models = getProviderModels(pId, conf);
    result.push(...models);
  }

  if (conf.models && Array.isArray(conf.models)) {
    for (const m of conf.models) {
      result.push(parseModelItem(m, m.provider || conf.activeProvider));
    }
  }

  return result;
}

export function getModelMetadata(modelId: string, provider?: string, config?: QingmeiConfig): ModelMetadata {
  // 1. Look up directly in configured models in config.json (Source of Truth)
  const allModels = getAllConfiguredModels(config);
  const found = allModels.find(
    (m) => m.id === modelId && (!provider || m.provider === provider)
  ) || allModels.find((m) => m.id === modelId);

  if (found) return found;

  // 2. Dynamic inference fallback
  return parseModelMetadataFromId(modelId, provider || 'custom');
}

export function getContextDisplayBadge(metadata: ModelMetadata): string {
  if (metadata.context) {
    return metadata.context;
  }
  if (metadata.is1MContext || metadata.contextWindow >= 1000000) {
    return '1M';
  }
  const k = Math.round(metadata.contextWindow / 1000);
  return `${k}k`;
}

export function maskApiKey(key?: string): string {
  if (!key || key.trim().length === 0) {
    return '(not set)';
  }
  const clean = key.trim();
  if (clean.length <= 8) {
    return '****';
  }
  const prefix = clean.slice(0, 4);
  const suffix = clean.slice(-4);
  return `${prefix}****${suffix}`;
}

export function setProviderApiKey(providerId: string, apiKey: string, baseUrl?: string): QingmeiConfig {
  const cleanKey = apiKey.trim();
  const def = getProviderDefinition(providerId);
  if (def?.apiKeyEnvName) {
    process.env[def.apiKeyEnvName] = cleanKey;
  }

  const conf = loadConfig();
  const prov = conf.providers[providerId] || {};

  const updatedProviders = {
    ...conf.providers,
    [providerId]: {
      ...prov,
      apiKey: cleanKey,
      baseUrl: baseUrl || prov.baseUrl || def?.defaultBaseUrl || 'https://api.openai.com/v1',
    },
  };

  const updatedConfig = saveConfig({
    providers: updatedProviders,
  });

  return updatedConfig;
}

export function removeProviderApiKey(providerId: string): QingmeiConfig {
  const def = getProviderDefinition(providerId);
  if (def?.apiKeyEnvName) {
    delete process.env[def.apiKeyEnvName];
  }

  const conf = loadConfig();
  const prov = conf.providers[providerId] || {};

  const updatedProviders = {
    ...conf.providers,
    [providerId]: {
      ...prov,
      apiKey: '',
    },
  };

  const updatedConfig = saveConfig({
    providers: updatedProviders,
  });

  return updatedConfig;
}

export interface ConfiguredProviderInfo {
  id: string;
  name: string;
  isConfigured: boolean;
  apiKey?: string;
  maskedKey: string;
  defaultModel?: string;
  requiresApiKey: boolean;
  is1MSupported: boolean;
}

export function getAvailableConfiguredProviders(config?: QingmeiConfig): ConfiguredProviderInfo[] {
  const conf = config || loadConfig();
  return SUPPORTED_PROVIDERS.map((pDef) => {
    const provConf = conf.providers[pDef.id];
    const hasKey = Boolean(provConf?.apiKey && provConf.apiKey.trim().length > 0);
    const isConfigured = hasKey || !pDef.requiresApiKey;
    const apiKey = provConf?.apiKey;
    const defaultModel = provConf?.defaultModel || DEFAULT_PRESET_CONFIG.providers[pDef.id]?.defaultModel || '';

    return {
      id: pDef.id,
      name: pDef.name,
      isConfigured,
      apiKey,
      maskedKey: maskApiKey(apiKey),
      defaultModel,
      requiresApiKey: pDef.requiresApiKey,
      is1MSupported: Boolean(pDef.is1MSupported),
    };
  });
}



