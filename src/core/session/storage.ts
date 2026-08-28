import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { ChatMessage } from '../llm/types.js';

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
  const normalized = path.resolve(cwd);
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

export function getWorkspaceSessionDir(cwd: string): string {
  const hash = getWorkspaceHash(cwd);
  const homeDir = os.homedir();
  return path.join(homeDir, '.qingmei', 'sessions', hash);
}

export function ensureWorkspaceSessionDir(cwd: string): string {
  const dir = getWorkspaceSessionDir(cwd);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Format timestamp / Date to 24-hour time string: HH:mm:ss (e.g. 09:50:40 or 14:30:15)
 */
export function formatTime24(dateInput?: number | Date | string | null): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'object' ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Format timestamp / Date to 24-hour date-time string: YYYY-MM-DD HH:mm:ss (e.g. 2026-08-28 09:47:59)
 */
export function formatDateTime24(dateInput?: number | Date | string | null): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'object' ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function generateSessionId(): string {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
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

export function findMatchingSnapshot(snapshots: SessionSnapshot[], query: string): SessionSnapshot | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;

  // 1. Exact match on ID
  const exactId = snapshots.find((s) => s.id.toLowerCase() === q);
  if (exactId) return exactId;

  // 2. Exact match on Name
  const exactName = snapshots.find((s) => s.name && s.name.toLowerCase() === q);
  if (exactName) return exactName;

  // 3. StartsWith ID or Name
  const startsWith = snapshots.find(
    (s) => s.id.toLowerCase().startsWith(q) || (s.name && s.name.toLowerCase().startsWith(q))
  );
  if (startsWith) return startsWith;

  // 4. Substring / Suffix match on ID or Name
  const includes = snapshots.find(
    (s) => s.id.toLowerCase().includes(q) || (s.name && s.name.toLowerCase().includes(q))
  );
  if (includes) return includes;

  return undefined;
}

export function loadSessionSnapshot(cwd: string, sessionIdOrQuery: string): SessionSnapshot | null {
  const dir = getWorkspaceSessionDir(cwd);
  let filePath = path.join(dir, `${sessionIdOrQuery}.json`);

  if (!fs.existsSync(filePath)) {
    const all = listSessionSnapshots(cwd);
    const found = findMatchingSnapshot(all, sessionIdOrQuery);
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

export function deleteSessionSnapshot(cwd: string, sessionIdOrQuery: string): boolean {
  const dir = getWorkspaceSessionDir(cwd);
  let filePath = path.join(dir, `${sessionIdOrQuery}.json`);

  if (!fs.existsSync(filePath)) {
    const all = listSessionSnapshots(cwd);
    const found = findMatchingSnapshot(all, sessionIdOrQuery);
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
  if (!fs.existsSync(dir)) {
    return 0;
  }

  let count = 0;
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          fs.unlinkSync(path.join(dir, file));
          count++;
        } catch {
          // ignore
        }
      }
    }
  } catch {
    return count;
  }
  return count;
}

export function exportSessionToMarkdown(snapshot: SessionSnapshot, customTargetPath?: string): string {
  let targetPath = customTargetPath;
  if (!targetPath) {
    const homeDir = os.homedir();
    const exportDir = path.join(homeDir, '.qingmei', 'exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }
    targetPath = path.join(exportDir, `${snapshot.id}.md`);
  } else {
    targetPath = path.resolve(targetPath);
    const parent = path.dirname(targetPath);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }
  }

  const lines: string[] = [];
  const sessionName = snapshot.name ? ` - ${snapshot.name}` : '';
  lines.push(`# Qingmei AI Session Export${sessionName}`);
  lines.push('');
  lines.push(`- **Session ID**: \`${snapshot.id}\``);
  lines.push(`- **Workspace**: \`${snapshot.cwd}\``);
  lines.push(`- **Created At**: ${formatDateTime24(snapshot.createdAt)}`);
  lines.push(`- **Updated At**: ${formatDateTime24(snapshot.updatedAt)}`);
  lines.push(`- **Message Count**: ${snapshot.messageCount}`);
  lines.push(`- **Estimated Tokens**: ~${snapshot.usedTokens}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of snapshot.messages) {
    if (msg.role === 'user') {
      lines.push(`### 👤 User`);
      lines.push('');
      lines.push(msg.content || '');
      lines.push('');
    } else if (msg.role === 'assistant') {
      lines.push(`### 🤖 Qingmei Agent`);
      lines.push('');
      if (msg.reasoning_content) {
        lines.push('> **Thinking / Reasoning**:');
        lines.push('>');
        lines.push(`> ${msg.reasoning_content.replace(/\n/g, '\n> ')}`);
        lines.push('');
      }
      if (msg.content) {
        lines.push(msg.content);
        lines.push('');
      }
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        lines.push('**Tool Calls**:');
        for (const tc of msg.tool_calls) {
          lines.push(`- \`${tc.function.name}\` with arguments: \`${tc.function.arguments}\``);
        }
        lines.push('');
      }
    } else if (msg.role === 'tool') {
      lines.push(`#### 🔧 Tool Output (${msg.name || 'tool'})`);
      lines.push('```');
      lines.push(msg.content || '');
      lines.push('```');
      lines.push('');
    }
  }

  fs.writeFileSync(targetPath, lines.join('\n'), 'utf-8');
  return targetPath;
}
