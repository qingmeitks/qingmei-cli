import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ChatMessage } from '../llm/types.js';
import { SESSIONS_DIR, EXPORT_DIR } from '../../config/defaults.js';

export interface SessionSnapshot {
  id: string;
  name?: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  usedTokens: number;
  preview: string;
  messages: ChatMessage[];
}

export function getWorkspaceHash(cwd: string): string {
  const resolved = path.resolve(cwd);
  return crypto.createHash('sha256').update(resolved).digest('hex').slice(0, 16);
}

export function getWorkspaceSessionDir(cwd: string): string {
  const hash = getWorkspaceHash(cwd);
  return path.join(SESSIONS_DIR, hash);
}

export function ensureWorkspaceSessionDir(cwd: string): string {
  const dir = getWorkspaceSessionDir(cwd);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function ensureExportDir(): string {
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  }
  return EXPORT_DIR;
}

export function generateSessionId(): string {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 6);
  return `sess_${dateStr}_${rand}`;
}

export function extractPreview(messages: ChatMessage[]): string {
  for (const m of messages) {
    if (m.role === 'user' && m.content) {
      const firstLine = m.content.trim().split('\n')[0];
      if (firstLine) {
        return firstLine.slice(0, 80);
      }
    }
  }
  return 'Empty session';
}

export function saveSessionSnapshot(snapshot: SessionSnapshot): void {
  const dir = ensureWorkspaceSessionDir(snapshot.cwd);
  const filePath = path.join(dir, `${snapshot.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
}

export function loadSessionSnapshot(cwd: string, sessionId: string): SessionSnapshot | null {
  const dir = getWorkspaceSessionDir(cwd);
  let filePath = path.join(dir, `${sessionId}.json`);

  if (!fs.existsSync(filePath)) {
    // Also try matching by name or partial ID
    const all = listSessionSnapshots(cwd);
    const found = all.find((s) => s.id === sessionId || s.name === sessionId || s.id.startsWith(sessionId));
    if (found) {
      filePath = path.join(dir, `${found.id}.json`);
    } else {
      return null;
    }
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as SessionSnapshot;
  } catch {
    return null;
  }
}

export function listSessionSnapshots(cwd: string): SessionSnapshot[] {
  const dir = getWorkspaceSessionDir(cwd);
  if (!fs.existsSync(dir)) {
    return [];
  }

  const results: SessionSnapshot[] = [];
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const filePath = path.join(dir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(content) as SessionSnapshot;
          results.push(data);
        } catch {
          // ignore corrupted files
        }
      }
    }
  } catch {
    return [];
  }

  // Sort by updatedAt descending (newest first)
  return results.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function deleteSessionSnapshot(cwd: string, sessionId: string): boolean {
  const dir = getWorkspaceSessionDir(cwd);
  let filePath = path.join(dir, `${sessionId}.json`);

  if (!fs.existsSync(filePath)) {
    const all = listSessionSnapshots(cwd);
    const found = all.find((s) => s.id === sessionId || s.name === sessionId || s.id.startsWith(sessionId));
    if (found) {
      filePath = path.join(dir, `${found.id}.json`);
    } else {
      return false;
    }
  }

  try {
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

export function deleteAllSessionSnapshots(cwd: string): number {
  const dir = getWorkspaceSessionDir(cwd);
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (f.endsWith('.json')) {
        try {
          fs.unlinkSync(path.join(dir, f));
          count++;
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
  return count;
}


export function exportSessionToMarkdown(snapshot: SessionSnapshot, targetPath?: string): string {
  let outPath: string;

  if (targetPath) {
    if (targetPath.endsWith('/') || (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory())) {
      const fname = `qingmei-session-${snapshot.name || snapshot.id}.md`;
      outPath = path.resolve(targetPath, fname);
    } else {
      outPath = path.resolve(targetPath);
    }
  } else {
    ensureExportDir();
    const fname = `qingmei-session-${snapshot.name || snapshot.id}.md`;
    outPath = path.join(EXPORT_DIR, fname);
  }

  const lines: string[] = [
    `# Qingmei AI Session Export`,
    ``,
    `- **Session ID**: \`${snapshot.id}\``,
    snapshot.name ? `- **Session Name**: \`${snapshot.name}\`` : null,
    `- **Working Directory**: \`${snapshot.cwd}\``,
    `- **Created At**: ${new Date(snapshot.createdAt).toLocaleString()}`,
    `- **Last Updated**: ${new Date(snapshot.updatedAt).toLocaleString()}`,
    `- **Total Messages**: ${snapshot.messageCount}`,
    `- **Estimated Tokens**: ${snapshot.usedTokens}`,
    ``,
    `---`,
    ``,
  ].filter(Boolean) as string[];

  for (const m of snapshot.messages) {
    const roleTitle = m.role.toUpperCase();
    lines.push(`### [${roleTitle}]`);
    if (m.reasoning_content) {
      lines.push(`> **Thinking**:`);
      lines.push(`> ${m.reasoning_content.replace(/\n/g, '\n> ')}`);
      lines.push(``);
    }
    if (m.content) {
      lines.push(m.content);
      lines.push(``);
    }
    if (m.tool_calls && m.tool_calls.length > 0) {
      lines.push(`*Tool Calls:*`);
      for (const tc of m.tool_calls) {
        lines.push(`- \`${tc.function.name}\` (id: \`${tc.id}\`)`);
        lines.push('```json');
        lines.push(tc.function.arguments);
        lines.push('```');
      }
      lines.push(``);
    }
  }

  const parentDir = path.dirname(outPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  fs.writeFileSync(outPath, lines.join('\n'), 'utf-8');
  return outPath;
}
