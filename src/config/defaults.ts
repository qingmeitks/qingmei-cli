import path from 'path';
import os from 'os';
import { QingmeiConfig } from './types.js';

export function getQingmeiHome(): string {
  return process.env.QINGMEI_HOME || path.join(os.homedir(), '.qingmei');
}

export function getConfigPath(): string {
  return process.env.QINGMEI_CONFIG_PATH || path.join(getQingmeiHome(), 'config.json');
}

export function getMcpConfigPath(): string {
  return path.join(getQingmeiHome(), 'mcp.json');
}

export const QINGMEI_HOME = path.join(os.homedir(), '.qingmei');
export const CONFIG_PATH = path.join(QINGMEI_HOME, 'config.json');
export const MCP_CONFIG_PATH = path.join(QINGMEI_HOME, 'mcp.json');
export const SKILLS_DIR = path.join(QINGMEI_HOME, 'skills');
export const SESSIONS_DIR = path.join(QINGMEI_HOME, 'sessions');
export const EXPORT_DIR = path.join(QINGMEI_HOME, 'export');
export const GLOBAL_INSTRUCTIONS_PATH = path.join(QINGMEI_HOME, 'QINGMEI.md');


export interface ProviderDefinition {
  id: string;
  name: string;
  defaultBaseUrl: string;
  apiKeyEnvName: string;
  baseUrlEnvName?: string;
  requiresApiKey: boolean;
  is1MSupported?: boolean;
}

export const SUPPORTED_PROVIDERS: ProviderDefinition[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    apiKeyEnvName: 'DEEPSEEK_API_KEY',
    baseUrlEnvName: 'DEEPSEEK_BASE_URL',
    requiresApiKey: true,
    is1MSupported: true,
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKeyEnvName: 'GEMINI_API_KEY',
    baseUrlEnvName: 'GEMINI_BASE_URL',
    requiresApiKey: true,
    is1MSupported: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    apiKeyEnvName: 'OPENAI_API_KEY',
    baseUrlEnvName: 'OPENAI_BASE_URL',
    requiresApiKey: true,
    is1MSupported: true,
  },
  {
    id: 'grok',
    name: 'Grok / xAI',
    defaultBaseUrl: 'https://api.x.ai/v1',
    apiKeyEnvName: 'XAI_API_KEY',
    baseUrlEnvName: 'XAI_BASE_URL',
    requiresApiKey: true,
    is1MSupported: true,
  },
  {
    id: 'glm',
    name: 'GLM / 智谱 AI',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4/',
    apiKeyEnvName: 'ZHIPU_API_KEY',
    baseUrlEnvName: 'ZHIPU_BASE_URL',
    requiresApiKey: true,
    is1MSupported: true,
  },
  {
    id: 'qwen',
    name: 'Qwen / DashScope (通义千问)',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyEnvName: 'DASHSCOPE_API_KEY',
    baseUrlEnvName: 'DASHSCOPE_BASE_URL',
    requiresApiKey: true,
    is1MSupported: true,
  },
  /* 待后续预设模型完善后再行开放
  {
    id: 'anthropic',
    name: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    apiKeyEnvName: 'ANTHROPIC_API_KEY',
    baseUrlEnvName: 'ANTHROPIC_BASE_URL',
    requiresApiKey: true,
  },
  {
    id: 'moonshot',
    name: 'Moonshot / Kimi (月之暗面)',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    apiKeyEnvName: 'MOONSHOT_API_KEY',
    baseUrlEnvName: 'MOONSHOT_BASE_URL',
    requiresApiKey: true,
    is1MSupported: true,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    defaultBaseUrl: 'http://127.0.0.1:11434/v1',
    apiKeyEnvName: 'OLLAMA_API_KEY',
    baseUrlEnvName: 'OLLAMA_HOST',
    requiresApiKey: false,
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible Proxy)',
    defaultBaseUrl: 'https://api.openai.com/v1',
    apiKeyEnvName: 'CUSTOM_API_KEY',
    baseUrlEnvName: 'CUSTOM_BASE_URL',
    requiresApiKey: true,
  },
  */
];

export const DEFAULT_PRESET_CONFIG: QingmeiConfig = {
  activeProvider: 'deepseek',
  activeModel: 'deepseek-v4-flash',
  securityMode: 'interactive',
  providers: {
    deepseek: {
      apiKey: '',
      baseUrl: 'https://api.deepseek.com/v1',
      defaultModel: 'deepseek-v4-flash',
      models: [
        {
          id: 'deepseek-v4-flash',
          name: 'deepseek-v4-flash',
          context: '1M',
          contextWindow: 1000000,
          is1MContext: true,
          supportsTools: true,
          supportsReasoning: true,
        },
        {
          id: 'deepseek-v4-pro',
          name: 'deepseek-v4-pro',
          context: '1M',
          contextWindow: 1000000,
          is1MContext: true,
          supportsTools: true,
          supportsReasoning: false,
        },
      ],
    },
    gemini: {
      apiKey: '',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      defaultModel: 'gemini-3.7-flash',
      models: [
        {
          id: 'gemini-3.5-flash',
          name: 'gemini-3.5-flash',
          context: '1M',
          contextWindow: 1000000,
          is1MContext: true,
          supportsTools: true,
          supportsReasoning: false,
        },
        {
          id: 'gemini-3.5-flash-lite',
          name: 'gemini-3.5-flash-lite',
          context: '1M',
          contextWindow: 1000000,
          is1MContext: true,
          supportsTools: true,
          supportsReasoning: false,
        },
        {
          id: 'gemini-3.6-flash',
          name: 'gemini-3.6-flash',
          context: '1M',
          contextWindow: 1000000,
          is1MContext: true,
          supportsTools: true,
          supportsReasoning: false,
        },
        {
          id: 'gemini-3.7-flash',
          name: 'gemini-3.7-flash',
          context: '1M',
          contextWindow: 1000000,
          is1MContext: true,
          supportsTools: true,
          supportsReasoning: true,
        },
        {
          id: 'gemini-3.1-pro-preview',
          name: 'gemini-3.1-pro-preview',
          context: '1M',
          contextWindow: 1000000,
          is1MContext: true,
          supportsTools: true,
          supportsReasoning: false,
        },
      ],
    },
    openai: {
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-5.6-sol',
      models: [
        {
          id: 'gpt-5.6-sol',
          name: 'gpt-5.6-sol',
          context: '1M',
          contextWindow: 1000000,
          is1MContext: true,
          supportsTools: true,
          supportsReasoning: true,
        },
        {
          id: 'gpt-5.6-terra',
          name: 'gpt-5.6-terra',
          context: '1M',
          contextWindow: 1000000,
          is1MContext: true,
          supportsTools: true,
          supportsReasoning: true,
        },
        {
          id: 'gpt-5.6-luna',
          name: 'gpt-5.6-luna',
          context: '1M',
          contextWindow: 1000000,
          is1MContext: true,
          supportsTools: true,
          supportsReasoning: true,
        },
        {
          id: 'gpt-5.5',
          name: 'gpt-5.5',
          context: '1M',
          contextWindow: 1000000,
          is1MContext: true,
          supportsTools: true,
          supportsReasoning: true,
        },
        {
          id: 'gpt-5.4-mini',
          name: 'gpt-5.4-mini',
          context: '1M',
          contextWindow: 1000000,
          is1MContext: true,
          supportsTools: true,
          supportsReasoning: false,
        },
      ],
    },
    grok: {
      apiKey: '',
      baseUrl: 'https://api.x.ai/v1',
      defaultModel: 'grok-4.6',
      models: [
        {
          id: 'grok-4.6',
          name: 'grok-4.6',
          context: '1M',
          contextWindow: 1000000,
          is1MContext: true,
          supportsTools: true,
          supportsReasoning: true,
        },
        {
          id: 'grok-4.5',
          name: 'grok-4.5',
          context: '1M',
          contextWindow: 1000000,
          is1MContext: true,
          supportsTools: true,
          supportsReasoning: true,
        },
        {
          id: 'grok-4.3',
          name: 'grok-4.3',
          context: '1M',
          contextWindow: 1000000,
          is1MContext: true,
          supportsTools: true,
          supportsReasoning: false,
        },
      ],
    },
    glm: {
      apiKey: '',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4/',
      defaultModel: 'GLM-5.3-Flash',
      models: [
        {
          id: 'GLM-5.3-Flash',
          name: 'GLM-5.3-Flash',
          context: '1M',
          contextWindow: 1000000,
          is1MContext: true,
          supportsTools: true,
          supportsReasoning: true,
        },
        {
          id: 'GLM-5.3',
          name: 'GLM-5.3',
          context: '1M',
          contextWindow: 1000000,
          is1MContext: true,
          supportsTools: true,
          supportsReasoning: false,
        },
        {
          id: 'GLM-5.2',
          name: 'GLM-5.2',
          context: '1M',
          contextWindow: 1000000,
          is1MContext: true,
          supportsTools: true,
          supportsReasoning: false,
        },
      ],
    },
    qwen: {
      apiKey: '',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      defaultModel: 'qwen3.8-max',
      models: [
        {
          id: 'qwen3.8-max',
          name: 'qwen3.8-max',
          context: '1M',
          contextWindow: 1000000,
          is1MContext: true,
          supportsTools: true,
          supportsReasoning: true,
        },
        {
          id: 'qwen3.8-flash',
          name: 'qwen3.8-flash',
          context: '1M',
          contextWindow: 1000000,
          is1MContext: true,
          supportsTools: true,
          supportsReasoning: true,
        },
        {
          id: 'qwen3.7-plus',
          name: 'qwen3.7-plus',
          context: '1M',
          contextWindow: 1000000,
          is1MContext: true,
          supportsTools: true,
          supportsReasoning: false,
        },
        {
          id: 'qwen3.7-flash',
          name: 'qwen3.7-flash',
          context: '1M',
          contextWindow: 1000000,
          is1MContext: true,
          supportsTools: true,
          supportsReasoning: false,
        },
      ],
    },
    /* 待后续预设模型完善后再行开放
    anthropic: {
      apiKey: '',
      baseUrl: 'https://api.anthropic.com/v1',
      defaultModel: '',
      models: [],
    },
    moonshot: {
      apiKey: '',
      baseUrl: 'https://api.moonshot.cn/v1',
      defaultModel: '',
      models: [],
    },
    ollama: {
      apiKey: '',
      baseUrl: 'http://127.0.0.1:11434/v1',
      defaultModel: '',
      models: [],
    },
    */
  },
  thinkingEffort: 'medium',
  compaction: {
    enabled: true,
    thresholdPercentage: 60,
    recentWindowMessages: 10,
    maxToolOutputChars: 1500,
  },
  trustedWorkspaces: [],
};





