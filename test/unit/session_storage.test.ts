import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  saveSessionSnapshot,
  loadSessionSnapshot,
  listSessionSnapshots,
  deleteSessionSnapshot,
  exportSessionToMarkdown,
  getWorkspaceHash,
  getWorkspaceSessionDir,
  formatTime24,
  formatDateTime24,
  SessionSnapshot,
} from '../../src/core/session/storage.js';
import { SessionManager } from '../../src/core/session.js';
import { QingmeiAgent } from '../../src/core/agent.js';
import { LLMClient } from '../../src/core/llm/client.js';
import { getModelMetadata } from '../../src/config/loader.js';
import { EXPORT_DIR } from '../../src/config/defaults.js';

describe('Session Persistence & Archival Storage Engine', () => {
  it('should generate consistent and isolated workspace hashes', () => {
    const ws1 = '/Users/alice/projects/app1';
    const ws2 = '/Users/alice/projects/app2';

    const hash1 = getWorkspaceHash(ws1);
    const hash2 = getWorkspaceHash(ws2);

    expect(hash1).toBeDefined();
    expect(hash1.length).toBe(16);
    expect(hash1).not.toBe(hash2);

    const dir1 = getWorkspaceSessionDir(ws1);
    expect(dir1).toContain(hash1);
  });

  it('should save, list, and load session snapshots', () => {
    const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'qingmei-session-test-'));

    const snapshot1: SessionSnapshot = {
      id: 'sess_test_1',
      name: 'feature-auth',
      cwd: tmpWs,
      createdAt: Date.now() - 10000,
      updatedAt: Date.now() - 5000,
      messageCount: 2,
      usedTokens: 1500,
      preview: 'Please implement OAuth2 flow',
      messages: [
        { role: 'user', content: 'Please implement OAuth2 flow' },
        { role: 'assistant', content: 'OAuth2 flow scaffolded.' },
      ],
    };

    const snapshot2: SessionSnapshot = {
      id: 'sess_test_2',
      name: 'hotfix-db',
      cwd: tmpWs,
      createdAt: Date.now() - 2000,
      updatedAt: Date.now() - 1000,
      messageCount: 2,
      usedTokens: 2200,
      preview: 'Fix SQL connection leak',
      messages: [
        { role: 'user', content: 'Fix SQL connection leak' },
        { role: 'assistant', content: 'Connection pool fixed.' },
      ],
    };

    saveSessionSnapshot(snapshot1);
    saveSessionSnapshot(snapshot2);

    const list = listSessionSnapshots(tmpWs);
    expect(list.length).toBe(2);
    // Sorts newest first
    expect(list[0].id).toBe('sess_test_2');
    expect(list[1].id).toBe('sess_test_1');

    // Load by exact ID
    const loaded = loadSessionSnapshot(tmpWs, 'sess_test_1');
    expect(loaded).toBeDefined();
    expect(loaded?.name).toBe('feature-auth');
    expect(loaded?.messages.length).toBe(2);

    // Load by name alias
    const loadedByName = loadSessionSnapshot(tmpWs, 'hotfix-db');
    expect(loadedByName).toBeDefined();
    expect(loadedByName?.id).toBe('sess_test_2');

    // Delete session
    const delResult = deleteSessionSnapshot(tmpWs, 'sess_test_1');
    expect(delResult).toBe(true);
    const afterDel = listSessionSnapshots(tmpWs);
    expect(afterDel.length).toBe(1);

    // Cleanup
    fs.rmSync(getWorkspaceSessionDir(tmpWs), { recursive: true, force: true });
    fs.rmSync(tmpWs, { recursive: true, force: true });
  });

  it('should export session to Markdown default directory and custom path', () => {
    const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'qingmei-export-test-'));

    const snapshot: SessionSnapshot = {
      id: 'sess_export_demo',
      name: 'refactor-logger',
      cwd: tmpWs,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: 2,
      usedTokens: 800,
      preview: 'Refactor logging module',
      messages: [
        { role: 'user', content: 'Refactor logging module' },
        { role: 'assistant', content: 'Logging refactored to Winston.' },
      ],
    };

    // Default export to ~/.qingmei/export/
    const defaultOut = exportSessionToMarkdown(snapshot);
    expect(defaultOut.startsWith(EXPORT_DIR)).toBe(true);
    expect(fs.existsSync(defaultOut)).toBe(true);
    const defaultContent = fs.readFileSync(defaultOut, 'utf-8');
    expect(defaultContent).toContain('# Qingmei AI Session Export');
    expect(defaultContent).toContain('Refactor logging module');

    // Custom path export
    const customOut = path.join(tmpWs, 'MY_LOG.md');
    exportSessionToMarkdown(snapshot, customOut);
    expect(fs.existsSync(customOut)).toBe(true);
    const customContent = fs.readFileSync(customOut, 'utf-8');
    expect(customContent).toContain('Logging refactored to Winston.');

    // Cleanup
    fs.unlinkSync(defaultOut);
    fs.rmSync(tmpWs, { recursive: true, force: true });
  });

  it('should integrate seamlessly with SessionManager and QingmeiAgent', () => {
    const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'qingmei-agent-session-test-'));
    const model = getModelMetadata('deepseek-chat', 'deepseek');
    const llmClient = new LLMClient({
      apiKey: 'test-key',
      baseUrl: 'https://api.deepseek.com/v1',
      defaultModel: 'deepseek-chat',
      provider: 'deepseek',
    });

    const agent = new QingmeiAgent({
      workingDirectory: tmpWs,
      securityMode: 'interactive',
      llmClient,
      activeModel: model,
    });

    agent.session.addMessage({ role: 'user', content: 'Design microservices architecture' });
    agent.session.addMessage({ role: 'assistant', content: 'Architecture blueprint created.' });

    // Save active session with name
    const saved = agent.saveActiveSession('arch-v1');
    expect(saved.id).toBe(agent.session.sessionId);
    expect(saved.name).toBe('arch-v1');

    // Clear session
    agent.session.clear();
    expect(agent.session.messages.length).toBe(0);

    // Resume session
    const resumed = agent.resumeSession('arch-v1');
    expect(resumed).toBe(true);
    expect(agent.session.messages.length).toBe(2);
    expect(agent.session.sessionName).toBe('arch-v1');

    // Cleanup
    fs.rmSync(getWorkspaceSessionDir(tmpWs), { recursive: true, force: true });
    fs.rmSync(tmpWs, { recursive: true, force: true });
  });

  it('should format timestamps to strict 24-hour time and date strings', () => {
    // 2026-08-28 09:05:08 local time
    const d1 = new Date(2026, 7, 28, 9, 5, 8);
    expect(formatTime24(d1)).toBe('09:05:08');
    expect(formatDateTime24(d1)).toBe('2026-08-28 09:05:08');

    // 2026-08-28 21:45:30 local time (PM converted to 24h)
    const d2 = new Date(2026, 7, 28, 21, 45, 30);
    expect(formatTime24(d2)).toBe('21:45:30');
    expect(formatDateTime24(d2)).toBe('2026-08-28 21:45:30');

    // Handles null / undefined / invalid
    expect(formatTime24(null)).toBe('');
    expect(formatDateTime24(undefined)).toBe('');
  });
});
