import chalk from 'chalk';
import { TokenUsage } from '../llm/types.js';
import { ToolActivityStats, TurnStats, UsageSummary, ActivitySummary } from './types.js';

export const APP_VERSION = 'v0.1.1';
export const QINGMEI_LOGO_LINES = [
  '█▀█ █ █▄ █ █▀▀ █▀▄▀█ █▀▀ █',
  '▀▀█ █ █ ▀█ █▄█ █ ▀ █ ██▄ █',
];

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

export function formatNumber(n: number): string {
  return Number(n || 0).toLocaleString('en-US');
}

export function formatTurnSummary(turn: TurnStats): string {
  const dur = formatDuration(turn.durationMs);
  if (!turn.usage) {
    return `[${dur}]`;
  }

  const prompt = formatNumber(turn.usage.promptTokens);
  const completion = formatNumber(turn.usage.completionTokens);

  let inPart = prompt;
  if (turn.usage.cachedTokens > 0) {
    inPart += ` (cached: ${formatNumber(turn.usage.cachedTokens)}, ${turn.usage.cacheHitRate}%)`;
  }

  let outPart = completion;
  if (turn.usage.reasoningTokens && turn.usage.reasoningTokens > 0) {
    outPart += ` (reasoning: ${formatNumber(turn.usage.reasoningTokens)})`;
  }

  return `[${dur} | in: ${inPart} | out: ${outPart}]`;
}

export function formatExitSummary(activity: ActivitySummary): string | null {
  if (activity.usage.totalRequests === 0) {
    return null;
  }

  const dur = formatDuration(activity.durationMs);
  const inStr = formatNumber(activity.usage.totalPromptTokens);
  const outStr = formatNumber(activity.usage.totalCompletionTokens);
  const totalTokens = activity.usage.totalPromptTokens + activity.usage.totalCompletionTokens;

  let inDetail = inStr;
  if (activity.usage.totalCachedTokens > 0) {
    inDetail += ` (cached: ${formatNumber(activity.usage.totalCachedTokens)}, ${activity.usage.overallCacheHitRate}%)`;
  }

  let outDetail = outStr;
  if (activity.usage.totalReasoningTokens > 0) {
    outDetail += ` (reasoning: ${formatNumber(activity.usage.totalReasoningTokens)})`;
  }

  const lines: string[] = [
    `${chalk.bold.cyanBright(QINGMEI_LOGO_LINES[0])}   ${chalk.bold.whiteBright(APP_VERSION)}`,
    chalk.bold.cyanBright(QINGMEI_LOGO_LINES[1]),
    '',
    `Duration:   ${dur}`,
    `Turns:      ${activity.turns}`,
    `Input:      ${inDetail}`,
    `Output:     ${outDetail}`,
    `Total:      ${formatNumber(totalTokens)}`,
  ];

  return lines.join('\n');
}

export class SessionTracker {
  private startTime = Date.now();
  private turns = 0;
  private totalPromptTokens = 0;
  private totalCompletionTokens = 0;
  private totalCachedTokens = 0;
  private totalReasoningTokens = 0;
  private totalRequests = 0;
  private lastTurn?: TurnStats;
  private toolStats = new Map<string, ToolActivityStats>();

  recordTurn(usage?: TokenUsage, durationMs = 0): void {
    this.turns++;
    if (usage && (usage.promptTokens > 0 || usage.completionTokens > 0)) {
      this.totalRequests++;
      this.totalPromptTokens += usage.promptTokens;
      this.totalCompletionTokens += usage.completionTokens;
      this.totalCachedTokens += usage.cachedTokens;
      if (usage.reasoningTokens) {
        this.totalReasoningTokens += usage.reasoningTokens;
      }
    }
    this.lastTurn = {
      durationMs,
      usage,
    };
  }

  recordToolCall(name: string, durationMs: number, success: boolean): void {
    const existing = this.toolStats.get(name) || {
      calls: 0,
      successes: 0,
      failures: 0,
      totalDurationMs: 0,
    };

    existing.calls += 1;
    if (success) {
      existing.successes += 1;
    } else {
      existing.failures += 1;
    }
    existing.totalDurationMs += durationMs;
    this.toolStats.set(name, existing);
  }

  getLastTurn(): TurnStats | undefined {
    return this.lastTurn;
  }

  getUsageSummary(): UsageSummary {
    const overallRate =
      this.totalPromptTokens > 0
        ? Math.round((this.totalCachedTokens / this.totalPromptTokens) * 1000) / 10
        : 0;

    return {
      totalRequests: this.totalRequests,
      totalPromptTokens: this.totalPromptTokens,
      totalCompletionTokens: this.totalCompletionTokens,
      totalReasoningTokens: this.totalReasoningTokens,
      totalCachedTokens: this.totalCachedTokens,
      overallCacheHitRate: overallRate,
      lastTurn: this.lastTurn,
    };
  }

  getActivitySummary(): ActivitySummary {
    const usage = this.getUsageSummary();
    const toolObj: Record<string, ToolActivityStats> = {};
    let totalToolCalls = 0;
    let successfulToolCalls = 0;
    let failedToolCalls = 0;

    for (const [name, stat] of this.toolStats.entries()) {
      toolObj[name] = { ...stat };
      totalToolCalls += stat.calls;
      successfulToolCalls += stat.successes;
      failedToolCalls += stat.failures;
    }

    return {
      durationMs: Date.now() - this.startTime,
      turns: this.turns,
      toolStats: toolObj,
      totalToolCalls,
      successfulToolCalls,
      failedToolCalls,
      usage,
    };
  }

  reset(): void {
    this.startTime = Date.now();
    this.turns = 0;
    this.totalPromptTokens = 0;
    this.totalCompletionTokens = 0;
    this.totalCachedTokens = 0;
    this.totalReasoningTokens = 0;
    this.totalRequests = 0;
    this.lastTurn = undefined;
    this.toolStats.clear();
  }
}
