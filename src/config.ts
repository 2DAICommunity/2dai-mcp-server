/** Environment → validated config. The hosted transport swaps this file out:
 *  everything downstream receives an already-resolved config object and never
 *  reads `process.env` itself, so a per-session OAuth resolver can take its
 *  place without touching a single tool. */

export interface Config {
  apiKey: string;
  baseUrl?: string;
  /** Send a downscaled preview image back with finished generations. */
  previews: boolean;
  /** Longest edge of that preview in px — the aspect ratio is preserved, so
   *  this is a bound rather than a target shape. */
  previewMaxSide: number;
  /** How long a `wait: true` generation blocks before degrading to a ticket. */
  waitBudgetMs: number;
  /** Window in which an identical re-submit is treated as a retry, not a new
   *  generation. See `idempotency.ts` for why this is a window and not a
   *  content hash. */
  idempotencyWindowMs: number;
  /** Allow reads/writes outside the working directory. Off by default. */
  allowAnyPath: boolean;
}

export class ConfigError extends Error {}

function intFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new ConfigError(`${name} must be a number between ${min} and ${max} (got ${JSON.stringify(raw)})`);
  }
  return Math.round(value);
}

function boolFromEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(raw.trim().toLowerCase());
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiKey = (env.TWODAI_API_KEY ?? '').trim();
  if (!apiKey) {
    throw new ConfigError(
      'TWODAI_API_KEY is not set. Create a key at https://2dai.io → Dashboard → Integrations → API keys, ' +
      'then add it to this server\'s "env" block in your MCP client config.'
    );
  }
  return {
    apiKey,
    baseUrl: (env.TWODAI_API_BASE ?? '').trim() || undefined,
    previews: boolFromEnv('TWODAI_PREVIEWS', true),
    previewMaxSide: intFromEnv('TWODAI_PREVIEW_MAX_SIDE', 512, 64, 2048),
    waitBudgetMs: intFromEnv('TWODAI_WAIT_BUDGET_MS', 45_000, 0, 600_000),
    idempotencyWindowMs: intFromEnv('TWODAI_IDEMPOTENCY_WINDOW_MS', 30_000, 0, 300_000),
    allowAnyPath: boolFromEnv('TWODAI_ALLOW_ANY_PATH', false),
  };
}
