import fs from 'fs';
import path from 'path';
import { isPathContained } from '../security/trust.js';

export interface ReferencedFile {
  relativePath: string;
  absolutePath: string;
  content: string;
  size: number;
  isTruncated?: boolean;
}

export interface MentionExpansionResult {
  originalInput: string;
  expandedPrompt: string;
  referencedFiles: ReferencedFile[];
}

const MAX_FILE_SIZE = 100 * 1024; // 100 KB max for auto-injection
const MAX_TOTAL_SIZE = 300 * 1024; // 300 KB max total across all referenced files

/**
 * Extracts @filepath references from a user prompt, reads valid files,
 * and formats them as structured context blocks.
 */
export function expandMentions(input: string, workspaceRoot: string): MentionExpansionResult {
  // Regex to match @filepath patterns (e.g. @src/core/agent.ts, @"src/my path.ts")
  const mentionRegex = /@(?:"([^"]+)"|'([^']+)'|([a-zA-Z0-9_\-./\\]+))/g;
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(input)) !== null) {
    const filePath = match[1] || match[2] || match[3];
    if (filePath && !matches.includes(filePath)) {
      matches.push(filePath);
    }
  }

  if (matches.length === 0) {
    return {
      originalInput: input,
      expandedPrompt: input,
      referencedFiles: [],
    };
  }

  const referencedFiles: ReferencedFile[] = [];
  let totalSize = 0;

  for (const rawPath of matches) {
    // Normalize path relative to workspaceRoot
    const cleanRelPath = rawPath.replace(/^@/, '').trim();
    const absPath = path.isAbsolute(cleanRelPath)
      ? path.normalize(cleanRelPath)
      : path.resolve(workspaceRoot, cleanRelPath);

    // Security check: ensure file is inside workspace or trusted
    if (!isPathContained(absPath, workspaceRoot)) {
      continue;
    }

    if (!fs.existsSync(absPath)) {
      continue;
    }

    try {
      const stats = fs.statSync(absPath);
      if (!stats.isFile()) {
        continue;
      }

      if (totalSize + stats.size > MAX_TOTAL_SIZE) {
        // Exceeded total size limit
        referencedFiles.push({
          relativePath: path.relative(workspaceRoot, absPath) || path.basename(absPath),
          absolutePath: absPath,
          content: `[File content omitted: Total @mention size exceeded ${Math.round(MAX_TOTAL_SIZE / 1024)}KB limit]`,
          size: stats.size,
          isTruncated: true,
        });
        continue;
      }

      if (stats.size > MAX_FILE_SIZE) {
        // Read first 100KB
        const fd = fs.openSync(absPath, 'r');
        const buffer = Buffer.alloc(MAX_FILE_SIZE);
        const bytesRead = fs.readSync(fd, buffer, 0, MAX_FILE_SIZE, 0);
        fs.closeSync(fd);
        const text = buffer.toString('utf-8', 0, bytesRead);

        referencedFiles.push({
          relativePath: path.relative(workspaceRoot, absPath) || path.basename(absPath),
          absolutePath: absPath,
          content: `${text}\n\n[... truncated: file exceeds ${Math.round(MAX_FILE_SIZE / 1024)}KB limit ...]`,
          size: stats.size,
          isTruncated: true,
        });
        totalSize += MAX_FILE_SIZE;
      } else {
        const text = fs.readFileSync(absPath, 'utf-8');
        referencedFiles.push({
          relativePath: path.relative(workspaceRoot, absPath) || path.basename(absPath),
          absolutePath: absPath,
          content: text,
          size: stats.size,
          isTruncated: false,
        });
        totalSize += stats.size;
      }
    } catch {
      // Ignore unreadable files
    }
  }

  if (referencedFiles.length === 0) {
    return {
      originalInput: input,
      expandedPrompt: input,
      referencedFiles: [],
    };
  }

  // Format referenced files as structured XML blocks
  const fileContextBlocks = referencedFiles
    .map(
      (f) =>
        `<referenced_file path="${f.relativePath}">\n${f.content}\n</referenced_file>`
    )
    .join('\n\n');

  const expandedPrompt = `${fileContextBlocks}\n\n${input}`;

  return {
    originalInput: input,
    expandedPrompt,
    referencedFiles,
  };
}
