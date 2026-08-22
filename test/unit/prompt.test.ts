import { describe, it, expect } from 'vitest';
import { TuiPrompt, SLASH_COMMANDS } from '../../src/cli/ui/prompt.js';
import { getModelMetadata } from '../../src/config/loader.js';

describe('TuiPrompt & Slash Command Suggestions', () => {
  const model = getModelMetadata('deepseek-chat', 'deepseek');
  const tuiPrompt = new TuiPrompt({
    mode: 'interactive',
    model,
    cwd: '/workspace',
  });

  it('should return all slash commands when typing /', () => {
    const matches = tuiPrompt.getMatchingCommands('/');
    expect(matches.length).toBe(SLASH_COMMANDS.length);
    expect(matches.some((m) => m.command === '/mode')).toBe(true);
    expect(matches.some((m) => m.command === '/model')).toBe(true);
    expect(matches.some((m) => m.command === '/skills')).toBe(true);
  });

  it('should filter slash commands prefix matching', () => {
    const matchesM = tuiPrompt.getMatchingCommands('/m');
    expect(matchesM.map((m) => m.command)).toEqual(['/mode', '/model', '/mcp']);

    const matchesSk = tuiPrompt.getMatchingCommands('/sk');
    expect(matchesSk.map((m) => m.command)).toEqual(['/skills']);

    const matchesEx = tuiPrompt.getMatchingCommands('/ex');
    expect(matchesEx.map((m) => m.command)).toEqual(['/export', '/exit']);

    const matchesExit = tuiPrompt.getMatchingCommands('/exi');
    expect(matchesExit.map((m) => m.command)).toEqual(['/exit']);
  });

  it('should return empty list for normal text not starting with /', () => {
    const matches = tuiPrompt.getMatchingCommands('hello world');
    expect(matches).toEqual([]);
  });

  it('should store and manage operation history records correctly', () => {
    tuiPrompt.clearHistory();
    expect(tuiPrompt.getHistory()).toEqual([]);

    tuiPrompt.addHistory('> user test query');
    tuiPrompt.addHistory(['[thinking: step 1]', 'output response']);

    const hist = tuiPrompt.getHistory();
    expect(hist.length).toBe(3);
    tuiPrompt.clearHistory();
    expect(tuiPrompt.getHistory()).toEqual([]);
  });

  it('should include /effort in slash commands and filter correctly', () => {
    expect(SLASH_COMMANDS.some((c) => c.command === '/effort')).toBe(true);
    const matchesEff = tuiPrompt.getMatchingCommands('/ef');
    expect(matchesEff.map((m) => m.command)).toEqual(['/effort']);
  });


  it('should support reasoning effort state update', () => {
    const reasoningModel = getModelMetadata('deepseek-v4-flash', 'deepseek');
    const prompt = new TuiPrompt({
      mode: 'interactive',
      model: reasoningModel,
      cwd: '/workspace',
      thinkingEffort: 'high',
    });

    prompt.updateState('auto', reasoningModel, true, 'low');
    // Verify prompt operates with updated state
    expect(prompt.getMatchingCommands('/ef').length).toBe(1);
  });

  it('should accurately calculate visual width for ASCII, ANSI, and CJK characters', async () => {
    const { getStringWidth, truncateAnsi, wrapText } = await import('../../src/cli/ui/prompt.js');

    expect(getStringWidth('hello')).toBe(5);
    expect(getStringWidth('你好')).toBe(4); // 2 CJK characters = 4 visual columns
    expect(getStringWidth('你好 world')).toBe(10); // 4 + 1 + 5 = 10
    expect(getStringWidth('\x1b[32m你好\x1b[0m')).toBe(4); // ANSI ignored

    // Truncate ANSI CJK
    const truncated = truncateAnsi('你好世界', 6);
    expect(getStringWidth(truncated)).toBeLessThanOrEqual(6);

    // Wrap text CJK
    const wrapped = wrapText('你好世界，欢迎使用青袂CLI助手', 10);
    for (const w of wrapped) {

      expect(getStringWidth(w)).toBeLessThanOrEqual(10);
    }
  });

  it('should store and manage user command history memory', () => {
    tuiPrompt.clearInputHistory();
    expect(tuiPrompt.getInputHistory()).toEqual([]);

    tuiPrompt.addInputHistory('git status');
    tuiPrompt.addInputHistory('npm run build');
    tuiPrompt.addInputHistory('npm run build'); // Duplicate ignored consecutively

    expect(tuiPrompt.getInputHistory()).toEqual(['git status', 'npm run build']);
    tuiPrompt.clearInputHistory();
    expect(tuiPrompt.getInputHistory()).toEqual([]);
  });

  it('should detect and filter active @mention queries', () => {
    const prompt = new TuiPrompt({
      mode: 'interactive',
      model,
      cwd: process.cwd(),
    });

    const m1 = prompt.getMentionMatches('Check this file @src', 20);
    expect(m1).not.toBeNull();
    expect(m1?.query).toBe('src');
    expect(m1?.matches.length).toBeGreaterThan(0);

    const mNone = prompt.getMentionMatches('Normal text without at', 22);
    expect(mNone).toBeNull();
  });
});





