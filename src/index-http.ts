#!/usr/bin/env node
import { loadHostedConfig, ConfigError } from './config.js';
import { startHttpServer } from './serve-http.js';

/** Hosted entry point (mcp.2dai.io). Sibling of `index.ts`, which stays the
 *  stdio entry consumed by `npx 2dai-mcp-server` on user machines. Neither
 *  file knows anything about tools or the SDK — that's all in server.ts and
 *  transport-agnostic. */
async function main(): Promise<void> {
  let hosted;
  try {
    hosted = loadHostedConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`[2dai-mcp-server] ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
  startHttpServer(hosted);
}

main().catch((err: unknown) => {
  process.stderr.write(
    `[2dai-mcp-server] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
