import { ChatMessage } from '../llm/types.js';
import { estimateTokenCount } from '../context.js';

export interface CompactionResult {
  compactedMessages: ChatMessage[];
  savedTokens: number;
  foldedToolOutputsCount: number;
  summarizedMessagesCount: number;
}

/**
 * Micro-Compaction: Fold overly large tool execution outputs in older history turns.
 * Retains high-level heads and tails while omitting repetitive intermediate log streams.
 */
export function foldToolOutputs(
  messages: ChatMessage[],
  maxChars = 1500,
  recentPreserveCount = 6
): { messages: ChatMessage[]; foldedCount: number; savedChars: number } {
  if (messages.length <= recentPreserveCount) {
    return { messages: [...messages], foldedCount: 0, savedChars: 0 };
  }

  let foldedCount = 0;
  let savedChars = 0;
  const boundaryIndex = messages.length - recentPreserveCount;

  const result: ChatMessage[] = messages.map((msg, idx) => {
    // Only fold messages outside the recent window
    if (idx >= boundaryIndex) return msg;

    if (msg.role === 'tool' && msg.content && msg.content.length > maxChars) {
      const originalLen = msg.content.length;
      const headLen = Math.floor(maxChars * 0.4);
      const tailLen = Math.floor(maxChars * 0.4);
      const omittedChars = originalLen - headLen - tailLen;

      const head = msg.content.slice(0, headLen);
      const tail = msg.content.slice(-tailLen);
      const foldedContent = `${head}\n\n... [Output Folded: ${omittedChars} characters omitted for cache & context compaction] ...\n\n${tail}`;

      foldedCount++;
      savedChars += omittedChars;

      return {
        ...msg,
        content: foldedContent,
      };
    }

    return msg;
  });

  return { messages: result, foldedCount, savedChars };
}

/**
 * Extract concise structured summary points from older dialogue turns.
 */
export function extractStructuredMemory(messages: ChatMessage[]): string {
  const userRequests: string[] = [];
  const filesTouched = new Set<string>();
  const decisions: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'user' && msg.content) {
      // Extract brief user intent
      const lines = msg.content.trim().split('\n').filter(Boolean);
      if (lines.length > 0) {
        userRequests.push(lines[0].slice(0, 120));
      }
    } else if (msg.role === 'assistant') {
      if (msg.content) {
        // Look for summary bullet points or completion notices
        const keyLines = msg.content
          .split('\n')
          .filter((l) => l.startsWith('-') || l.startsWith('*') || l.includes('✓') || l.includes('完成了'))
          .slice(0, 3);
        for (const kl of keyLines) {
          decisions.push(kl.trim().slice(0, 120));
        }
      }
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          try {
            const args = JSON.parse(tc.function.arguments || '{}');
            if (args.TargetFile) filesTouched.add(args.TargetFile);
            if (args.FilePath) filesTouched.add(args.FilePath);
            if (args.AbsolutePath) filesTouched.add(args.AbsolutePath);
          } catch {
            // ignore
          }
        }
      }
    }
  }

  const sections: string[] = ['# [Working Context Memory (Auto-Compacted)]'];
  if (userRequests.length > 0) {
    sections.push('### Key User Instructions & Goals:');
    sections.push(userRequests.slice(-5).map((r) => `- ${r}`).join('\n'));
  }

  if (filesTouched.size > 0) {
    sections.push('### Core Files & Artifacts Context:');
    sections.push(Array.from(filesTouched).slice(-10).map((f) => `- \`${f}\``).join('\n'));
  }

  if (decisions.length > 0) {
    sections.push('### Key Actions & Architectural Decisions:');
    sections.push(decisions.slice(-6).map((d) => (d.startsWith('-') ? d : `- ${d}`)).join('\n'));
  }

  return sections.join('\n\n');
}

/**
 * Macro-Compaction: Compress older dialogue history into a structured Working Context Memory.
 */
export function compactDialogueHistory(
  history: ChatMessage[],
  recentWindow = 10,
  maxToolOutputChars = 1500
): CompactionResult {
  const initialTokens = history.reduce((acc, m) => acc + estimateTokenCount(m.content || ''), 0);

  // 1. Apply micro tool folding
  const { messages: foldedHistory, foldedCount } = foldToolOutputs(
    history,
    maxToolOutputChars,
    recentWindow
  );

  if (foldedHistory.length <= recentWindow) {
    const finalTokens = foldedHistory.reduce((acc, m) => acc + estimateTokenCount(m.content || ''), 0);
    return {
      compactedMessages: foldedHistory,
      savedTokens: Math.max(0, initialTokens - finalTokens),
      foldedToolOutputsCount: foldedCount,
      summarizedMessagesCount: 0,
    };
  }

  // 2. Separate into archive zone and recent active window
  const splitIndex = foldedHistory.length - recentWindow;
  const archiveMessages = foldedHistory.slice(0, splitIndex);
  const recentMessages = foldedHistory.slice(splitIndex);

  // 3. Synthesize structured memory
  const memoryContent = extractStructuredMemory(archiveMessages);
  const memoryMessage: ChatMessage = {
    role: 'assistant',
    content: memoryContent,
  };

  const compactedMessages = [memoryMessage, ...recentMessages];
  const finalTokens = compactedMessages.reduce((acc, m) => acc + estimateTokenCount(m.content || ''), 0);
  const savedTokens = Math.max(0, initialTokens - finalTokens);

  return {
    compactedMessages,
    savedTokens,
    foldedToolOutputsCount: foldedCount,
    summarizedMessagesCount: archiveMessages.length,
  };
}
