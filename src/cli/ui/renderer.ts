import { marked } from 'marked';
// @ts-ignore
import { markedTerminal } from 'marked-terminal';
import chalk from 'chalk';

marked.use(
  markedTerminal({
    showSectionPrefix: false,
    tab: 2,
  }) as any
);

export class TerminalRenderer {
  static renderMarkdown(md: string): string {
    try {
      return (marked.parse(md) as string).trim();
    } catch {
      return md;
    }
  }

  static printToolCall(toolName: string, args: Record<string, any> | string): void {
    const argsStr =
      typeof args === 'string'
        ? args
        : Object.entries(args)
            .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
            .join(', ');
    const preview = argsStr.length > 80 ? `${argsStr.slice(0, 80)}...` : argsStr;
    console.log(chalk.cyan(`> call: ${toolName} (${preview})`));
  }

  static printToolResult(
    toolName: string,
    success: boolean,
    durationMs: number,
    outputLength?: number,
    error?: string
  ): void {
    if (success) {
      const sizeStr = outputLength ? `, ${outputLength}B` : '';
      console.log(chalk.dim(`< done (${durationMs}ms${sizeStr})\n`));
    } else {
      console.log(chalk.red(`< failed (${durationMs}ms): ${error || 'Unknown error'}\n`));
    }
  }

  static printReasoning(reasoning: string): void {
    if (!reasoning.trim()) return;
    console.log(chalk.gray(`[thinking: ${reasoning.trim().replace(/\n/g, ' ')}]`));
  }
}
