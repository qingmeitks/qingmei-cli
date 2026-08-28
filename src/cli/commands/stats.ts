import chalk from 'chalk';
import { QingmeiAgent } from '../../core/agent.js';
import { TuiPrompt } from '../ui/prompt.js';
import { formatDuration, formatNumber } from '../../core/stats/tracker.js';

export async function handleUsageCommand(
  _arg: string,
  agent: QingmeiAgent,
  tuiPrompt: TuiPrompt
): Promise<void> {
  const usage = agent.tracker.getUsageSummary();

  const lines: string[] = [
    chalk.bold('--- Token Usage & Cache Summary ---'),
    `Requests:             ${formatNumber(usage.totalRequests)}`,
    `Input Tokens:         ${formatNumber(usage.totalPromptTokens)}`,
  ];

  if (usage.totalCachedTokens > 0 || usage.totalPromptTokens > 0) {
    lines.push(
      `  - Cached Tokens:    ${formatNumber(usage.totalCachedTokens)} (${usage.overallCacheHitRate}% hit rate)`
    );
  }

  lines.push(`Output Tokens:        ${formatNumber(usage.totalCompletionTokens)}`);

  if (usage.totalReasoningTokens > 0) {
    lines.push(`  - Reasoning Tokens: ${formatNumber(usage.totalReasoningTokens)}`);
  }

  const total = usage.totalPromptTokens + usage.totalCompletionTokens;
  lines.push(`Total Tokens:         ${formatNumber(total)}`);

  if (usage.lastTurn && usage.lastTurn.usage) {
    const lt = usage.lastTurn.usage;
    lines.push('');
    lines.push(chalk.dim('Last Turn:'));
    lines.push(
      chalk.dim(
        `  Input: ${formatNumber(lt.promptTokens)} (cached: ${formatNumber(lt.cachedTokens)}, ${lt.cacheHitRate}%) | Output: ${formatNumber(lt.completionTokens)} | Duration: ${formatDuration(usage.lastTurn.durationMs)}`
      )
    );
  }

  lines.push(chalk.dim('-----------------------------------'));

  for (const line of lines) {
    tuiPrompt.addHistory(line);
  }
  tuiPrompt.addHistory('');
}

export async function handleStatsCommand(
  _arg: string,
  agent: QingmeiAgent,
  tuiPrompt: TuiPrompt
): Promise<void> {
  const activity = agent.tracker.getActivitySummary();
  const contextUsage = agent.getContextUsage();

  const lines: string[] = [
    chalk.bold('--- Session Activity Diagnostics ---'),
    `Session ID:       ${agent.session.sessionId}`,
    `Duration:         ${formatDuration(activity.durationMs)}`,
    `Dialogue Turns:   ${formatNumber(activity.turns)}`,
    `LLM Requests:     ${formatNumber(activity.usage.totalRequests)}`,
    `Context Usage:    ${contextUsage.display}`,
  ];

  const toolEntries = Object.entries(activity.toolStats);
  if (toolEntries.length > 0) {
    lines.push('');
    lines.push('Tool Invocations:');
    for (const [name, stat] of toolEntries) {
      lines.push(
        `  - ${name}: ${stat.calls} calls (${stat.successes} ok, ${stat.failures} err, ${formatDuration(stat.totalDurationMs)})`
      );
    }
  } else {
    lines.push('');
    lines.push('Tool Invocations: (none)');
  }

  lines.push('');
  lines.push('Token Totals:');
  let inStr = `  - Input:  ${formatNumber(activity.usage.totalPromptTokens)}`;
  if (activity.usage.totalCachedTokens > 0) {
    inStr += ` (cached: ${formatNumber(activity.usage.totalCachedTokens)}, ${activity.usage.overallCacheHitRate}%)`;
  }
  lines.push(inStr);

  let outStr = `  - Output: ${formatNumber(activity.usage.totalCompletionTokens)}`;
  if (activity.usage.totalReasoningTokens > 0) {
    outStr += ` (reasoning: ${formatNumber(activity.usage.totalReasoningTokens)})`;
  }
  lines.push(outStr);

  const total = activity.usage.totalPromptTokens + activity.usage.totalCompletionTokens;
  lines.push(`  - Total:  ${formatNumber(total)}`);

  lines.push(chalk.dim('------------------------------------'));

  for (const line of lines) {
    tuiPrompt.addHistory(line);
  }
  tuiPrompt.addHistory('');
}
