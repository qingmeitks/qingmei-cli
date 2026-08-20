#!/usr/bin/env node
import { runCli } from '../src/cli/index.js';

runCli().catch((err) => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
