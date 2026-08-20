import fs from 'fs';
import path from 'path';
import { ChatMessage } from './llm/types.js';
import { ModelMetadata, CompactionConfig } from '../config/types.js';
import { SkillManager } from '../skills/manager.js';
import { GLOBAL_INSTRUCTIONS_PATH } from '../config/defaults.js';
import {
  foldToolOutputs,
  compactDialogueHistory,
  CompactionResult,
} from './context/compressor.js';

export interface ContextOptions {
  workingDirectory: string;
  activeModel: ModelMetadata;
  skillManager?: SkillManager;
  compactionConfig?: CompactionConfig;
}

export interface ContextUsage {
  usedTokens: number;
  totalTokens: number;
  percentage: number;
  display: string;
}

export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  // Match CJK characters
  const cjkMatches = text.match(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;

  // Non-CJK text
  const nonCjkText = text.replace(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, ' ');
  const words = nonCjkText.trim().split(/\s+/).filter(Boolean);

  const wordTokens = words.reduce((acc, word) => {
    if (word.length > 8) {
      return acc + Math.ceil(word.length / 3.5);
    }
    return acc + 1.2;
  }, 0);

  return Math.ceil(cjkCount * 1.3 + wordTokens);
}

export function formatTokenNumber(num: number): string {
  if (num < 1000) return `${num}`;
  if (num < 1000000) {
    const k = (num / 1000).toFixed(1);
    return k.endsWith('.0') ? `${parseInt(k, 10)}k` : `${k}k`;
  }
  const m = (num / 1000000).toFixed(2);
  return m.endsWith('.00') ? `${parseInt(m, 10)}M` : `${m}M`;
}

export class ContextManager {
  private options: ContextOptions;

  constructor(options: ContextOptions) {
    this.options = options;
  }

  updateModel(model: ModelMetadata): void {
    this.options.activeModel = model;
  }

  updateCompactionConfig(config: CompactionConfig): void {
    this.options.compactionConfig = config;
  }

  /**
   * Calculate current context usage based on system prompt and session history
   */
  getContextUsage(history: ChatMessage[] = []): ContextUsage {
    const preparedMessages = this.prepareMessages(history);
    let totalCharsTokens = 0;

    for (const msg of preparedMessages) {
      // 4 tokens overhead per message (role, structure)
      totalCharsTokens += 4;
      if (msg.content) {
        totalCharsTokens += estimateTokenCount(msg.content);
      }
      if (msg.reasoning_content) {
        totalCharsTokens += estimateTokenCount(msg.reasoning_content);
      }
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          totalCharsTokens +=
            estimateTokenCount(tc.function.name) + estimateTokenCount(tc.function.arguments) + 6;
        }
      }
    }

    const totalBudget = this.options.activeModel.contextWindow || 200000;
    const percentage = totalBudget > 0 ? (totalCharsTokens / totalBudget) * 100 : 0;

    const usedDisplay = formatTokenNumber(totalCharsTokens);
    const totalDisplay = this.options.activeModel.is1MContext
      ? '1M'
      : formatTokenNumber(totalBudget);

    const pctDisplay = percentage < 0.1 ? '<0.1%' : `${percentage.toFixed(1)}%`;

    return {
      usedTokens: totalCharsTokens,
      totalTokens: totalBudget,
      percentage,
      display: `${usedDisplay}/${totalDisplay} (${pctDisplay})`,
    };
  }

  /**
   * Read global user constraints from ~/.qingmei/QINGMEI.md
   */
  readGlobalInstructions(): string | null {
    try {
      if (fs.existsSync(GLOBAL_INSTRUCTIONS_PATH)) {
        const content = fs.readFileSync(GLOBAL_INSTRUCTIONS_PATH, 'utf-8').trim();
        return content || null;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Read project-level constraints from ./AGENTS.md or ./agents.md
   */
  readProjectInstructions(): string | null {
    try {
      const cwd = this.options.workingDirectory;
      const candidates = [
        path.join(cwd, 'AGENTS.md'),
        path.join(cwd, 'agents.md'),
        path.join(cwd, 'AGENTS.markdown'),
      ];

      for (const file of candidates) {
        if (fs.existsSync(file)) {
          const content = fs.readFileSync(file, 'utf-8').trim();
          if (content) return content;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Cache-Friendly System Prompt Assembly:
   * Aligns static and high-value invariant directives in the leading tokens to maximize KV Cache hit.
   */
  buildSystemPrompt(): string {
    const cwd = this.options.workingDirectory;
    const model = this.options.activeModel;

    const parts: string[] = [
      `You are Qingmei (青袂), a powerful autonomous AI Agent CLI operating in the user's terminal environment.`,

      ``,
      `# Base Operational Directives:`,
      `1. Be precise, truthful, and helpful. Use clear, concise markdown formatting.`,
      `2. When using tools, inspect outputs carefully and handle edge cases or errors intelligently.`,
      `3. For file operations, prefer reading relevant lines before editing.`,
      `4. Avoid verbose pleasantries; focus directly on solving the user's request.`,
    ];

    // 1. Inject Global Instructions (~/.qingmei/QINGMEI.md)
    const globalInstructions = this.readGlobalInstructions();
    if (globalInstructions) {
      parts.push(``);
      parts.push(`# Global User Directives (~/.qingmei/QINGMEI.md):`);
      parts.push(globalInstructions);
    }

    // 2. Inject Project Instructions (./AGENTS.md)
    const projectInstructions = this.readProjectInstructions();
    if (projectInstructions) {
      parts.push(``);
      parts.push(`# Project Guidelines (AGENTS.md):`);
      parts.push(projectInstructions);
    }

    // 3. Inject Active Domain Skills
    if (this.options.skillManager) {
      const skillsSection = this.options.skillManager.buildSystemPromptSection();
      if (skillsSection) {
        parts.push(``);
        parts.push(skillsSection);
      }
    }

    // 4. Runtime metadata
    parts.push(``);
    parts.push(`Working Directory: ${cwd}`);
    parts.push(`Current Model: ${model.name} (${model.is1MContext ? '1M Context' : `${Math.round(model.contextWindow / 1000)}k Context`})`);

    return parts.join('\n');
  }

  /**
   * Run explicit manual or auto compaction on dialogue history
   */
  compactHistory(history: ChatMessage[]): CompactionResult {
    const recentWindow = this.options.compactionConfig?.recentWindowMessages ?? 10;
    const maxToolChars = this.options.compactionConfig?.maxToolOutputChars ?? 1500;
    return compactDialogueHistory(history, recentWindow, maxToolChars);
  }

  /**
   * Prepare optimized message payload with micro-folding and auto-compaction
   */
  prepareMessages(history: ChatMessage[]): ChatMessage[] {
    const is1M = this.options.activeModel.is1MContext;
    const systemPrompt = this.buildSystemPrompt();

    const systemMessage: ChatMessage = {
      role: 'system',
      content: systemPrompt,
    };

    const compaction = this.options.compactionConfig;
    const maxToolChars = compaction?.maxToolOutputChars ?? 1500;
    const recentWindow = compaction?.recentWindowMessages ?? 10;
    const thresholdPct = compaction?.thresholdPercentage ?? 60;

    // Apply micro tool output folding to older messages
    const { messages: foldedHistory } = foldToolOutputs(history, maxToolChars, recentWindow);

    // If compaction is disabled, return folded messages
    if (compaction && compaction.enabled === false) {
      return [systemMessage, ...foldedHistory];
    }

    // Estimate current token usage of the session
    const currentTokens = foldedHistory.reduce((acc, m) => acc + estimateTokenCount(m.content || ''), 0);
    const totalBudget = this.options.activeModel.contextWindow || 200000;
    const usagePct = totalBudget > 0 ? (currentTokens / totalBudget) * 100 : 0;

    // If usage exceeds threshold or message count is very high (> 40), trigger auto-compaction
    if (usagePct >= thresholdPct || (!is1M && foldedHistory.length > 30)) {
      const compacted = compactDialogueHistory(foldedHistory, recentWindow, maxToolChars);
      return [systemMessage, ...compacted.compactedMessages];
    }

    return [systemMessage, ...foldedHistory];
  }
}

