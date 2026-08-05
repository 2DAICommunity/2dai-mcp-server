#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, ConfigError } from './config.js';
import { createClient } from './context.js';
import { createServer } from './server.js';

/** The ONLY stdio-aware file. Everything it touches — config, server, tools —
 *  is transport-agnostic, so adding a hosted HTTP entry point later is a new
 *  file beside this one rather than a rewrite.
 *
 *  stdout is the JSON-RPC channel: a single stray `console.log` anywhere in
 *  `src/` corrupts the stream and the host drops the connection with no useful
 *  message. All diagnostics go to stderr, and `npm run lint:stdout` fails the
 *  build if a `console.log` ever creeps in. */
async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`[2dai-mcp-server] ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  const server = createServer(config, createClient(config));
  await server.connect(new StdioServerTransport());
  process.stderr.write('[2dai-mcp-server] ready on stdio\n');
}

main().catch((err: unknown) => {
  process.stderr.write(`[2dai-mcp-server] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
