import { ChatMessage } from './llm/types.js';
import {
  SessionSnapshot,
  generateSessionId,
  extractPreview,
  saveSessionSnapshot,
  exportSessionToMarkdown,
} from './session/storage.js';

export * from './session/types.js';
export * from './session/instance.js';
export * from './session/pool.js';
export * from './session/storage.js';

export class SessionManager {
  public sessionId: string;
  public sessionName?: string;
  public createdAt: number;
  public updatedAt: number;
  public messages: ChatMessage[] = [];

  constructor(initialSnapshot?: SessionSnapshot) {
    if (initialSnapshot) {
      this.sessionId = initialSnapshot.id;
      this.sessionName = initialSnapshot.name;
      this.createdAt = initialSnapshot.createdAt;
      this.updatedAt = initialSnapshot.updatedAt;
      this.messages = initialSnapshot.messages || [];
    } else {
      this.sessionId = generateSessionId();
      this.createdAt = Date.now();
      this.updatedAt = Date.now();
      this.messages = [];
    }
  }

  get currentSessionId(): string {
    return this.sessionId;
  }

  set currentSessionId(id: string) {
    this.sessionId = id;
  }

  addMessage(msg: ChatMessage): void {
    this.messages.push(msg);
    this.updatedAt = Date.now();
  }

  clear(): void {
    this.sessionId = generateSessionId();
    this.sessionName = undefined;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    this.messages = [];
  }

  loadSnapshot(snapshot: SessionSnapshot): void {
    this.sessionId = snapshot.id;
    this.sessionName = snapshot.name;
    this.createdAt = snapshot.createdAt || Date.now();
    this.updatedAt = snapshot.updatedAt || Date.now();
    this.messages = snapshot.messages || [];
  }

  toSnapshot(cwd: string, usedTokens = 0, nameOverride?: string): SessionSnapshot {
    return {
      id: this.sessionId,
      name: nameOverride !== undefined ? nameOverride : this.sessionName,
      cwd,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt || Date.now(),
      messageCount: this.messages.length,
      usedTokens,
      preview: extractPreview(this.messages),
      messages: [...this.messages],
    };
  }

  save(cwd: string, usedTokens = 0, name?: string): SessionSnapshot {
    if (name) {
      this.sessionName = name;
    }
    const snapshot = this.toSnapshot(cwd, usedTokens, this.sessionName);
    saveSessionSnapshot(snapshot);
    return snapshot;
  }

  exportToMarkdown(targetPath?: string, cwd = process.cwd(), usedTokens = 0): string {
    const snapshot = this.toSnapshot(cwd, usedTokens);
    return exportSessionToMarkdown(snapshot, targetPath);
  }
}
