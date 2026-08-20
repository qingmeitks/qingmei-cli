import { Command } from 'commander';
import { startRepl } from './repl.js';
import {
  runConfigInitWizard,
  printConfigList,
  configSet,
  configGet,
  configEdit,
} from './commands/config.js';
import { mcpList, mcpAdd, mcpRemove, mcpTest } from './commands/mcp.js';
import { skillList, skillNew, skillInfo } from './commands/skill.js';

export function createCli(): Command {
  const program = new Command();

  program
    .name('qingmei')
    .description('A modern TypeScript Agent CLI with MCP and Skill integration')
    .version('0.0.1')
    .action(async () => {
      await startRepl();
    });

  // Config subcommand
  const configCmd = program.command('config').description('Manage Qingmei global configuration');

  configCmd
    .command('init')
    .description('Run interactive configuration setup wizard')
    .action(async () => {
      await runConfigInitWizard();
    });

  configCmd
    .command('edit')
    .description('Open ~/.qingmei/config.json in your default editor')
    .action(() => {
      configEdit();
    });

  configCmd
    .command('list')
    .alias('show')
    .description('Show current configuration')
    .action(() => {
      printConfigList();
    });

  configCmd
    .command('set <key> <value>')
    .description('Set a configuration key (e.g. activeProvider, activeModel, securityMode)')
    .action((key, value) => {
      configSet(key, value);
    });

  configCmd
    .command('get <key>')
    .description('Get a configuration value')
    .action((key) => {
      configGet(key);
    });

  // MCP subcommand
  const mcpCmd = program.command('mcp').description('Manage Model Context Protocol (MCP) servers');

  mcpCmd
    .command('list')
    .description('List configured MCP servers and their status')
    .action(async () => {
      await mcpList();
    });

  mcpCmd
    .command('add <name>')
    .description('Add a new MCP server')
    .option('-c, --command <cmd>', 'Command for stdio transport (e.g. "npx -y @modelcontextprotocol/server-filesystem ./")')
    .option('-u, --url <url>', 'URL for SSE transport')
    .option('-e, --env <vars...>', 'Environment variables (KEY=VAL)')
    .action(async (name, options) => {
      await mcpAdd(name, options);
    });

  mcpCmd
    .command('remove <name>')
    .alias('rm')
    .description('Remove an MCP server')
    .action(async (name) => {
      await mcpRemove(name);
    });

  mcpCmd
    .command('test <name>')
    .alias('ping')
    .description('Test connection to an MCP server and list its tools')
    .action(async (name) => {
      await mcpTest(name);
    });

  // Skill subcommand
  const skillCmd = program.command('skill').description('Manage Agent Skills');

  skillCmd
    .command('list')
    .description('List all discovered skills')
    .action(() => {
      skillList();
    });

  skillCmd
    .command('new <name>')
    .alias('create')
    .description('Create a new skill template in ~/.qingmei/skills/<name>/SKILL.md')
    .action((name) => {
      skillNew(name);
    });

  skillCmd
    .command('info <name>')
    .description('Show metadata and instructions for a skill')
    .action((name) => {
      skillInfo(name);
    });

  return program;
}

export async function runCli(): Promise<void> {
  const program = createCli();
  await program.parseAsync(process.argv);
}
