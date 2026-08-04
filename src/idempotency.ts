import { createHash } from 'node:crypto';

/** Idempotency tokens for generation submits.
 *
 *  Why this is not derived from the MCP request id: a host retry is a NEW
 *  JSON-RPC request with a new id, so an id-derived token would differ on
 *  exactly the call we need to deduplicate — and a generation is real money.
 *
 *  Why it is not a pure hash of the arguments either: the API rejects a
 *  reused clientToken permanently, so an argument-only token would bar the
 *  user from ever generating that exact prompt again — the second attempt,
 *  days later, would still collide.
 *
 *  So: hash the arguments together with a coarse time bucket. Identical
 *  arguments inside the window collide and the API answers 409
 *  IDEMPOTENT_RETRY without charging; the same request later is simply a new
 *  generation. The window is wider than the API's own short dedup because a
 *  host retry typically follows a transport failure some seconds after the
 *  fact.
 *
 *  Bucket edges are a deliberate tradeoff, not a bug: two calls 1 ms apart can
 *  straddle a boundary and both go through. Anchoring the bucket to the
 *  arguments' own hash staggers those edges across different requests instead
 *  of aligning every user on the same global clock tick. */
export function idempotencyToken(
  toolName: string,
  args: unknown,
  windowMs: number,
  now: number = Date.now(),
): string | undefined {
  if (windowMs <= 0) return undefined;
  const body = stableStringify({ tool: toolName, args });
  const salt = createHash('sha256').update(body).digest();
  // Offset the window per-argument-set so boundaries do not line up globally.
  const offset = salt.readUInt32BE(0) % windowMs;
  const bucket = Math.floor((now + offset) / windowMs);
  // The API validates clientToken against /^[0-9a-f]{1,64}$/i.
  return createHash('sha256').update(`${body}|${bucket}`).digest('hex').slice(0, 40);
}

/** Key order must not change the token, or an equivalent retry would miss. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}
