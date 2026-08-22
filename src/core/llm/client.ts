import OpenAI from 'openai';
import {
  ChatMessage,
  ToolDefinition,
  LLMOptions,
  StreamEvent,
  LLMResponse,
  ToolCall,
} from './types.js';
import { ModelMetadata } from '../../config/types.js';

export interface LLMClientConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  provider: string;
}

export function isUtilityOrNonChatModel(id: string): boolean {
  const clean = id.replace(/^models\//i, '').toLowerCase();
  return (
    clean.includes('embed') ||
    clean.includes('whisper') ||
    clean.includes('tts') ||
    clean.includes('dall-e') ||
    clean.includes('imagen') ||
    clean.includes('flux') ||
    clean.includes('video') ||
    clean.includes('moderation') ||
    clean.includes('guard') ||
    clean.includes('shield') ||
    clean.includes('safety') ||
    clean.includes('aqa') ||
    clean.includes('deep-research') ||
    clean.includes('research-preview') ||
    clean.includes('learnlm') ||
    clean.includes('babbage') ||
    clean.includes('curie') ||
    clean.includes('ada') ||
    clean.includes('davinci') ||
    clean.includes('realtime') ||
    clean.includes('audio') ||
    clean.includes('rerank') ||
    clean.includes('similarity') ||
    clean.includes('search') ||
    clean.includes('transcription')
  );
}

export function filterLatestModels(models: ModelMetadata[]): ModelMetadata[] {
  // 1. Filter out utility non-chat models
  const chatCandidates = models.filter((m) => !isUtilityOrNonChatModel(m.id));

  if (chatCandidates.length <= 1) {
    return chatCandidates;
  }

  // 2. Parse root vendor family, sub-variant, and numerical version dynamically
  const parseModelInfo = (id: string) => {
    const cleanId = id.replace(/^models\//i, '').toLowerCase();
    const isDatedSnapshot = /\b\d{4}[-_]?\d{2}[-_]?\d{2}\b|\b\d{2}[-_]\d{4}\b|\b\d{4}\b|\b\d{2}[-_]\d{2}\b/.test(cleanId);

    // Strip date sequences first so dates like 12-2025 or 20250219 are NEVER parsed as versions
    const undatedId = cleanId
      .replace(/\b\d{4}[-_]?\d{2}[-_]?\d{2}\b/g, '')
      .replace(/\b\d{2}[-_]\d{4}\b/g, '')
      .replace(/\b20\d{2}\b/g, '')
      .replace(/\b\d{4}\b/g, '')
      .replace(/\b\d{2}[-_]\d{2}\b/g, '')
      .replace(/[-_]+/g, '-')
      .replace(/^-|-$/g, '');

    // Root family is the first alpha segment (e.g. "gemini", "claude", "gpt", "deepseek", "qwen", "glm")
    const rootMatch = cleanId.match(/^([a-z]+)/);
    const rootFamily = rootMatch ? rootMatch[1] : cleanId;

    let version = 1.0;
    const compoundMatch = undatedId.match(/(?:^|[-_v])(\d+)[-.](\d+)/);
    if (compoundMatch && compoundMatch[1] && compoundMatch[2]) {
      version = parseFloat(`${compoundMatch[1]}.${compoundMatch[2]}`);
    } else {
      const vMatch = undatedId.match(/(?:^|[-_v])(\d+(?:\.\d+)?)/);
      if (vMatch && vMatch[1]) {
        version = parseFloat(vMatch[1]);
      }
    }

    const subFamilyKey = undatedId
      .replace(/[-_v]?\d+(?:\.\d+)?[-_]?/g, '-')
      .replace(/[-_]+/g, '-')
      .replace(/^-|-$/g, '');

    return { rootFamily, subFamilyKey: subFamilyKey || undatedId, version, isDatedSnapshot, cleanId };
  };

  const parsedList = chatCandidates.map((m) => ({ item: m, info: parseModelInfo(m.id) }));

  // Find max major version for each root family
  const rootMaxVersions = new Map<string, number>();
  for (const p of parsedList) {
    const currentMax = rootMaxVersions.get(p.info.rootFamily) || 0;
    if (p.info.version > currentMax) {
      rootMaxVersions.set(p.info.rootFamily, p.info.version);
    }
  }

  // Filter out obsolete generations across the root family
  const generationFiltered = parsedList.filter((p) => {
    const maxV = rootMaxVersions.get(p.info.rootFamily) || 1;
    if (maxV >= 3) {
      return p.info.version >= Math.floor(maxV);
    }
    if (maxV >= 2) {
      // For version 2.x (e.g. Gemini 2.x, Qwen 2.x), retain versions >= 1.5
      return p.info.version >= 1.5;
    }
    return true;
  });

  // Group by subFamilyKey to deduplicate dated snapshots vs canonical alias
  const subFamilyGroups = new Map<string, Array<(typeof parsedList)[0]>>();
  for (const p of generationFiltered) {
    const group = subFamilyGroups.get(p.info.subFamilyKey) || [];
    group.push(p);
    subFamilyGroups.set(p.info.subFamilyKey, group);
  }

  const result: ModelMetadata[] = [];
  for (const [, group] of subFamilyGroups.entries()) {
    const hasCanonicalAlias = group.some((g) => !g.info.isDatedSnapshot);
    for (const g of group) {
      if (hasCanonicalAlias && g.info.isDatedSnapshot && group.length > 1) {
        continue;
      }
      result.push(g.item);
    }
  }

  return result.length > 0 ? result : chatCandidates;
}



export function parseModelMetadataFromId(
  id: string,
  provider: string,
  explicitContext?: number
): ModelMetadata {
  const lower = id.toLowerCase();
  let contextWindow = 200000; // Default to 200K when not explicitly declared
  let hasExplicitContext = false;

  // 1. Explicit context reported directly by API response object
  if (typeof explicitContext === 'number' && explicitContext > 0) {
    contextWindow = explicitContext;
    hasExplicitContext = true;
  } else {
    // 2. Generic numerical & context pattern extraction from model ID
    const mMatch = lower.match(/(?:^|[-_.:])(\d+)m(?:[-_.:]|$)/i) || lower.match(/(\d+)m\b/i);
    const kMatch = lower.match(/(?:^|[-_.:])(\d+)k(?:[-_.:]|$)/i) || lower.match(/(\d+)k\b/i);
    const numMatch = lower.match(/(?:^|[-_.:])(\d{6,})(?:[-_.:]|$)/);

    if (mMatch && mMatch[1]) {
      contextWindow = parseInt(mMatch[1], 10) * 1000000;
      hasExplicitContext = true;
    } else if (kMatch && kMatch[1]) {
      contextWindow = parseInt(kMatch[1], 10) * 1000;
      hasExplicitContext = true;
    } else if (numMatch && numMatch[1]) {
      contextWindow = parseInt(numMatch[1], 10);
      hasExplicitContext = true;
    } else if (
      lower.includes('long') ||
      lower.includes('gemini') ||
      lower.includes('kimi') ||
      lower.includes('moonshot') ||
      lower.includes('deepseek-v4') ||
      lower.includes('deepseek-r2') ||
      (lower.includes('deepseek') && (lower.includes('v4') || lower.includes('1m'))) ||
      lower.includes('gpt-5') ||
      lower.includes('sol') ||
      lower.includes('terra') ||
      lower.includes('luna')
    ) {
      contextWindow = 1000000;
      hasExplicitContext = true;
    }
  }

  const is1M = contextWindow >= 1000000;
  const contextDisplay = is1M
    ? '1M'
    : contextWindow >= 1000
    ? `${Math.round(contextWindow / 1000)}k`
    : `${contextWindow}`;

  const isReasoning =
    lower.includes('reasoner') ||
    lower.includes('reasoning') ||
    lower.includes('thinking') ||
    lower.includes('r1') ||
    lower.includes('r2') ||
    lower.includes('o1') ||
    lower.includes('o3') ||
    lower.includes('o4') ||
    lower.includes('flash') ||
    lower.includes('zero') ||
    lower.includes('sol') ||
    lower.includes('terra') ||
    lower.includes('luna') ||
    lower.includes('gpt-5.5') ||
    lower.includes('gpt-5.6');

  return {
    id,
    name: id,
    provider,
    context: contextDisplay,
    contextWindow,
    is1MContext: is1M,
    hasExplicitContext,
    supportsTools: !isReasoning,
    supportsReasoning: isReasoning,
  };
}

export function extractModelsFromErrorMessage(errorMsg: string, provider: string): ModelMetadata[] {
  const regex = /(?:supported\s+(?:API\s+)?model\s+names\s+are|supported\s+models\s+(?:are|include)|available\s+models\s+(?:are|include)|valid\s+models\s+(?:are|include))\s*:?\s*([\s\S]+?)(?:\s*,\s*but\s+you|\.\s+[A-Z]|\.$|$)/i;
  const match = errorMsg.match(regex);
  if (!match || !match[1]) return [];

  const rawList = match[1];
  const tokens = rawList.split(/[\s,，、]+/).map((t) => t.trim()).filter(Boolean);
  const stopWords = new Set(['or', 'and', 'are', 'is', 'the', 'but', 'you', 'passed', 'a', 'an']);

  const candidates: ModelMetadata[] = [];
  for (const tok of tokens) {
    let cleaned = tok.replace(/^["'`]+|[.,;:"'`]+$/g, '').trim();
    if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    if (!cleaned || stopWords.has(cleaned.toLowerCase())) continue;
    if (isUtilityOrNonChatModel(cleaned)) continue;

    if (cleaned.length >= 2 && !candidates.some((m) => m.id === cleaned)) {
      const meta = parseModelMetadataFromId(cleaned, provider);
      candidates.push(meta);
    }
  }

  return filterLatestModels(candidates);
}


export class LLMClient {
  private client: OpenAI;
  public config: LLMClientConfig;

  constructor(config: LLMClientConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey || 'not-needed',
      baseURL: config.baseUrl,
      dangerouslyAllowBrowser: false,
    });
  }

  /**
   * Send a streaming chat completion request
   */
  async *chatStream(
    messages: ChatMessage[],
    options: LLMOptions = {}
  ): AsyncGenerator<StreamEvent, LLMResponse, unknown> {
    const model = options.model || this.config.defaultModel;
    const tools = options.tools && options.tools.length > 0 ? options.tools : undefined;

    // Convert messages for OpenAI SDK
    const formattedMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = messages.map(
      (msg) => {
        if (msg.role === 'tool') {
          return {
            role: 'tool',
            content: msg.content || '',
            tool_call_id: msg.tool_call_id || '',
          };
        }
        if (msg.role === 'assistant') {
          return {
            role: 'assistant',
            content: msg.content,
            tool_calls: msg.tool_calls as any,
          };
        }
        return {
          role: msg.role as 'system' | 'user',
          content: msg.content || '',
        };
      }
    );

    const requestPayload: any = {
      model,
      messages: formattedMessages,
      tools: tools as any,
      tool_choice: tools ? options.toolChoice || 'auto' : undefined,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      stream: true,
    };

    if (options.thinkingEffort) {
      if (options.thinkingEffort === 'off') {
        if (this.config.provider === 'gemini') {
          requestPayload.thinking_config = { thinking_budget: 0 };
        }
      } else {
        requestPayload.reasoning_effort = options.thinkingEffort;
        if (this.config.provider === 'gemini') {
          const budgetMap: Record<string, number> = {
            low: 1024,
            medium: 8192,
            high: 32768,
          };
          requestPayload.thinking_config = {
            thinking_budget: budgetMap[options.thinkingEffort] || 8192,
          };
        }
      }
    }

    const stream = await this.client.chat.completions.create(
      requestPayload as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming
    );



    let fullContent = '';
    let fullReasoning = '';
    const toolCallsMap = new Map<number, { id: string; name: string; arguments: string }>();

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      const delta = choice.delta as any;

      // 1. Handle reasoning / thought stream (DeepSeek R1 / o1 / o3-mini)
      if (delta?.reasoning_content) {
        fullReasoning += delta.reasoning_content;
        yield { type: 'reasoning', delta: delta.reasoning_content };
      }

      // 2. Handle standard content text stream
      if (delta?.content) {
        fullContent += delta.content;
        yield { type: 'text', delta: delta.content };
      }

      // 3. Handle Tool Calls
      if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const index = tc.index;
          let entry = toolCallsMap.get(index);

          if (!entry) {
            entry = {
              id: tc.id || `call_${Date.now()}_${index}`,
              name: tc.function?.name || '',
              arguments: '',
            };
            toolCallsMap.set(index, entry);
            yield {
              type: 'tool_call_start',
              index,
              id: entry.id,
              name: entry.name,
            };
          }

          if (tc.function?.name && !entry.name) {
            entry.name = tc.function.name;
          }

          if (tc.function?.arguments) {
            entry.arguments += tc.function.arguments;
            yield {
              type: 'tool_call_delta',
              index,
              argumentsDelta: tc.function.arguments,
            };
          }
        }
      }
    }

    const toolCalls: ToolCall[] = Array.from(toolCallsMap.values()).map((entry) => ({
      id: entry.id,
      type: 'function',
      function: {
        name: entry.name,
        arguments: entry.arguments || '{}',
      },
    }));

    return {
      content: fullContent,
      reasoningContent: fullReasoning || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  /**
   * Execute chat completion to end
   */
  async chat(messages: ChatMessage[], options: LLMOptions = {}): Promise<LLMResponse> {
    let fullContent = '';
    let fullReasoning = '';
    const toolCalls: ToolCall[] = [];

    for await (const event of this.chatStream(messages, options)) {
      if (event.type === 'text') {
        fullContent += event.delta;
      } else if (event.type === 'reasoning') {
        fullReasoning += event.delta;
      } else if (event.type === 'tool_call_done') {
        toolCalls.push(event.toolCall);
      }
    }

    return {
      content: fullContent,
      reasoningContent: fullReasoning || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  /**
   * Fast connection probe (1-token test)
   */
  async probeConnection(model?: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    const probeModel =
      model ||
      (this.config.defaultModel && this.config.defaultModel !== 'dummy' ? this.config.defaultModel : undefined) ||
      (this.config.provider === 'deepseek'
        ? 'deepseek-v4-flash'
        : this.config.provider === 'gemini'
        ? 'gemini-3.7-flash'
        : this.config.provider === 'anthropic'
        ? 'claude-3-7-sonnet-latest'
        : this.config.provider === 'grok'
        ? 'grok-2'
        : this.config.provider === 'glm'
        ? 'glm-4-plus'
        : 'gpt-5.6-sol');

    try {
      await this.client.chat.completions.create({
        model: probeModel,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      });
      return {
        ok: true,
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (/supported\s+(?:API\s+)?models?\s+names?\s+are/i.test(errMsg)) {
        return {
          ok: true,
          latencyMs: Date.now() - start,
        };
      }
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: errMsg,
      };
    }
  }


  /**
   * Fetch dynamic remote models list from /v1/models (filtering to latest chat/reasoning models)
   */
  async listRemoteModels(): Promise<ModelMetadata[]> {
    try {
      const response = await this.client.models.list();
      const candidates: ModelMetadata[] = [];

      for (const item of response.data) {
        const id = item.id;
        if (isUtilityOrNonChatModel(id)) {
          continue;
        }

        const rawItem = item as any;
        const reportedContext =
          rawItem.context_length ||
          rawItem.context_window ||
          rawItem.max_tokens ||
          rawItem.max_input_tokens ||
          rawItem.top_provider?.context_length;

        const meta = parseModelMetadataFromId(id, this.config.provider, reportedContext);
        candidates.push(meta);
      }

      return filterLatestModels(candidates);
    } catch {
      return [];
    }
  }


  /**
   * Comprehensive model discovery and connection verification
   */
  async discoverSupportedModels(): Promise<{
    probeOk: boolean;
    latencyMs: number;
    models: ModelMetadata[];
    error?: string;
  }> {
    const start = Date.now();

    // 1. First try listing models from /v1/models endpoint
    try {
      const remote = await this.listRemoteModels();
      if (remote.length > 0) {
        return {
          probeOk: true,
          latencyMs: Date.now() - start,
          models: remote,
        };
      }
    } catch {
      // Fall through to probe
    }

    // 2. Chat completion probe to verify credentials and capture error hints
    try {
      await this.client.chat.completions.create({
        model: this.config.defaultModel || 'dummy',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      });

      const defaultMeta = this.config.defaultModel && this.config.defaultModel !== 'dummy'
        ? parseModelMetadataFromId(this.config.defaultModel, this.config.provider)
        : null;

      return {
        probeOk: true,
        latencyMs: Date.now() - start,
        models: defaultMeta ? [defaultMeta] : [],
      };
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      const extracted = extractModelsFromErrorMessage(errorMsg, this.config.provider);

      if (extracted.length > 0) {
        return {
          probeOk: true,
          latencyMs: Date.now() - start,
          models: extracted,
        };
      }

      const isAuthOrNetworkError =
        errorMsg.includes('401') ||
        errorMsg.includes('403') ||
        errorMsg.includes('400') ||
        errorMsg.includes('API_KEY_INVALID') ||
        errorMsg.includes('API key not valid') ||
        errorMsg.includes('invalid_api_key') ||
        errorMsg.includes('Incorrect API key') ||
        errorMsg.includes('Unauthorized') ||
        errorMsg.includes('Forbidden') ||
        errorMsg.includes('ECONNREFUSED') ||
        errorMsg.includes('ENOTFOUND') ||
        errorMsg.includes('ETIMEDOUT') ||
        errorMsg.includes('fetch failed');

      return {
        probeOk: !isAuthOrNetworkError,
        latencyMs: Date.now() - start,
        models: [],
        error: isAuthOrNetworkError ? errorMsg : undefined,
      };
    }
  }

  /**
   * Fast verification probe for a specific provider and API key
   */
  static async verifyApiKey(
    provider: string,
    apiKey: string,
    baseUrl?: string,
    modelId?: string
  ): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    if (!apiKey || apiKey.trim().length === 0) {
      return {
        success: false,
        latencyMs: 0,
        error: 'API Key is empty.',
      };
    }

    const start = Date.now();
    const cleanKey = apiKey.trim();
    const effectiveBaseUrl = baseUrl || 'https://api.openai.com/v1';
    const effectiveModel = modelId && modelId !== 'dummy' ? modelId : 'deepseek-chat';

    const probeClient = new LLMClient({
      apiKey: cleanKey,
      baseUrl: effectiveBaseUrl,
      defaultModel: effectiveModel,
      provider,
    });

    // 1. Try listing remote models via /v1/models endpoint
    try {
      const models = await probeClient.listRemoteModels();
      if (models && models.length > 0) {
        return { success: true, latencyMs: Date.now() - start };
      }
    } catch {
      // If endpoint doesn't support models.list, continue to chat probe
    }

    // 2. Chat completion probe with 1 token
    try {
      await probeClient.client.chat.completions.create(
        {
          model: effectiveModel,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        },
        { timeout: 8000 }
      );
      return { success: true, latencyMs: Date.now() - start };
    } catch (err: any) {
      const errMsg = err?.message || String(err);

      // Distinguish model not found (where API key is valid) from auth/quota/network failures
      const isModelOnlyError =
        (errMsg.includes('does not exist') ||
          errMsg.includes('not found') ||
          errMsg.includes('Model not found') ||
          errMsg.includes('model_not_found') ||
          errMsg.includes('404')) &&
        !errMsg.includes('API_KEY_INVALID') &&
        !errMsg.includes('API key not valid') &&
        !errMsg.includes('401') &&
        !errMsg.includes('403') &&
        !errMsg.includes('400') &&
        !errMsg.includes('Unauthorized') &&
        !errMsg.includes('Forbidden');

      if (isModelOnlyError) {
        return { success: true, latencyMs: Date.now() - start };
      }

      return {
        success: false,
        latencyMs: Date.now() - start,
        error: errMsg,
      };
    }
  }
}
