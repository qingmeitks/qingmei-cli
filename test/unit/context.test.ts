import { describe, it, expect } from 'vitest';
import { ContextManager, estimateTokenCount, formatTokenNumber } from '../../src/core/context.js';
import { getModelMetadata } from '../../src/config/loader.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('ContextManager & Prompt Assembly (QINGMEI.md & AGENTS.md)', () => {
  it('should inject project-level AGENTS.md into System Prompt if present', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qingmei-agents-test-'));
    const agentsMdPath = path.join(tmpDir, 'AGENTS.md');
    fs.writeFileSync(
      agentsMdPath,
      'Project Guideline: Always use pnpm and follow strict clean architecture.',
      'utf-8'
    );

    const model = getModelMetadata('deepseek-chat', 'deepseek');
    const contextManager = new ContextManager({
      workingDirectory: tmpDir,
      activeModel: model,
    });

    const prompt = contextManager.buildSystemPrompt();
    expect(prompt).toContain('# Project Guidelines (AGENTS.md):');
    expect(prompt).toContain('Always use pnpm and follow strict clean architecture.');

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should accurately estimate token counts for mixed CJK, English and code', () => {
    expect(estimateTokenCount('')).toBe(0);

    // English text
    const enTokens = estimateTokenCount('Hello world! How are you doing today?');
    expect(enTokens).toBeGreaterThan(5);
    expect(enTokens).toBeLessThan(15);

    // CJK text
    const zhTokens = estimateTokenCount('青梅是一个自主终端智能助手');
    expect(zhTokens).toBeGreaterThan(10);

    // Format token numbers
    expect(formatTokenNumber(500)).toBe('500');
    expect(formatTokenNumber(1500)).toBe('1.5k');
    expect(formatTokenNumber(2000)).toBe('2k');
    expect(formatTokenNumber(1000000)).toBe('1M');
    expect(formatTokenNumber(1250000)).toBe('1.25M');
  });

  it('should compute context usage with percentage and formatted display', () => {
    const model = getModelMetadata('deepseek-v4-flash', 'deepseek');
    const contextManager = new ContextManager({
      workingDirectory: '/workspace',
      activeModel: model,
    });

    const usage = contextManager.getContextUsage([
      { role: 'user', content: 'Explain quantum computing in detail.' },
      { role: 'assistant', content: 'Quantum computing is a multidisciplinary field...' },
    ]);

    expect(usage.usedTokens).toBeGreaterThan(50);
    expect(usage.totalTokens).toBe(1000000);
    expect(usage.display).toContain('/1M');
    expect(usage.display).toContain('%');
  });
});

