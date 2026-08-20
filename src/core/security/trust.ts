import path from 'path';
import { loadConfig, saveConfig } from '../../config/loader.js';

/**
 * Checks if a given directory is trusted based on the trusted workspaces list.
 * A directory is considered trusted if it matches a trusted path exactly
 * or is a subfolder of an already trusted workspace.
 */
export function isWorkspaceTrusted(dir: string, trustedWorkspaces?: string[]): boolean {
  if (!dir) return false;
  const list = trustedWorkspaces || loadConfig().trustedWorkspaces || [];
  if (list.length === 0) return false;

  const targetDir = path.resolve(dir);

  for (const trusted of list) {
    const trustedAbs = path.resolve(trusted);
    if (targetDir === trustedAbs) {
      return true;
    }
    const rel = path.relative(trustedAbs, targetDir);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      return true;
    }
  }

  return false;
}

/**
 * Adds a workspace directory to the persistent trusted workspaces list in config.json.
 */
export function addTrustedWorkspace(dir: string): void {
  const absDir = path.resolve(dir);
  const config = loadConfig();
  const currentList = config.trustedWorkspaces || [];

  if (!currentList.some((p) => path.resolve(p) === absDir)) {
    const updated = [...currentList, absDir];
    saveConfig({ trustedWorkspaces: updated });
  }
}

/**
 * Removes a workspace directory from the persistent trusted workspaces list.
 */
export function removeTrustedWorkspace(dir: string): void {
  const absDir = path.resolve(dir);
  const config = loadConfig();
  const currentList = config.trustedWorkspaces || [];

  const updated = currentList.filter((p) => path.resolve(p) !== absDir);
  saveConfig({ trustedWorkspaces: updated });
}

/**
 * Validates whether a target file/directory path is strictly contained within
 * the workspace root directory, preventing directory traversal attacks.
 */
export function isPathContained(targetPath: string, workspaceRoot: string): boolean {
  if (!targetPath || !workspaceRoot) return false;

  const absRoot = path.resolve(workspaceRoot);
  const absTarget = path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(absRoot, targetPath);

  if (absTarget === absRoot) return true;

  const rel = path.relative(absRoot, absTarget);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}
