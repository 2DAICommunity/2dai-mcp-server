import { Client } from '2dai-cloud-sdk';
import type { Config } from './config.js';

/** Everything a tool handler is allowed to reach. Handlers receive this
 *  explicitly — none of them touches `process.env`, stdio or a module-level
 *  singleton, which is what lets one process serve many sessions once the
 *  hosted transport lands. */
export interface ToolContext {
  client: Client;
  config: Config;
}

/** The per-request slice: the host's cancellation signal, so a tool the user
 *  interrupted stops polling instead of burning API calls to completion. */
export interface RequestContext extends ToolContext {
  signal: AbortSignal;
}

export const VERSION = '1.2.0';

/** Builds the SDK client. `integration: 'mcp'` matters: it is how the
 *  platform attributes every creation made through this server to the MCP
 *  integration (`source: 'mcp'`), which is what files them into the
 *  dashboard's Cloud Drive → MCP collection. Drop it and every creation is
 *  silently misfiled under SDK — which is why the E2E suite asserts the
 *  stamp rather than trusting a code review. */
export function createClient(config: Config): Client {
  return new Client({
    apiKey: config.apiKey,
    ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    integration: 'mcp',
    integrationVersion: VERSION,
  });
}
