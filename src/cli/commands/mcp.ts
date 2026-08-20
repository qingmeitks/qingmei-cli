import chalk from 'chalk';
import { MCPManager } from '../../mcp/manager.js';

export async function mcpList(): Promise<void> {
  const manager = new MCPManager();
  const servers = await manager.getServerInfos();

  console.log(chalk.bold('\nModel Context Protocol (MCP) Servers:'));

  if (servers.length === 0) {
    console.log(chalk.gray('  No MCP servers configured in ~/.qingmei/mcp.json\n'));
    console.log(
      chalk.dim('  To add a server: qingmei mcp add <name> --command "npx -y @modelcontextprotocol/server-filesystem ./ "\n')
    );
    return;
  }

  for (const s of servers) {
    const statusStr =
      s.status === 'connected'
        ? chalk.green('[connected]')
        : s.status === 'error'
        ? chalk.red('[error]')
        : chalk.gray(`[${s.status}]`);

    const latencyStr = s.latencyMs !== undefined ? chalk.dim(` (${s.latencyMs}ms)`) : '';
    const toolsStr = `${s.toolCount} tools`;

    console.log(`  * ${chalk.bold(s.name)} [${s.transportType}] ${statusStr}${latencyStr} - ${toolsStr}`);
    if (s.error) {
      console.log(chalk.red(`    Error: ${s.error}`));
    }
  }
  console.log();
}

export async function mcpAdd(
  name: string,
  options: { command?: string; url?: string; env?: string[] }
): Promise<void> {
  const manager = new MCPManager();

  if (options.command) {
    const parts = options.command.trim().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    const envMap: Record<string, string> = {};
    if (options.env) {
      for (const e of options.env) {
        const [k, v] = e.split('=');
        if (k && v) envMap[k] = v;
      }
    }

    await manager.addServer(name, {
      command: cmd,
      args,
      env: Object.keys(envMap).length > 0 ? envMap : undefined,
    });
    console.log(chalk.green(`\nMCP stdio server '${name}' added to ~/.qingmei/mcp.json\n`));
  } else if (options.url) {
    await manager.addServer(name, {
      url: options.url,
    });
    console.log(chalk.green(`\nMCP SSE server '${name}' added to ~/.qingmei/mcp.json\n`));
  } else {
    console.log(chalk.red('\nError: Please provide either --command (for stdio) or --url (for sse)\n'));
  }
}

export async function mcpRemove(name: string): Promise<void> {
  const manager = new MCPManager();
  const removed = await manager.removeServer(name);
  if (removed) {
    console.log(chalk.green(`\nMCP server '${name}' removed.\n`));
  } else {
    console.log(chalk.yellow(`\nMCP server '${name}' not found in ~/.qingmei/mcp.json\n`));
  }
}

export async function mcpTest(name: string): Promise<void> {
  const manager = new MCPManager();
  console.log(chalk.dim(`\nTesting connection to MCP server '${name}'...`));

  const result = await manager.testServer(name);
  if (result.ok) {
    console.log(chalk.green(`Connection successful (${result.latencyMs}ms)`));
    console.log(chalk.bold(`Discovered ${result.tools.length} Tools:`));
    for (const tool of result.tools) {
      console.log(`  - ${tool}`);
    }
    console.log();
  } else {
    console.log(chalk.red(`Failed to connect to '${name}': ${result.error}\n`));
  }
}
