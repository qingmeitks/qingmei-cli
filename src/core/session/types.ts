import { ChatMessage, ToolCall } from '../llm/types.js';
import { TurnStats } from '../stats/types.js';

export type SessionStatus = 'ready' | 'running' | 'waiting_confirm' | 'done' | 'error';

export interface SessionSummary {
  id: string;
  name?: string;
  status: SessionStatus;
  currentAction?: string;
  messageCount: number;
  usedTokens: number;
  preview: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionInstanceCallbacks {
  onReasoningChunk?: (delta: string) => void;
  onTextChunk?: (delta: string) => void;
  onToolCallStart?: (name: string, id: string) => void;
  onToolCallResult?: (name: string, result: string, durationMs: number, success: boolean) => void;
  onConfirm?: (description: string) => Promise<boolean>;
  onStatusChange?: (status: SessionStatus, detail?: string) => void;
  onCompleted?: (finalReply: string) => void;
  onError?: (error: Error) => void;
  onTurnCompleted?: (stats: TurnStats) => void;
}
