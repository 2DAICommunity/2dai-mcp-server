/** Environment → validated config. The hosted transport swaps this file out:
 *  everything downstream receives an already-resolved config object and never
 *  reads `process.env` itself, so a per-session OAuth resolver can take its
 *  place without touching a single tool. */

/** What the file-path inputs (`upload_image`/`upload_audio` `path`, `download_creation`
 *  `savePath`) may touch. `cwd`: paths resolve against the working directory and must stay
 *  inside it — the default for a server running on the user's machine. `any`: no boundary.
 *  `none`: no filesystem at all — the hosted transport's default, where "disk" would be the
 *  server's own container: uploads take base64, downloads hand out `downloadUrl`. */
export type FileAccess = 'cwd' | 'any' | 'none';

/** Public API origin — what an agent can reach from outside. Same default as the SDK. */
export const DEFAULT_PUBLIC_API_BASE = 'https://dapp.2dai.io:444';

export interface Config {
  apiKey: string;
  baseUrl?: string;
  /** Origin the `downloadUrl` of a creation is built on. The hosted process talks to the
   *  API over a private address that means nothing to the caller, so this is kept apart
   *  from `baseUrl`. */
  publicApiBase: string;
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
  fileAccess: FileAccess;
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

function fileAccessFromEnv(env: NodeJS.ProcessEnv, fallback: FileAccess): FileAccess {
  const raw = (env.TWODAI_FILE_ACCESS ?? '').trim().toLowerCase();
  if (raw === 'cwd' || raw === 'any' || raw === 'none') return raw;
  if (raw !== '') {
    throw new ConfigError(`TWODAI_FILE_ACCESS must be "cwd", "any" or "none" (got ${JSON.stringify(env.TWODAI_FILE_ACCESS)})`);
  }
  // Legacy switch — existing stdio configs keep working.
  const legacy = (env.TWODAI_ALLOW_ANY_PATH ?? '').trim().toLowerCase();
  if (legacy !== '' && !['0', 'false', 'no', 'off'].includes(legacy)) return 'any';
  return fallback;
}

function originFromEnv(raw: string | undefined): string | undefined {
  const value = (raw ?? '').trim().replace(/\/+$/, '');
  return value || undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiKey = (env.TWODAI_API_KEY ?? '').trim();
  if (!apiKey) {
    throw new ConfigError(
      'TWODAI_API_KEY is not set. Create a key at https://2dai.io → Dashboard → Integrations → API keys, ' +
      'then add it to this server\'s "env" block in your MCP client config.'
    );
  }
  const baseUrl = originFromEnv(env.TWODAI_API_BASE);
  return {
    apiKey,
    baseUrl,
    publicApiBase: originFromEnv(env.TWODAI_PUBLIC_API_BASE) ?? baseUrl ?? DEFAULT_PUBLIC_API_BASE,
    previews: boolFromEnv('TWODAI_PREVIEWS', true),
    previewMaxSide: intFromEnv('TWODAI_PREVIEW_MAX_SIDE', 512, 64, 2048),
    waitBudgetMs: intFromEnv('TWODAI_WAIT_BUDGET_MS', 45_000, 0, 600_000),
    idempotencyWindowMs: intFromEnv('TWODAI_IDEMPOTENCY_WINDOW_MS', 30_000, 0, 300_000),
    fileAccess: fileAccessFromEnv(env, 'cwd'),
  };
}

/** Hosted (mcp.2dai.io) runtime config. The apiKey is NOT read from env here —
 *  each incoming request supplies its own via `Authorization: Bearer`, and the
 *  serve-http handler folds it back into a per-request `Config` object. */
export interface HostedConfig extends Omit<Config, 'apiKey'> {
  port: number;
  bindHost: string;
}

export function loadHostedConfig(env: NodeJS.ProcessEnv = process.env): HostedConfig {
  // The filesystem here is the server's own container: never the caller's disk.
  // `none` is the default; `cwd` stays possible for a self-hosted single-user
  // setup; `any` is refused outright rather than left to a forgotten env line.
  const fileAccess = fileAccessFromEnv(env, 'none');
  if (fileAccess === 'any') {
    throw new ConfigError(
      'TWODAI_FILE_ACCESS=any (or TWODAI_ALLOW_ANY_PATH=1) is refused on the hosted transport: ' +
      'the filesystem here belongs to the server, not to the caller.',
    );
  }
  return {
    baseUrl: originFromEnv(env.TWODAI_API_BASE),
    // The public origin, NOT TWODAI_API_BASE: on mcp.2dai.io that one is the
    // private docker address of the API.
    publicApiBase: originFromEnv(env.TWODAI_PUBLIC_API_BASE) ?? DEFAULT_PUBLIC_API_BASE,
    previews: boolFromEnv('TWODAI_PREVIEWS', true),
    previewMaxSide: intFromEnv('TWODAI_PREVIEW_MAX_SIDE', 512, 64, 2048),
    waitBudgetMs: intFromEnv('TWODAI_WAIT_BUDGET_MS', 45_000, 0, 600_000),
    idempotencyWindowMs: intFromEnv('TWODAI_IDEMPOTENCY_WINDOW_MS', 30_000, 0, 300_000),
    fileAccess,
    port: intFromEnv('TWODAI_HTTP_PORT', 3100, 1, 65_535),
    bindHost: (env.TWODAI_HTTP_HOST ?? '0.0.0.0').trim() || '0.0.0.0',
  };
}
