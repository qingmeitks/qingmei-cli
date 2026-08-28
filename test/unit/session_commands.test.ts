import { describe, it, expect, vi } from 'vitest';
import { QingmeiAgent } from '../../src/core/agent.js';
import { TuiPrompt } from '../../src/cli/ui/prompt.js';
import {
  handleNewSession,
  handleSwitchSession,
  handleRenameSession,
  handleCloseSession,
  handleSaveSession,
  handleResumeSession,
  handleDeleteSession,
  handleQuitWithRunningGuard,
} from '../../src/cli/commands/session.js';
import { LLMClient } from '../../src/core/llm/client.js';
import { getModelMetadata } from '../../src/config/loader.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Session Commands & Exit Guard', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qingmei-cmd-test-'));
  const model = getModelMetadata('deepseek-chat', 'deepseek');
  const mockLLMClient = new LLMClient({
    apiKey: 'mock-key',
    baseUrl: 'https://api.mock.com/v1',
    defaultModel: 'deepseek-chat',
    provider: 'deepseek',
  });

  const createTestEnv = () => {
    const agent = new QingmeiAgent({
      workingDirectory: tmpDir,
      securityMode: 'interactive',
      llmClient: mockLLMClient,
      activeModel: model,
    });
    const prompt = new TuiPrompt({
      mode: 'interactive',
      model,
      cwd: tmpDir,
    });
    return { agent, prompt };
  };

  it('should create new session via handleNewSession', async () => {
    const { agent, prompt } = createTestEnv();
    expect(agent.pool.getAllSessions()).toHaveLength(1);

    await handleNewSession('Feature Dev', agent, prompt);
    expect(agent.pool.getAllSessions()).toHaveLength(2);
    expect(agent.pool.activeSession.name).toBe('Feature Dev');
    expect(agent.pool.activeSession.displayIndex).toBe(2);
  });

  it('should rename session via handleRenameSession', async () => {
    const { agent, prompt } = createTestEnv();
    await handleRenameSession('Brand New Name', agent, prompt);
    expect(agent.pool.activeSession.name).toBe('Brand New Name');
  });

  it('should switch session via handleSwitchSession', async () => {
    const { agent, prompt } = createTestEnv();
    await handleNewSession('Second', agent, prompt);
    expect(agent.pool.activeSession.displayIndex).toBe(2);

    await handleSwitchSession('1', agent, prompt);
    expect(agent.pool.activeSession.displayIndex).toBe(1);
  });

  it('should close session via handleCloseSession', async () => {
    const { agent, prompt } = createTestEnv();
    await handleNewSession('Second', agent, prompt);
    expect(agent.pool.getAllSessions()).toHaveLength(2);

    await handleCloseSession('', agent, prompt);
    expect(agent.pool.getAllSessions()).toHaveLength(1);
    expect(agent.pool.activeSession.displayIndex).toBe(1);
  });

  it('should save, list, resume and delete sessions via disk snapshot commands', async () => {
    const { agent, prompt } = createTestEnv();
    agent.session.addMessage({ role: 'user', content: 'Test prompt for snapshot' });

    // Save
    await handleSaveSession('checkpoint-1', agent, prompt);
    const snapshots = agent.pool.listSavedSnapshots();
    expect(snapshots.length).toBeGreaterThanOrEqual(1);
    const found = snapshots.find((s) => s.name === 'checkpoint-1');
    expect(found).toBeDefined();

    // Resume
    if (found) {
      await handleResumeSession(found.id, agent, prompt);
      expect(agent.pool.activeSession.id).toBe(found.id);

      // Delete with confirmation modal (mock confirm true)
      prompt.confirmModal = vi.fn().mockResolvedValue(true);
      await handleDeleteSession(found.id, agent, prompt);
      expect(prompt.confirmModal).toHaveBeenCalled();
      const afterDel = agent.pool.listSavedSnapshots();
      expect(afterDel.find((s) => s.id === found.id)).toBeUndefined();
    }
  });

  it('should support batch session deletion and confirm modals', async () => {
    const { agent, prompt } = createTestEnv();

    // Create 3 saved snapshots
    agent.session.addMessage({ role: 'user', content: 'Msg 1' });
    const s1 = agent.saveActiveSession('batch-1');

    await handleNewSession('batch-2', agent, prompt);
    agent.session.addMessage({ role: 'user', content: 'Msg 2' });
    const s2 = agent.saveActiveSession('batch-2');

    await handleNewSession('batch-3', agent, prompt);
    agent.session.addMessage({ role: 'user', content: 'Msg 3' });
    const s3 = agent.saveActiveSession('batch-3');

    const listBefore = agent.pool.listSavedSnapshots();
    expect(listBefore.length).toBeGreaterThanOrEqual(3);

    // Cancel batch deletion
    prompt.confirmModal = vi.fn().mockResolvedValue(false);
    await handleDeleteSession(`${s1.id} ${s2.id}`, agent, prompt);
    expect(prompt.confirmModal).toHaveBeenCalled();
    expect(agent.pool.listSavedSnapshots().find((s) => s.id === s1.id)).toBeDefined();
    expect(agent.pool.listSavedSnapshots().find((s) => s.id === s2.id)).toBeDefined();

    // Confirm batch deletion of 2 sessions
    prompt.confirmModal = vi.fn().mockResolvedValue(true);
    await handleDeleteSession(`${s1.id} ${s2.id}`, agent, prompt);
    expect(agent.pool.listSavedSnapshots().find((s) => s.id === s1.id)).toBeUndefined();
    expect(agent.pool.listSavedSnapshots().find((s) => s.id === s2.id)).toBeUndefined();
    expect(agent.pool.listSavedSnapshots().find((s) => s.id === s3.id)).toBeDefined();

    // Interactive multiselect deletion
    prompt.multiselectModal = vi.fn().mockResolvedValue([s3.id]);
    prompt.confirmModal = vi.fn().mockResolvedValue(true);
    await handleDeleteSession('', agent, prompt);
    expect(prompt.multiselectModal).toHaveBeenCalled();
    expect(prompt.confirmModal).toHaveBeenCalled();
    expect(agent.pool.listSavedSnapshots().find((s) => s.id === s3.id)).toBeUndefined();
  });

  it('should handle quit guard when sessions are idle vs running', async () => {
    const { agent, prompt } = createTestEnv();

    // All sessions idle: should allow quit directly without modal
    const canExitIdle = await handleQuitWithRunningGuard(agent, prompt);
    expect(canExitIdle).toBe(true);

    // One session running: should trigger confirmModal
    agent.pool.activeSession.setStatus('running');
    prompt.confirmModal = vi.fn().mockResolvedValue(false);

    const canExitCancelled = await handleQuitWithRunningGuard(agent, prompt);
    expect(canExitCancelled).toBe(false);
    expect(prompt.confirmModal).toHaveBeenCalled();

    // Confirm force exit
    prompt.confirmModal = vi.fn().mockResolvedValue(true);
    const canExitConfirmed = await handleQuitWithRunningGuard(agent, prompt);
    expect(canExitConfirmed).toBe(true);
  });
});
