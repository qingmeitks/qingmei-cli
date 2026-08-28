import { describe, it, expect, vi } from 'vitest';
import { MultiSessionPool } from '../../src/core/session/pool.js';
import { ToolDispatcher } from '../../src/core/dispatcher.js';
import { LLMClient } from '../../src/core/llm/client.js';
import { getModelMetadata } from '../../src/config/loader.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('MultiSessionPool & Session Concurrency', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qingmei-pool-test-'));
  const model = getModelMetadata('deepseek-chat', 'deepseek');
  const mockLLMClient = new LLMClient({
    apiKey: 'mock-key',
    baseUrl: 'https://api.mock.com/v1',
    defaultModel: 'deepseek-chat',
    provider: 'deepseek',
  });
  const dispatcher = new ToolDispatcher();

  it('should initialize with default Session #1 in ready status', () => {
    const pool = new MultiSessionPool({
      workingDirectory: tmpDir,
      securityMode: 'interactive',
      llmClient: mockLLMClient,
      activeModel: model,
      toolDispatcher: dispatcher,
    });

    expect(pool.sessions.size).toBe(1);
    const active = pool.activeSession;
    expect(active.displayIndex).toBe(1);
    expect(active.status).toBe('ready');
    expect(pool.hasRunningSessions()).toBe(false);
  });

  it('should create multiple sessions and maintain strict message isolation', () => {
    const pool = new MultiSessionPool({
      workingDirectory: tmpDir,
      securityMode: 'interactive',
      llmClient: mockLLMClient,
      activeModel: model,
      toolDispatcher: dispatcher,
    });

    const s1 = pool.activeSession;
    s1.sessionManager.addMessage({ role: 'user', content: 'Message in Session 1' });

    const s2 = pool.createSession('Debug Task');
    expect(s2.displayIndex).toBe(2);
    expect(s2.name).toBe('Debug Task');
    s2.sessionManager.addMessage({ role: 'user', content: 'Message in Session 2' });

    expect(s1.sessionManager.messages).toHaveLength(1);
    expect(s1.sessionManager.messages[0].content).toBe('Message in Session 1');

    expect(s2.sessionManager.messages).toHaveLength(1);
    expect(s2.sessionManager.messages[0].content).toBe('Message in Session 2');
  });

  it('should switch between sessions and cycle via next/prev', () => {
    const pool = new MultiSessionPool({
      workingDirectory: tmpDir,
      securityMode: 'interactive',
      llmClient: mockLLMClient,
      activeModel: model,
      toolDispatcher: dispatcher,
    });

    const s1 = pool.activeSession;
    const s2 = pool.createSession('Second');
    const s3 = pool.createSession('Third');

    expect(pool.activeSession.id).toBe(s1.id);

    // Switch by index string
    pool.switchSession('2');
    expect(pool.activeSession.id).toBe(s2.id);

    // Switch by name
    pool.switchSession('third');
    expect(pool.activeSession.id).toBe(s3.id);

    // Cycle next
    pool.nextSession();
    expect(pool.activeSession.id).toBe(s1.id);

    // Cycle prev
    pool.prevSession();
    expect(pool.activeSession.id).toBe(s3.id);
  });

  it('should close sessions gracefully and fallback to active session', () => {
    const pool = new MultiSessionPool({
      workingDirectory: tmpDir,
      securityMode: 'interactive',
      llmClient: mockLLMClient,
      activeModel: model,
      toolDispatcher: dispatcher,
    });

    const s1 = pool.activeSession;
    const s2 = pool.createSession('Second');
    pool.switchSession(s2.id);

    // Close active s2 -> switches to s1
    const res = pool.closeSession();
    expect(res).not.toBeNull();
    expect(res?.closed.id).toBe(s2.id);
    expect(pool.activeSession.id).toBe(s1.id);
    expect(pool.sessions.size).toBe(1);

    // Close last session -> auto creates fresh session
    const res2 = pool.closeSession();
    expect(res2).not.toBeNull();
    expect(pool.sessions.size).toBe(1);
    expect(pool.activeSession.displayIndex).toBe(3);
  });

  it('should format status bar line 2 with standard, compact, and scenario 3 ultra-wide collapsed modes', () => {
    const pool = new MultiSessionPool({
      workingDirectory: tmpDir,
      securityMode: 'interactive',
      llmClient: mockLLMClient,
      activeModel: model,
      toolDispatcher: dispatcher,
    });

    const s1 = pool.activeSession;
    s1.setStatus('running');

    // Standard mode (1-2 sessions, wide width)
    const line2Standard = pool.getStatusBarSecondLine(120);
    expect(line2Standard).toContain('#1 (running)*');

    // Add more sessions for Scenario 3
    for (let i = 2; i <= 8; i++) {
      const s = pool.createSession(`Task-${i}`);
      if (i === 3) s.setStatus('running');
    }
    pool.switchSession('5');

    // Force small width to trigger Scenario 3 Ultra-Wide Collapsed Mode
    const line2Collapsed = pool.getStatusBarSecondLine(40);
    expect(line2Collapsed).toContain('#5 (Task-5)*');
    expect(line2Collapsed).toContain('8 sessions:');
    expect(line2Collapsed).toContain('2 running');
  });

  it('should track running status and terminate all on request', () => {
    const pool = new MultiSessionPool({
      workingDirectory: tmpDir,
      securityMode: 'interactive',
      llmClient: mockLLMClient,
      activeModel: model,
      toolDispatcher: dispatcher,
    });

    const s1 = pool.activeSession;
    const s2 = pool.createSession('Background Worker');

    expect(pool.hasRunningSessions()).toBe(false);

    s2.setStatus('running');
    expect(pool.hasRunningSessions()).toBe(true);
    expect(pool.getRunningSessions()).toHaveLength(1);
    expect(pool.getRunningSessions()[0].id).toBe(s2.id);

    pool.terminateAll();
    expect(pool.hasRunningSessions()).toBe(false);
  });

  it('should support aborting active session execution cleanly', async () => {
    const pool = new MultiSessionPool({
      workingDirectory: tmpDir,
      securityMode: 'interactive',
      llmClient: mockLLMClient,
      activeModel: model,
      toolDispatcher: dispatcher,
    });

    const active = pool.activeSession;
    active.setStatus('running');
    expect(active.isRunning).toBe(true);

    active.abort();
    expect(active.status).toBe('error');
    expect(active.currentAction).toBe('Execution interrupted');
  });
});
