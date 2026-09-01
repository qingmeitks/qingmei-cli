import { describe, it, expect, beforeEach, vi, afterEach, beforeAll, afterAll } from 'vitest';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  maskApiKey,
  setProviderApiKey,
  removeProviderApiKey,
  getAvailableConfiguredProviders,
  loadConfig,
  saveConfig,
} from '../../src/config/loader.js';
import { LLMClient } from '../../src/core/llm/client.js';
import { QingmeiAgent } from '../../src/core/agent.js';
import { TuiPrompt } from '../../src/cli/ui/prompt.js';
import {
  handleKeyCommand,
  handleUpdateKeyFlow,
  handleRemoveKeyFlow,
  handlePostRemoveKeyFallback,
} from '../../src/cli/commands/key.js';

describe('API Key Management & Security', () => {
  let tmpHome: string;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'qingmei-test-home-'));
    process.env.QINGMEI_HOME = tmpHome;
    process.env.QINGMEI_CONFIG_PATH = path.join(tmpHome, 'config.json');
  });

  afterAll(() => {
    process.env = { ...originalEnv };
    if (fs.existsSync(tmpHome)) {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });
  describe('maskApiKey', () => {
    it('handles empty or undefined keys safely', () => {
      expect(maskApiKey(undefined)).toBe('(not set)');
      expect(maskApiKey('')).toBe('(not set)');
      expect(maskApiKey('   ')).toBe('(not set)');
    });

    it('masks short keys with four asterisks', () => {
      expect(maskApiKey('12345')).toBe('****');
      expect(maskApiKey('12345678')).toBe('****');
    });

    it('masks standard API keys preserving 4-char prefix and suffix', () => {
      const masked = maskApiKey('sk-1234567890abcdef');
      expect(masked).toBe('sk-1****cdef');
      expect(masked.length).toBe(12);

      const geminiMasked = maskApiKey('AIzaSyD1234567890wxyz');
      expect(geminiMasked).toBe('AIza****wxyz');
    });
  });

  describe('Config Persistence: setProviderApiKey & removeProviderApiKey', () => {
    beforeEach(() => {
      // Setup initial state
      saveConfig({
        activeProvider: 'deepseek',
        activeModel: 'deepseek-v4-flash',
        providers: {
          deepseek: {
            apiKey: 'sk-initial-deepseek-key-1234',
            baseUrl: 'https://api.deepseek.com/v1',
          },
          gemini: {
            apiKey: 'AIza-initial-gemini-key-5678',
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
          },
        },
      });
    });

    it('sets and persists provider API key cleanly', () => {
      const updated = setProviderApiKey('deepseek', 'sk-new-deepseek-key-9999');
      expect(updated.providers.deepseek.apiKey).toBe('sk-new-deepseek-key-9999');

      const reloaded = loadConfig();
      expect(reloaded.providers.deepseek.apiKey).toBe('sk-new-deepseek-key-9999');
    });

    it('removes and clears provider API key', () => {
      const updated = removeProviderApiKey('deepseek');
      expect(updated.providers.deepseek.apiKey).toBe('');

      const reloaded = loadConfig();
      expect(reloaded.providers.deepseek.apiKey).toBe('');
      // Gemini should remain intact
      expect(reloaded.providers.gemini.apiKey).toBe('AIza-initial-gemini-key-5678');
    });

    it('lists available configured providers with masked keys', () => {
      const list = getAvailableConfiguredProviders();
      const ds = list.find((p) => p.id === 'deepseek');
      const gem = list.find((p) => p.id === 'gemini');

      expect(ds).toBeDefined();
      expect(ds?.isConfigured).toBe(true);
      expect(ds?.maskedKey).toContain('****');

      expect(gem).toBeDefined();
      expect(gem?.isConfigured).toBe(true);
      expect(gem?.maskedKey).toContain('****');
    });
  });

  describe('LLMClient.verifyApiKey Probe', () => {
    it('returns success: true when remote models or probe succeeds', async () => {
      const listSpy = vi.spyOn(LLMClient.prototype, 'listRemoteModels').mockResolvedValue([
        {
          id: 'deepseek-chat',
          name: 'DeepSeek Chat',
          context: '1M',
          contextWindow: 1000000,
          is1MContext: true,
          provider: 'deepseek',
          supportsTools: true,
          supportsReasoning: false,
        },
      ]);

      const res = await LLMClient.verifyApiKey('deepseek', 'sk-valid-key-1234');
      expect(res.success).toBe(true);
      expect(res.latencyMs).toBeGreaterThanOrEqual(0);

      listSpy.mockRestore();
    });

    it('returns success: false when Gemini returns 400 API_KEY_INVALID', async () => {
      const listSpy = vi.spyOn(LLMClient.prototype, 'listRemoteModels').mockResolvedValue([]);
      const chatSpy = vi.spyOn(OpenAI.Chat.Completions.prototype, 'create').mockRejectedValue(
        new Error('400 API_KEY_INVALID: API key not valid. Please pass a valid API key.')
      );

      const res = await LLMClient.verifyApiKey('gemini', 'AIza-bad-fake-key-1234');
      expect(res.success).toBe(false);
      expect(res.error).toContain('API_KEY_INVALID');

      listSpy.mockRestore();
      chatSpy.mockRestore();
    });

    it('returns success: false immediately for empty API keys', async () => {
      const res = await LLMClient.verifyApiKey('gemini', '   ');
      expect(res.success).toBe(false);
      expect(res.error).toContain('empty');
    });
  });

  describe('Key Command Handlers & Fallback Workflows', () => {
    let agent: QingmeiAgent;
    let tuiPrompt: TuiPrompt;

    beforeEach(() => {
      saveConfig({
        activeProvider: 'deepseek',
        activeModel: 'deepseek-v4-flash',
        providers: {
          deepseek: {
            apiKey: 'sk-deepseek-active-key-1234',
            baseUrl: 'https://api.deepseek.com/v1',
          },
          gemini: {
            apiKey: 'AIza-gemini-standby-key-5678',
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
          },
        },
      });

      const activeModel = {
        id: 'deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        context: '1M',
        contextWindow: 1000000,
        is1MContext: true,
        provider: 'deepseek',
        supportsTools: true,
        supportsReasoning: true,
      };

      const llmClient = new LLMClient({
        apiKey: 'sk-deepseek-active-key-1234',
        baseUrl: 'https://api.deepseek.com/v1',
        defaultModel: 'deepseek-v4-flash',
        provider: 'deepseek',
      });

      agent = new QingmeiAgent({
        workingDirectory: process.cwd(),
        securityMode: 'interactive',
        activeModel,
        llmClient,
      });

      tuiPrompt = new TuiPrompt({
        mode: 'interactive',
        model: agent.activeModel,
        cwd: process.cwd(),
      });
    });

    it('handles direct update /key deepseek sk-new-key-1234', async () => {
      vi.spyOn(LLMClient, 'verifyApiKey').mockResolvedValue({
        success: true,
        latencyMs: 30,
      });

      await handleKeyCommand('deepseek sk-new-key-1234', agent, tuiPrompt);

      const config = loadConfig();
      expect(config.providers.deepseek.apiKey).toBe('sk-new-key-1234');
      expect(agent.llmClient.config.apiKey).toBe('sk-new-key-1234');
    });

    it('handles direct remove /key rm deepseek and triggers fallback to Gemini', async () => {
      vi.spyOn(tuiPrompt, 'confirmModal').mockResolvedValue(true);
      vi.spyOn(tuiPrompt, 'selectModal').mockResolvedValue('auto_fallback');

      await handleKeyCommand('rm deepseek', agent, tuiPrompt);

      const config = loadConfig();
      expect(config.providers.deepseek.apiKey).toBe('');
      // Should have fallen back to Gemini
      expect(config.activeProvider).toBe('gemini');
      expect(agent.activeModel.provider).toBe('gemini');
    });

    it('handles updating non-active provider with use_default model option', async () => {
      vi.spyOn(LLMClient, 'verifyApiKey').mockResolvedValue({
        success: true,
        latencyMs: 25,
      });
      vi.spyOn(tuiPrompt, 'selectModal').mockResolvedValue('use_default');

      await handleKeyCommand('gemini AIza-new-gemini-key-9999', agent, tuiPrompt);

      const config = loadConfig();
      expect(config.providers.gemini.apiKey).toBe('AIza-new-gemini-key-9999');
      expect(config.activeProvider).toBe('gemini');
      expect(agent.activeModel.provider).toBe('gemini');
      expect(agent.activeModel.id).toBe('gemini-3.7-flash');
    });

    it('handles updating non-active provider with select_model option', async () => {
      vi.spyOn(LLMClient, 'verifyApiKey').mockResolvedValue({
        success: true,
        latencyMs: 25,
      });
      // First selectModal: pick 'select_model', Second selectModal: pick 'gemini-3.6-flash'
      vi.spyOn(tuiPrompt, 'selectModal')
        .mockResolvedValueOnce('select_model')
        .mockResolvedValueOnce('gemini-3.6-flash');

      await handleKeyCommand('gemini AIza-new-gemini-key-8888', agent, tuiPrompt);

      const config = loadConfig();
      expect(config.providers.gemini.apiKey).toBe('AIza-new-gemini-key-8888');
      expect(config.activeProvider).toBe('gemini');
      expect(agent.activeModel.id).toBe('gemini-3.6-flash');
    });

    it('handles updating non-active provider with stay option', async () => {
      vi.spyOn(LLMClient, 'verifyApiKey').mockResolvedValue({
        success: true,
        latencyMs: 25,
      });
      vi.spyOn(tuiPrompt, 'selectModal').mockResolvedValue('stay');

      await handleKeyCommand('gemini AIza-new-gemini-key-7777', agent, tuiPrompt);

      const config = loadConfig();
      expect(config.providers.gemini.apiKey).toBe('AIza-new-gemini-key-7777');
      // Active provider should remain DeepSeek
      expect(config.activeProvider).toBe('deepseek');
      expect(agent.activeModel.provider).toBe('deepseek');
    });
  });
});
