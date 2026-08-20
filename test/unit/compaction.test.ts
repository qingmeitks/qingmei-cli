import { describe, it, expect } from 'vitest';
import {
  foldToolOutputs,
  extractStructuredMemory,
  compactDialogueHistory,
} from '../../src/core/context/compressor.js';
import { ContextManager } from '../../src/core/context.js';
import { QingmeiAgent } from '../../src/core/agent.js';
import { LLMClient } from '../../src/core/llm/client.js';
import { getModelMetadata } from '../../src/config/loader.js';
import { ChatMessage } from '../../src/core/llm/types.js';

describe('Context Caching & Auto-Compaction Engine', () => {
  it('should fold overly large tool outputs in older history turns (Micro-Compaction)', () => {
    const hugeToolOutput = 'A'.repeat(5000);
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Read huge file' },
      { role: 'tool', content: hugeToolOutput, tool_call_id: 'call_1' },
      { role: 'assistant', content: 'Analyzed file.' },
      // Recent window (last 2 messages)
      { role: 'user', content: 'Next step' },
      { role: 'assistant', content: 'Ready.' },
    ];

    const { messages: folded, foldedCount, savedChars } = foldToolOutputs(messages, 1000, 2);

    expect(foldedCount).toBe(1);
    expect(savedChars).toBeGreaterThan(3000);
    expect(folded[1].content).toContain('[Output Folded:');
    expect(folded[1].content!.length).toBeLessThan(1200);
    // Recent window should remain untouched
    expect(folded[3].content).toBe('Next step');
    expect(folded[4].content).toBe('Ready.');
  });

  it('should extract structured memory from archive messages', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Fix the bug in src/core/agent.ts and src/cli/ui/prompt.ts' },
      {
        role: 'assistant',
        content: '- Fixed the null check error in agent.\n- Updated UI banner.',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'replace_file_content',
              arguments: JSON.stringify({ TargetFile: '/path/to/agent.ts' }),
            },
          },
        ],
      },
    ];

    const memory = extractStructuredMemory(messages);
    expect(memory).toContain('# [Working Context Memory (Auto-Compacted)]');
    expect(memory).toContain('Fix the bug in src/core/agent.ts');
    expect(memory).toContain('/path/to/agent.ts');
    expect(memory).toContain('Fixed the null check error');
  });

  it('should compact dialogue history and reduce total token footprint (Macro-Compaction)', () => {
    const history: ChatMessage[] = [];
    for (let i = 1; i <= 20; i++) {
      history.push({ role: 'user', content: `Task number ${i}: do something with code ${'X'.repeat(200)}` });
      history.push({ role: 'assistant', content: `Finished task ${i} successfully.` });
    }

    const result = compactDialogueHistory(history, 6, 1500);

    expect(result.summarizedMessagesCount).toBeGreaterThan(0);
    expect(result.savedTokens).toBeGreaterThan(500);
    expect(result.compactedMessages.length).toBeLessThan(history.length);
    expect(result.compactedMessages[0].content).toContain('[Working Context Memory');
  });

  it('should maintain static cache-friendly system prompt prefix in ContextManager', () => {
    const model = getModelMetadata('deepseek-chat', 'deepseek');
    const contextManager = new ContextManager({
      workingDirectory: '/workspace/test',
      activeModel: model,
    });

    const prompt1 = contextManager.buildSystemPrompt();
    const prompt2 = contextManager.buildSystemPrompt();

    // Invariant static prefix should be 100% identical across invocations to hit KV cache
    expect(prompt1).toBe(prompt2);
    expect(prompt1.startsWith('You are Qingmei (青梅)')).toBe(true);
  });

  it('should allow manual compaction via agent.compactSession()', () => {
    const model = getModelMetadata('deepseek-chat', 'deepseek');
    const llmClient = new LLMClient({
      apiKey: 'test-key',
      baseUrl: 'https://api.deepseek.com/v1',
      defaultModel: 'deepseek-chat',
      provider: 'deepseek',
    });

    const agent = new QingmeiAgent({
      workingDirectory: '/workspace/test',
      securityMode: 'interactive',
      llmClient,
      activeModel: model,
      compactionConfig: {
        enabled: true,
        thresholdPercentage: 60,
        recentWindowMessages: 4,
        maxToolOutputChars: 1000,
      },
    });

    for (let i = 1; i <= 10; i++) {
      agent.session.addMessage({ role: 'user', content: `Step ${i}: inspect component ${i}` });
      agent.session.addMessage({ role: 'assistant', content: `Result for step ${i}` });
    }

    const initialCount = agent.session.messages.length;
    const result = agent.compactSession();

    expect(result.summarizedMessagesCount).toBeGreaterThan(0);
    expect(agent.session.messages.length).toBeLessThan(initialCount);
    expect(agent.session.messages[0].content).toContain('[Working Context Memory');
  });
});
