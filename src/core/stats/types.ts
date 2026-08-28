import { TokenUsage } from '../llm/types.js';

export interface ToolActivityStats {
  calls: number;
  successes: number;
  failures: number;
  totalDurationMs: number;
}

export interface TurnStats {
  durationMs: number;
  usage?: TokenUsage;
}

export interface UsageSummary {
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalReasoningTokens: number;
  totalCachedTokens: number;
  overallCacheHitRate: number; // 0.0 ~ 100.0%
  lastTurn?: TurnStats;
}

export interface ActivitySummary {
  durationMs: number;
  turns: number;
  toolStats: Record<string, ToolActivityStats>;
  totalToolCalls: number;
  successfulToolCalls: number;
  failedToolCalls: number;
  usage: UsageSummary;
}
