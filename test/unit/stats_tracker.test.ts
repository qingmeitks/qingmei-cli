import { describe, it, expect } from 'vitest';
import { extractTokenUsage } from '../../src/core/llm/client.js';
import {
  SessionTracker,
  formatDuration,
  formatNumber,
  formatTurnSummary,
  formatExitSummary,
} from '../../src/core/stats/tracker.js';

describe('Token Usage Extraction and Metrics Calculation', () => {
  it('correctly extracts standard OpenAI usage with prompt_tokens_details', () => {
    const rawUsage = {
      prompt_tokens: 2000,
      completion_tokens: 500,
      total_tokens: 2500,
      prompt_tokens_details: {
        cached_tokens: 1500,
      },
      completion_tokens_details: {
        reasoning_tokens: 200,
      },
    };

    const usage = extractTokenUsage(rawUsage);
    expect(usage.promptTokens).toBe(2000);
    expect(usage.completionTokens).toBe(500);
    expect(usage.totalTokens).toBe(2500);
    expect(usage.cachedTokens).toBe(1500);
    expect(usage.cacheHitRate).toBe(75.0); // (1500 / 2000) * 100
    expect(usage.reasoningTokens).toBe(200);
  });

  it('correctly extracts DeepSeek prompt_cache_hit_tokens', () => {
    const rawUsage = {
      prompt_tokens: 1000,
      completion_tokens: 200,
      total_tokens: 1200,
      prompt_cache_hit_tokens: 800,
      prompt_cache_miss_tokens: 200,
    };

    const usage = extractTokenUsage(rawUsage);
    expect(usage.promptTokens).toBe(1000);
    expect(usage.completionTokens).toBe(200);
    expect(usage.cachedTokens).toBe(800);
    expect(usage.cacheHitRate).toBe(80.0);
  });

  it('gracefully handles missing/null usage and 0 tokens (avoids NaN)', () => {
    const usageNull = extractTokenUsage(null);
    expect(usageNull.promptTokens).toBe(0);
    expect(usageNull.cachedTokens).toBe(0);
    expect(usageNull.cacheHitRate).toBe(0);

    const usageZero = extractTokenUsage({ prompt_tokens: 0, completion_tokens: 0 });
    expect(usageZero.cacheHitRate).toBe(0);
    expect(Number.isNaN(usageZero.cacheHitRate)).toBe(false);
  });
});

describe('SessionTracker and Activity Aggregation', () => {
  it('accumulates multi-turn token usage and overall cache hit rate', () => {
    const tracker = new SessionTracker();

    // Turn 1: 1000 in, 500 cached (50%), 200 out
    tracker.recordTurn(
      {
        promptTokens: 1000,
        completionTokens: 200,
        totalTokens: 1200,
        cachedTokens: 500,
        cacheHitRate: 50.0,
      },
      1200
    );

    // Turn 2: 2000 in, 1800 cached (90%), 300 out (reasoning: 100)
    tracker.recordTurn(
      {
        promptTokens: 2000,
        completionTokens: 300,
        totalTokens: 2300,
        cachedTokens: 1800,
        cacheHitRate: 90.0,
        reasoningTokens: 100,
      },
      2500
    );

    const summary = tracker.getUsageSummary();
    expect(summary.totalRequests).toBe(2);
    expect(summary.totalPromptTokens).toBe(3000);
    expect(summary.totalCompletionTokens).toBe(500);
    expect(summary.totalCachedTokens).toBe(2300);
    expect(summary.totalReasoningTokens).toBe(100);
    // Overall rate: (2300 / 3000) * 100 = 76.7%
    expect(summary.overallCacheHitRate).toBe(76.7);
    expect(summary.lastTurn?.durationMs).toBe(2500);
    expect(summary.lastTurn?.usage?.promptTokens).toBe(2000);
  });

  it('records tool activity and failure/success stats', () => {
    const tracker = new SessionTracker();
    tracker.recordToolCall('read_file', 30, true);
    tracker.recordToolCall('read_file', 20, true);
    tracker.recordToolCall('bash', 150, false);

    const activity = tracker.getActivitySummary();
    expect(activity.totalToolCalls).toBe(3);
    expect(activity.successfulToolCalls).toBe(2);
    expect(activity.failedToolCalls).toBe(1);
    expect(activity.toolStats['read_file'].calls).toBe(2);
    expect(activity.toolStats['read_file'].totalDurationMs).toBe(50);
    expect(activity.toolStats['bash'].failures).toBe(1);
  });

  it('resets correctly on session reset', () => {
    const tracker = new SessionTracker();
    tracker.recordTurn({ promptTokens: 500, completionTokens: 100, totalTokens: 600, cachedTokens: 200, cacheHitRate: 40 }, 500);
    tracker.reset();

    const summary = tracker.getUsageSummary();
    expect(summary.totalRequests).toBe(0);
    expect(summary.totalPromptTokens).toBe(0);
    expect(summary.totalCachedTokens).toBe(0);
    expect(summary.overallCacheHitRate).toBe(0);
  });
});

describe('Text Formatters (Minimalist / No Emojis)', () => {
  it('formats duration properly', () => {
    expect(formatDuration(450)).toBe('450ms');
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(65000)).toBe('1m 5s');
  });

  it('formats turn summary with cache and reasoning', () => {
    const turnWithCache = {
      durationMs: 1400,
      usage: {
        promptTokens: 1200,
        completionTokens: 300,
        totalTokens: 1500,
        cachedTokens: 1000,
        cacheHitRate: 83.3,
        reasoningTokens: 150,
      },
    };

    const text = formatTurnSummary(turnWithCache);
    expect(text).toBe('[1.4s | in: 1,200 (cached: 1,000, 83.3%) | out: 300 (reasoning: 150)]');
    // Ensure no emoji characters
    expect(/[\u{1F300}-\u{1F9FF}]/u.test(text)).toBe(false);
  });

  it('formats turn summary without cache', () => {
    const turnWithoutCache = {
      durationMs: 950,
      usage: {
        promptTokens: 400,
        completionTokens: 120,
        totalTokens: 520,
        cachedTokens: 0,
        cacheHitRate: 0,
      },
    };

    const text = formatTurnSummary(turnWithoutCache);
    expect(text).toBe('[950ms | in: 400 | out: 120]');
  });

  it('formats exit summary cleanly when requests exist, and returns null when empty', () => {
    const tracker = new SessionTracker();
    expect(formatExitSummary(tracker.getActivitySummary())).toBeNull();

    tracker.recordTurn(
      {
        promptTokens: 5000,
        completionTokens: 800,
        totalTokens: 5800,
        cachedTokens: 4000,
        cacheHitRate: 80.0,
      },
      3000
    );

    const exitText = formatExitSummary(tracker.getActivitySummary());
    expect(exitText).not.toBeNull();
    expect(exitText).toContain('█▀█ █ █▄ █ █▀▀ █▀▄▀█ █▀▀ █');
    expect(exitText).toContain('v0.1.3');
    expect(exitText).toContain('Duration:   ');
    expect(exitText).toContain('Turns:      1');
    expect(exitText).toContain('Input:      5,000 (cached: 4,000, 80%)');
    expect(exitText).toContain('Output:     800');
    expect(exitText).toContain('Total:      5,800');
    // Ensure no emoji characters
    expect(/[\u{1F300}-\u{1F9FF}]/u.test(exitText!)).toBe(false);
  });
});
