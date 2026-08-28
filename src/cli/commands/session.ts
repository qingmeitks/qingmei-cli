import chalk from 'chalk';
import { QingmeiAgent } from '../../core/agent.js';
import { TuiPrompt } from '../ui/prompt.js';
import { SessionInstance } from '../../core/session/instance.js';
import { formatTime24, formatDateTime24, findMatchingSnapshot, SessionSnapshot } from '../../core/session/storage.js';

export async function handleNewSession(
  nameArg: string,
  agent: QingmeiAgent,
  tuiPrompt: TuiPrompt
): Promise<void> {
  let name = nameArg?.trim();
  const newSession = agent.pool.createSession(name || undefined);
  agent.pool.activeSessionId = newSession.id;

  // Sync TUI with new session state
  tuiPrompt.clearHistory();
  const currentUsage = agent.getContextUsage();
  tuiPrompt.updateState(
    agent.securityMode,
    agent.activeModel,
    agent.isWorkspaceTrusted,
    agent.thinkingEffort,
    currentUsage.display
  );

  const nameLabel = newSession.name ? ` (${newSession.name})` : '';
  tuiPrompt.addHistory(chalk.green(`✓ Switched to new session #${newSession.displayIndex}${nameLabel}`));
  tuiPrompt.addHistory('');
}

export async function handleSwitchSession(
  targetArg: string,
  agent: QingmeiAgent,
  tuiPrompt: TuiPrompt
): Promise<void> {
  const all = agent.pool.getAllSessions();

  if (targetArg && targetArg.trim()) {
    const switched = agent.pool.switchSession(targetArg.trim());
    if (switched) {
      applySwitchedSessionToTui(switched, agent, tuiPrompt);
      return;
    }
    tuiPrompt.addHistory(chalk.red(`✗ Could not find active session "${targetArg}". Type /sessions to list all open sessions.`));
    tuiPrompt.addHistory('');
    return;
  }

  // Interactive Select Modal
  const options = all.map((s) => {
    const isActive = s.id === agent.pool.activeSessionId;
    const nameLabel = s.name ? ` (${s.name})` : '';
    const statusText = `[${s.status}]`;
    const star = isActive ? ' (active)' : '';
    const msgs = `${s.sessionManager.messages.length} msgs`;
    const preview = s.sessionManager.toSnapshot(agent.workingDirectory).preview;

    return {
      value: s.id,
      label: `#${s.displayIndex}${nameLabel} ${statusText}${star}`,
      hint: preview && preview !== 'Empty session' ? `"${preview.slice(0, 30)}"` : msgs,
    };
  });

  const selected = await tuiPrompt.selectModal({
    title: 'Select Active Session to Switch',
    options,
    initialValue: agent.pool.activeSessionId,
  });

  if (selected) {
    const switched = agent.pool.switchSession(selected);
    if (switched) {
      applySwitchedSessionToTui(switched, agent, tuiPrompt);
    }
  }
}

export function applySwitchedSessionToTui(
  session: SessionInstance,
  agent: QingmeiAgent,
  tuiPrompt: TuiPrompt
): void {
  tuiPrompt.clearHistory();

  // Re-populate visible history with session messages
  for (const m of session.sessionManager.messages) {
    if (m.role === 'user' && m.content) {
      tuiPrompt.addHistory(`${chalk.cyan('> ')}${chalk.bold(m.content)}`);
    } else if (m.role === 'assistant' && m.content) {
      tuiPrompt.addHistory(m.content);
      tuiPrompt.addHistory('');
    }
  }

  const currentUsage = agent.getContextUsage();
  tuiPrompt.updateState(
    agent.securityMode,
    agent.activeModel,
    agent.isWorkspaceTrusted,
    agent.thinkingEffort,
    currentUsage.display
  );

  const nameLabel = session.name ? ` (${session.name})` : '';
  tuiPrompt.addHistory(chalk.green(`✓ Switched to session #${session.displayIndex}${nameLabel}`));
  tuiPrompt.addHistory('');
}

export async function handleListSessions(
  agent: QingmeiAgent,
  tuiPrompt: TuiPrompt
): Promise<void> {
  const activeSessions = agent.pool.getAllSessions();
  const savedSnapshots = agent.pool.listSavedSnapshots();

  const lines: string[] = [chalk.bold('Active Sessions in Memory:')];

  for (const s of activeSessions) {
    const isActive = s.id === agent.pool.activeSessionId ? chalk.cyanBright(' (current)') : '';
    const nameLabel = s.name ? chalk.cyan(` [${s.name}]`) : '';
    const statusColor = s.isRunning
      ? chalk.yellowBright(`[${s.status}]`)
      : s.status === 'error'
      ? chalk.red(`[${s.status}]`)
      : chalk.green(`[${s.status}]`);
    const count = s.sessionManager.messages.length;
    const dateStr = formatTime24(s.updatedAt);
    lines.push(`  #${s.displayIndex}${nameLabel} ${statusColor}${isActive} - ${count} msgs, last active: ${dateStr}`);
  }

  lines.push('');
  lines.push(chalk.bold('Saved Workspace Snapshots on Disk:'));
  if (savedSnapshots.length === 0) {
    lines.push(chalk.dim('  No saved session files on disk. Use "/save [name]" to persist.'));
  } else {
    for (const snap of savedSnapshots) {
      const isLoaded = activeSessions.some((s) => s.id === snap.id);
      const loadedTag = isLoaded ? chalk.dim(' (open in memory)') : '';
      const nameTag = snap.name ? chalk.cyan(` [${snap.name}]`) : '';
      const dateStr = formatDateTime24(snap.updatedAt || snap.createdAt);
      lines.push(`  * ${chalk.yellow(snap.id)}${nameTag}${loadedTag} - ${snap.messageCount} msgs, ~${snap.usedTokens} tokens, ${dateStr}`);
    }
  }

  lines.push('');
  lines.push(chalk.dim('Commands: /new [name] to create, /switch [id] to switch, /save [name] to save, /resume [id] to resume.'));
  lines.push('');

  tuiPrompt.addHistory(lines);
}

export async function handleRenameSession(
  nameArg: string,
  agent: QingmeiAgent,
  tuiPrompt: TuiPrompt
): Promise<void> {
  let targetName = nameArg?.trim();
  if (!targetName) {
    const input = await tuiPrompt.textModal({
      title: 'Rename Current Session',
      placeholder: 'Enter new session name',
    });
    if (input && input.trim()) {
      targetName = input.trim();
    }
  }

  if (targetName) {
    const renamed = agent.pool.renameSession(agent.pool.activeSessionId, targetName);
    if (renamed) {
      tuiPrompt.addHistory(chalk.green(`✓ Renamed session #${renamed.displayIndex} to "${targetName}"`));
      tuiPrompt.addHistory('');
    }
  }
}

export async function handleCloseSession(
  targetArg: string,
  agent: QingmeiAgent,
  tuiPrompt: TuiPrompt
): Promise<void> {
  const result = agent.pool.closeSession(targetArg?.trim() || undefined);
  if (!result) {
    tuiPrompt.addHistory(chalk.red(`✗ Could not find session to close.`));
    tuiPrompt.addHistory('');
    return;
  }

  const { closed, newActive } = result;
  applySwitchedSessionToTui(newActive, agent, tuiPrompt);
  const closedName = closed.name ? ` (${closed.name})` : '';
  tuiPrompt.addHistory(chalk.green(`✓ Closed session #${closed.displayIndex}${closedName}. Now on session #${newActive.displayIndex}.`));
  tuiPrompt.addHistory('');
}

export async function handleSaveSession(
  nameArg: string,
  agent: QingmeiAgent,
  tuiPrompt: TuiPrompt
): Promise<void> {
  let saveName = nameArg?.trim();
  if (!saveName) {
    const input = await tuiPrompt.textModal({
      title: 'Save Session Snapshot',
      placeholder: 'Enter snapshot name (optional)',
    });
    if (input?.trim()) {
      saveName = input.trim();
    }
  }

  const snapshot = agent.pool.saveActiveSession(saveName || undefined);
  const nameLabel = snapshot.name ? ` [${snapshot.name}]` : '';
  tuiPrompt.addHistory(chalk.green(`✓ Session saved successfully:${nameLabel} (ID: ${snapshot.id})`));
  tuiPrompt.addHistory('');
}

export async function handleResumeSession(
  idArg: string,
  agent: QingmeiAgent,
  tuiPrompt: TuiPrompt
): Promise<void> {
  const savedSnapshots = agent.pool.listSavedSnapshots();
  let targetId = idArg?.trim();

  if (!targetId) {
    if (savedSnapshots.length === 0) {
      tuiPrompt.addHistory(chalk.yellow('! No saved session snapshots found to resume.'));
      tuiPrompt.addHistory('');
      return;
    }

    const options = savedSnapshots.map((s) => {
      const dateStr = formatDateTime24(s.updatedAt || s.createdAt);
      const tag = s.name ? `[${s.name}] ` : '';
      return {
        value: s.id,
        label: `${tag}${s.id} (${dateStr})`,
        hint: s.preview ? `"${s.preview.slice(0, 36)}"` : `${s.messageCount} msgs`,
      };
    });

    const choice = await tuiPrompt.selectModal({
      title: 'Select Session Snapshot to Resume',
      options,
    });

    if (!choice) return;
    targetId = choice;
  }

  const session = agent.pool.resumeSessionFromSnapshot(targetId);
  if (session) {
    applySwitchedSessionToTui(session, agent, tuiPrompt);
    const nameLabel = session.name ? ` (${session.name})` : '';
    tuiPrompt.addHistory(chalk.green(`✓ Resumed session #${session.displayIndex}${nameLabel} (ID: ${session.id})`));
    tuiPrompt.addHistory('');
  } else {
    tuiPrompt.addHistory(chalk.red(`✗ Could not find saved snapshot "${targetId}". Type /sessions to list.`));
    tuiPrompt.addHistory('');
  }
}

export async function handleDeleteSession(
  idArg: string,
  agent: QingmeiAgent,
  tuiPrompt: TuiPrompt
): Promise<void> {
  const savedSnapshots = agent.pool.listSavedSnapshots();
  const rawArg = idArg?.trim();

  if (savedSnapshots.length === 0) {
    tuiPrompt.addHistory(chalk.dim('  No saved sessions found to delete.'));
    tuiPrompt.addHistory('');
    return;
  }

  let selectedSnapshots: SessionSnapshot[] = [];

  if (rawArg) {
    const rawTokens = rawArg.split(/[\s,]+/).filter(Boolean);

    if (rawTokens.includes('all') || rawTokens.includes('ALL') || rawTokens.includes('__ALL__')) {
      const confirmed = await tuiPrompt.confirmModal({
        title: 'Delete All Workspace Snapshots',
        message: `Permanently delete all ${savedSnapshots.length} snapshot files from disk?`,
        initialValue: false,
      });

      if (confirmed) {
        const count = agent.deleteAllSessions();
        tuiPrompt.addHistory(chalk.green(`✓ Successfully deleted all ${count} session snapshots for this workspace.`));
        tuiPrompt.addHistory('');
      } else {
        tuiPrompt.addHistory(chalk.dim('Cancelled deleting all snapshots.'));
        tuiPrompt.addHistory('');
      }
      return;
    }

    const notFoundTokens: string[] = [];

    for (const token of rawTokens) {
      const found = findMatchingSnapshot(savedSnapshots, token);
      if (found) {
        if (!selectedSnapshots.some((s) => s.id === found.id)) {
          selectedSnapshots.push(found);
        }
      } else {
        notFoundTokens.push(token);
      }
    }

    if (notFoundTokens.length > 0 && selectedSnapshots.length === 0) {
      tuiPrompt.addHistory(
        chalk.red(`✗ Could not find snapshot(s): ${notFoundTokens.map((t) => `"${t}"`).join(', ')}. Type /sessions to list.`)
      );
      tuiPrompt.addHistory('');
      return;
    }

    if (notFoundTokens.length > 0) {
      tuiPrompt.addHistory(
        chalk.yellow(`! Notice: Could not find snapshot(s): ${notFoundTokens.map((t) => `"${t}"`).join(', ')}`)
      );
    }
  } else {
    // Interactive multi-selection modal
    const options = savedSnapshots.map((s) => {
      const dateStr = formatDateTime24(s.updatedAt || s.createdAt);
      const tag = s.name ? `[${s.name}] ` : '';
      return {
        value: s.id,
        label: `${tag}${s.id} (${dateStr})`,
        hint: s.preview ? `"${s.preview.slice(0, 36)}"` : `${s.messageCount} msgs`,
      };
    });

    const chosenIds = await tuiPrompt.multiselectModal({
      title: 'Select Session Snapshots to Delete',
      options,
    });

    if (!chosenIds || chosenIds.length === 0) {
      tuiPrompt.addHistory(chalk.dim('Cancelled session deletion.'));
      tuiPrompt.addHistory('');
      return;
    }

    selectedSnapshots = savedSnapshots.filter((s) => chosenIds.includes(s.id));
  }

  if (selectedSnapshots.length === 0) return;

  // Confirmation modal dialog before actual deletion
  let confirmTitle: string;
  let confirmMessage: string;

  if (selectedSnapshots.length === 1) {
    const s = selectedSnapshots[0];
    const label = s.name ? `${s.id} [${s.name}]` : s.id;
    confirmTitle = 'Confirm Delete Session Snapshot';
    confirmMessage = `Permanently delete snapshot "${label}" from disk?`;
  } else {
    const listPreview = selectedSnapshots
      .slice(0, 3)
      .map((s) => (s.name ? `${s.id} [${s.name}]` : s.id))
      .join(', ');
    const moreStr = selectedSnapshots.length > 3 ? ` and ${selectedSnapshots.length - 3} more` : '';
    confirmTitle = 'Confirm Delete Multiple Sessions';
    confirmMessage = `Permanently delete ${selectedSnapshots.length} snapshot files (${listPreview}${moreStr}) from disk?`;
  }

  const confirmed = await tuiPrompt.confirmModal({
    title: confirmTitle,
    message: confirmMessage,
    initialValue: false,
  });

  if (!confirmed) {
    tuiPrompt.addHistory(chalk.dim('Cancelled session deletion.'));
    tuiPrompt.addHistory('');
    return;
  }

  // Perform deletion
  let deletedCount = 0;
  const deletedLabels: string[] = [];

  for (const s of selectedSnapshots) {
    const success = agent.pool.deleteSavedSnapshot(s.id);
    if (success) {
      deletedCount++;
      deletedLabels.push(s.name ? `${s.id} [${s.name}]` : s.id);
    }
  }

  if (deletedCount === 1) {
    tuiPrompt.addHistory(chalk.green(`✓ Deleted snapshot file: ${deletedLabels[0]}`));
  } else if (deletedCount > 1) {
    tuiPrompt.addHistory(
      chalk.green(`✓ Successfully deleted ${deletedCount} session snapshots:\n  * ${deletedLabels.join('\n  * ')}`)
    );
  } else {
    tuiPrompt.addHistory(chalk.red('✗ Failed to delete selected snapshots.'));
  }
  tuiPrompt.addHistory('');
}

export async function handleExportSession(
  arg: string,
  agent: QingmeiAgent,
  tuiPrompt: TuiPrompt
): Promise<void> {
  const parts = arg.trim().split(/\s+/).filter(Boolean);
  let targetSessionId: string | undefined;
  let targetPath: string | undefined;

  if (parts.length === 1) {
    const single = parts[0];
    if (single.includes('/') || single.includes('\\') || single.endsWith('.md') || single.startsWith('.')) {
      targetPath = single;
    } else {
      targetSessionId = single;
    }
  } else if (parts.length >= 2) {
    targetSessionId = parts[0];
    targetPath = parts[1];
  }

  try {
    const outPath = agent.pool.exportSession(targetSessionId, targetPath);
    tuiPrompt.addHistory(chalk.green(`✓ Session exported to: ${outPath}`));
  } catch (err: any) {
    tuiPrompt.addHistory(chalk.red(`✗ Export failed: ${err.message || String(err)}`));
  }
  tuiPrompt.addHistory('');
}

export async function handleQuitWithRunningGuard(
  agent: QingmeiAgent,
  tuiPrompt: TuiPrompt
): Promise<boolean> {
  const runningSessions = agent.pool.getRunningSessions();

  if (runningSessions.length === 0) {
    // Save active session and allow exit
    agent.saveActiveSession();
    return true; // proceed to exit
  }

  // Active running sessions exist: trigger intercept modal
  const runningList = runningSessions
    .map((s) => `#${s.displayIndex}${s.name ? ` (${s.name})` : ''} [${s.status}]`)
    .join(', ');

  const confirmed = await tuiPrompt.confirmModal({
    title: 'Active Sessions Running Warning',
    message: `There are background sessions still running: ${runningList}. Force exit and terminate all?`,
    initialValue: false,
  });

  if (confirmed) {
    agent.pool.terminateAll();
    agent.saveActiveSession();
    return true; // proceed to exit
  }

  return false; // cancel exit and stay
}
