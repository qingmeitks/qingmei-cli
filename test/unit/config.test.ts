import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getEffectiveProviderConfig,
  getModelMetadata,
  getContextDisplayBadge,
  getProviderModels,
  ensureQingmeiEnvironment,
} from '../../src/config/loader.js';

import {
  extractModelsFromErrorMessage,
  filterLatestModels,
  parseModelMetadataFromId,
  isUtilityOrNonChatModel,
} from '../../src/core/llm/client.js';
import { QingmeiConfig } from '../../src/config/types.js';
import { DEFAULT_PRESET_CONFIG } from '../../src/config/defaults.js';




describe('Config Loader & Model Metadata', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_BASE_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should prioritize vendor-specific environment variables over file config', () => {
    process.env.DEEPSEEK_API_KEY = 'env-secret-key';
    process.env.DEEPSEEK_BASE_URL = 'https://custom-env.deepseek.com/v1';

    const mockFileConfig: QingmeiConfig = {
      activeProvider: 'deepseek',
      activeModel: 'deepseek-chat',
      securityMode: 'interactive',
      providers: {
        deepseek: {
          apiKey: 'file-key',
          baseUrl: 'https://file-url.com/v1',
        },
      },
    };

    const effective = getEffectiveProviderConfig('deepseek', mockFileConfig);
    expect(effective.apiKey).toBe('env-secret-key');
    expect(effective.baseUrl).toBe('https://custom-env.deepseek.com/v1');
  });

  it('should correctly identify 1M context models across various providers', () => {
    const geminiMeta = getModelMetadata('gemini-2.5-pro', 'gemini');
    expect(geminiMeta.is1MContext).toBe(true);
    expect(geminiMeta.contextWindow).toBe(1000000);
    expect(getContextDisplayBadge(geminiMeta)).toBe('1M');

    const qwen1MMeta = getModelMetadata('qwen-plus-1m', 'qwen');
    expect(qwen1MMeta.is1MContext).toBe(true);
    expect(getContextDisplayBadge(qwen1MMeta)).toBe('1M');

    const kimiMeta = getModelMetadata('kimi-k1.5', 'moonshot');
    expect(kimiMeta.is1MContext).toBe(true);
    expect(getContextDisplayBadge(kimiMeta)).toBe('1M');

    const deepseekV4Meta = getModelMetadata('deepseek-v4-flash', 'deepseek');
    expect(deepseekV4Meta.is1MContext).toBe(true);
    expect(deepseekV4Meta.contextWindow).toBe(1000000);
    expect(getContextDisplayBadge(deepseekV4Meta)).toBe('1M');

    const deepseekV4ProMeta = getModelMetadata('deepseek-v4-pro', 'deepseek');
    expect(deepseekV4ProMeta.is1MContext).toBe(true);
    expect(deepseekV4ProMeta.contextWindow).toBe(1000000);
    expect(getContextDisplayBadge(deepseekV4ProMeta)).toBe('1M');

    const deepseekMeta = getModelMetadata('deepseek-chat', 'deepseek');
    expect(deepseekMeta.is1MContext).toBe(false);
    expect(deepseekMeta.contextWindow).toBe(200000);
    expect(getContextDisplayBadge(deepseekMeta)).toBe('200k');
  });

  it('should parse custom models from config.json and correctly resolve 1M context and context field', () => {
    const userCustomConfig: QingmeiConfig = {
      activeProvider: 'deepseek',
      activeModel: 'deepseek-v4-flash',
      securityMode: 'chat',
      providers: {
        deepseek: {
          apiKey: 'sk-8c123456789',
          baseUrl: 'https://api.deepseek.com/v1',
          defaultModel: 'deepseek-v4-flash',
          models: [
            {
              id: 'deepseek-v4-flash',
              name: 'deepseek-v4-flash(1m)',
              context: '1M',
              contextWindow: 1000000,
              is1MContext: true,
              supportsTools: true,
              supportsReasoning: true,
            },
            {
              id: 'deepseek-v4-pro',
              name: 'deepseek-v4-pro',
              context: '200k',
              contextWindow: 200000,
              is1MContext: false,
              supportsTools: true,
            },
          ],
        },
      },
    };

    const flashMeta = getModelMetadata('deepseek-v4-flash', 'deepseek', userCustomConfig);
    expect(flashMeta.is1MContext).toBe(true);
    expect(flashMeta.contextWindow).toBe(1000000);
    expect(flashMeta.supportsReasoning).toBe(true);
    expect(flashMeta.supportsTools).toBe(true);
    expect(getContextDisplayBadge(flashMeta)).toBe('1M');

    const proMeta = getModelMetadata('deepseek-v4-pro', 'deepseek', userCustomConfig);
    expect(proMeta.is1MContext).toBe(false);
    expect(proMeta.contextWindow).toBe(200000);
    expect(getContextDisplayBadge(proMeta)).toBe('200k');
  });

  it('should correctly identify 200k and 1M context models including future Claude 4.6 and Gemini 3.7', () => {
    const claudeMeta = getModelMetadata('claude-3-7-sonnet-latest', 'anthropic');
    expect(claudeMeta.contextWindow).toBe(200000);
    expect(getContextDisplayBadge(claudeMeta)).toBe('200k');

    const claude46Meta = getModelMetadata('claude-4.6-sonnet', 'anthropic');
    expect(claude46Meta.contextWindow).toBe(200000);
    expect(getContextDisplayBadge(claude46Meta)).toBe('200k');

    const gemini37Meta = getModelMetadata('gemini-3.7-flash', 'gemini');
    expect(gemini37Meta.is1MContext).toBe(true);
    expect(gemini37Meta.contextWindow).toBe(1000000);
    expect(getContextDisplayBadge(gemini37Meta)).toBe('1M');

    const o3Meta = getModelMetadata('o3-mini', 'openai');
    expect(o3Meta.contextWindow).toBe(200000);
    expect(getContextDisplayBadge(o3Meta)).toBe('200k');

    const glmLongMeta = getModelMetadata('glm-4-long', 'glm');
    expect(glmLongMeta.is1MContext).toBe(true);
    expect(glmLongMeta.contextWindow).toBe(1000000);
    expect(getContextDisplayBadge(glmLongMeta)).toBe('1M');

    const qwen256kMeta = getModelMetadata('qwen-256k', 'qwen');
    expect(qwen256kMeta.contextWindow).toBe(256000);
    expect(getContextDisplayBadge(qwen256kMeta)).toBe('256k');
  });

  it('should extract supported model names and default non-explicit models to 200K', () => {
    const errorMsg = '400 The supported API model names are custom-model-pro or custom-model-flash(1m), but you passed dummy.';
    const models = extractModelsFromErrorMessage(errorMsg, 'custom');
    expect(models.length).toBe(2);
    expect(models[0].id).toBe('custom-model-pro');
    expect(models[1].id).toBe('custom-model-flash(1m)');
    // custom-model-pro defaults to 200k
    expect(models[0].contextWindow).toBe(200000);
    expect(getContextDisplayBadge(models[0])).toBe('200k');
    // custom-model-flash(1m) has explicit 1m -> 1,000,000
    expect(models[1].contextWindow).toBe(1000000);
    expect(getContextDisplayBadge(models[1])).toBe('1M');
  });

  it('should dynamically determine and retain latest models from any model list', () => {
    const mixedModels = [
      parseModelMetadataFromId('claude-3-7-sonnet-20250219', 'anthropic'),
      parseModelMetadataFromId('claude-3-7-sonnet', 'anthropic'),
      parseModelMetadataFromId('claude-2.1', 'anthropic'),
      parseModelMetadataFromId('gpt-4o', 'openai'),
      parseModelMetadataFromId('gpt-3.5-turbo', 'openai'),
      parseModelMetadataFromId('text-embedding-3-large', 'openai'),
    ];
    const latest = filterLatestModels(mixedModels);
    const ids = latest.map((m) => m.id);
    expect(ids).toContain('claude-3-7-sonnet');
    expect(ids).not.toContain('claude-2.1');
    expect(ids).toContain('gpt-4o');
    expect(ids).not.toContain('gpt-3.5-turbo');
    expect(ids).not.toContain('text-embedding-3-large');
  });

  it('should correctly filter Gemini model list and exclude deep-research and non-chat endpoints', () => {
    const geminiModels = [
      parseModelMetadataFromId('models/gemini-2.5-pro', 'gemini'),
      parseModelMetadataFromId('models/gemini-2.5-flash', 'gemini'),
      parseModelMetadataFromId('models/gemini-2.0-flash', 'gemini'),
      parseModelMetadataFromId('models/gemini-1.5-pro', 'gemini'),
      parseModelMetadataFromId('models/gemini-1.0-pro', 'gemini'),
      parseModelMetadataFromId('models/deep-research-pro-preview-12-2025', 'gemini'),
      parseModelMetadataFromId('models/imagen-3.0-generate-002', 'gemini'),
      parseModelMetadataFromId('models/text-embedding-004', 'gemini'),
      parseModelMetadataFromId('models/aqa', 'gemini'),
    ];
    const filtered = filterLatestModels(geminiModels);
    const ids = filtered.map((m) => m.id);
    expect(ids).toContain('models/gemini-2.5-pro');
    expect(ids).toContain('models/gemini-2.5-flash');
    expect(ids).toContain('models/gemini-2.0-flash');
    expect(ids).toContain('models/gemini-1.5-pro');
    expect(ids).not.toContain('models/gemini-1.0-pro');
    expect(ids).not.toContain('models/deep-research-pro-preview-12-2025');
    expect(ids).not.toContain('models/imagen-3.0-generate-002');
    expect(ids).not.toContain('models/text-embedding-004');
    expect(ids).not.toContain('models/aqa');
  });

  it('should filter obsolete models and keep latest series', () => {
    expect(isUtilityOrNonChatModel('text-embedding-3-small')).toBe(true);
    expect(isUtilityOrNonChatModel('tts-1-hd')).toBe(true);
    expect(isUtilityOrNonChatModel('whisper-1')).toBe(true);
    expect(isUtilityOrNonChatModel('models/deep-research-pro-preview-12-2025')).toBe(true);
    expect(isUtilityOrNonChatModel('models/imagen-3.0-generate-002')).toBe(true);
    expect(isUtilityOrNonChatModel('deepseek-chat')).toBe(false);
    expect(isUtilityOrNonChatModel('models/gemini-2.5-pro')).toBe(false);
    expect(isUtilityOrNonChatModel('claude-3-7-sonnet')).toBe(false);
  });


  it('should have correct default presets for DeepSeek, Gemini, and OpenAI, and empty for others', () => {
    const deepseekModels = getProviderModels('deepseek', DEFAULT_PRESET_CONFIG);
    expect(deepseekModels.map((m) => m.id)).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro']);
    expect(deepseekModels[0].contextWindow).toBe(1000000);
    expect(deepseekModels[0].is1MContext).toBe(true);
    expect(deepseekModels[1].contextWindow).toBe(1000000);
    expect(deepseekModels[1].is1MContext).toBe(true);


    const geminiModels = getProviderModels('gemini', DEFAULT_PRESET_CONFIG);
    expect(geminiModels.map((m) => m.id)).toEqual([
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.6-flash',
      'gemini-3.7-flash',
      'gemini-3.1-pro-preview',
    ]);
    expect(geminiModels[0].is1MContext).toBe(true);
    expect(geminiModels[1].is1MContext).toBe(true);
    expect(geminiModels[2].is1MContext).toBe(true);
    expect(geminiModels[3].is1MContext).toBe(true);
    expect(geminiModels[4].is1MContext).toBe(true);

    const openaiModels = getProviderModels('openai', DEFAULT_PRESET_CONFIG);
    expect(openaiModels.map((m) => m.id)).toEqual([
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      'gpt-5.5',
      'gpt-5.4-mini',
    ]);
    expect(openaiModels[0].is1MContext).toBe(true);
    expect(openaiModels[1].is1MContext).toBe(true);
    expect(openaiModels[2].is1MContext).toBe(true);
    expect(openaiModels[3].is1MContext).toBe(true);
    expect(openaiModels[4].is1MContext).toBe(true);

    const anthropicModels = getProviderModels('anthropic', DEFAULT_PRESET_CONFIG);
    expect(anthropicModels).toEqual([]);
    const grokModels = getProviderModels('grok', DEFAULT_PRESET_CONFIG);
    expect(grokModels).toEqual([]);
    const glmModels = getProviderModels('glm', DEFAULT_PRESET_CONFIG);
    expect(glmModels).toEqual([]);
  });

  it('should export ensureQingmeiEnvironment function', () => {
    expect(typeof ensureQingmeiEnvironment).toBe('function');
  });

  it('should load and preserve trustedWorkspaces in config', () => {
    const mockConfig: QingmeiConfig = {
      activeProvider: 'deepseek',
      activeModel: 'deepseek-v4-flash',
      securityMode: 'interactive',
      providers: {},
      trustedWorkspaces: ['/Users/test/workspace/project-a', '/Users/test/workspace/project-b'],
    };

    expect(mockConfig.trustedWorkspaces).toContain('/Users/test/workspace/project-a');
    expect(mockConfig.trustedWorkspaces?.length).toBe(2);
  });
});









