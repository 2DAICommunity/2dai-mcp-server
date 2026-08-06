import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Creation, QueueState, QueueTicket } from '2dai-cloud-sdk';
import type { RequestContext } from './context.js';
import { describeError } from './errors.js';

/** NSFW tier threshold at which the vision-derived description is dropped
 *  from generation responses. The label + numeric rate still ship — only the
 *  caption text is withheld, so the agent knows why and can opt into
 *  fetching it via `get_creation` when it genuinely needs the caption. */
export const DESCRIPTION_NSFW_MASK_RATE = 0.8;

/** Tool results carry BOTH a human/agent-readable line and a structured JSON
 *  block. Models act on the prose; scripted callers parse the JSON. Sending
 *  only one of the two makes the server awkward for whichever consumer missed
 *  out. */
export function ok(summary: string, data?: Record<string, unknown>): CallToolResult {
  const content: CallToolResult['content'] = [{ type: 'text', text: summary }];
  if (data) content.push({ type: 'text', text: JSON.stringify(data, null, 2) });
  return { content };
}

/** Failures come back as tool errors, never as thrown exceptions: an exception
 *  escaping a handler kills the stdio connection and the host shows "server
 *  crashed" instead of the actual reason. */
export function fail(err: unknown): CallToolResult {
  return { content: [{ type: 'text', text: describeError(err) }], isError: true };
}

/** Wraps a handler so no error can reach the transport. */
export async function guard(run: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await run();
  } catch (err) {
    return fail(err);
  }
}

/** Downscaled preview so the model can SEE what it generated and iterate on it —
 *  the main thing this server offers over raw REST.
 *
 *  `maxSide` scales the longest edge and preserves the aspect ratio, which is
 *  what a preview wants; `width`/`height` would crop. The CDN does the resizing,
 *  so no encoder ships in this package. Full-resolution bytes only ever go to
 *  disk via `savePath`, never through the context window: the full asset is
 *  ~1.2 MB of JPEG (~1.6 MB once base64-encoded), against ~130 kB and roughly
 *  230 image tokens at 512 px.
 *
 *  A preview is a bonus, never a precondition — any failure here is swallowed so
 *  a CDN hiccup cannot turn a successful, already-charged generation into a tool
 *  error. Non-image output (video) is skipped rather than sent as a broken
 *  block. */
export async function previewBlock(
  ctx: RequestContext,
  cdnId: string | undefined,
): Promise<CallToolResult['content'][number] | undefined> {
  if (!ctx.config.previews || !cdnId) return undefined;
  try {
    const asset = await ctx.client.cdn.fetch(cdnId, {
      maxSide: ctx.config.previewMaxSide,
      signal: ctx.signal,
    });
    if (!asset.contentType.startsWith('image/')) return undefined;
    return {
      type: 'image',
      data: Buffer.from(asset.bytes).toString('base64'),
      mimeType: asset.contentType,
    };
  } catch {
    return undefined;
  }
}

/** Human-shareable link: opens the creation in the owner's 2DAI cloud drive
 *  (login prompt if needed). This is the ONLY link that works in a browser —
 *  the CDN download path requires the API key header and 401s otherwise. */
export function viewUrlFor(creationId: string | undefined): string | undefined {
  return creationId ? `https://www.2dai.io/dashboard?s=cloud&openCreation=${creationId}` : undefined;
}

/** Mirror of the studio's `nsfwScoreLabel` — same 5 tiers, same 2-decimal
 *  floor with a +1e-10 epsilon so a 0.9976 doesn't visually promote to
 *  Prohibited. Returns `null` when there is no numeric rate (unrated),
 *  which lets callers omit the field cleanly rather than shipping "SFW"
 *  as a default for content that never got a moderation pass. */
export function nsfwLabel(rate: number | undefined | null): string | null {
  if (typeof rate !== 'number' || !isFinite(rate)) return null;
  const clamped = Math.max(0, Math.min(1, rate));
  return clamped >= 1     ? 'Prohibited'
       : clamped >= 0.99  ? 'Adult NSFW'
       : clamped >= 0.8   ? 'Near-nude'
       : clamped >= 0.6   ? 'Suggestive'
                          : 'SFW';
}

/** One shape for "a generation reached a terminal or pending state", shared by
 *  every generation tool and by check_generation, so an agent sees the same
 *  fields no matter which one it called.
 *
 *  `viewUrl` is the ONLY shareable link (owner opens it on 2DAI, login
 *  survives the redirect). The old `downloadUrl` and `cdnId` used to ship
 *  here — they're gone: `downloadUrl` 401s in a browser (bearer-required)
 *  and `cdnId` was only ever useful as an alt input to `download_creation`,
 *  which already takes `creationId`. Fewer fields, one clear path.
 *
 *  When `creation` is passed (hydrated via `client.creations.get()` after
 *  completion), the summary carries what the agent needs to make sense of
 *  the output: NSFW rate + label, dimensions, and the vision caption (unless
 *  the NSFW tier gates it — see DESCRIPTION_NSFW_MASK_RATE). */
export function generationSummary(state: QueueState, creation?: Creation): Record<string, unknown> {
  const rate = creation?.nsfwRate;
  const label = nsfwLabel(rate);
  const descriptionHidden = typeof rate === 'number' && rate >= DESCRIPTION_NSFW_MASK_RATE;
  return {
    queueId: state.queueId,
    status: state.status,
    creationId: state.creationId,
    viewUrl: viewUrlFor(state.creationId),
    costUsd: state.costUsd,
    completedAt: state.completedAt,
    ...(creation?.width !== undefined ? { width: creation.width } : {}),
    ...(creation?.height !== undefined ? { height: creation.height } : {}),
    ...(typeof rate === 'number' ? { nsfwRate: rate } : {}),
    ...(label ? { nsfwLabel: label } : {}),
    ...(creation?.nsfwFlagged ? { nsfwFlagged: true } : {}),
    ...(creation?.description && !descriptionHidden ? { description: creation.description } : {}),
    ...(descriptionHidden ? { descriptionHidden: true } : {}),
  };
}

/** Prose fragment appended to the generation-ready line when the content
 *  scored above SFW. SFW is the norm and would just be noise; anything from
 *  Suggestive up warrants a heads-up so the agent can decide whether to hand
 *  the creation to the user as-is. */
export function nsfwProseFragment(creation: Creation | undefined): string {
  const rate = creation?.nsfwRate;
  const label = nsfwLabel(rate);
  if (!label || label === 'SFW' || typeof rate !== 'number') return '';
  const floored = Math.floor(rate * 100 + 1e-10) / 100;
  const gated = rate >= DESCRIPTION_NSFW_MASK_RATE
    ? ' Description withheld at this tier — call get_creation if you need the caption.'
    : '';
  return ` NSFW: ${label} (${floored.toFixed(2)}).${gated}`;
}

/** Run the creation-metadata hydrate and the CDN preview fetch in ONE round-trip:
 *  both hit the API/CDN backend and neither depends on the other, so serialising
 *  would double the tail latency for no gain. Both fail-soft: metadata errors
 *  return undefined (summary degrades to bare QueueState fields), preview errors
 *  return undefined (image block absent). Neither can turn a successful,
 *  already-charged generation into a tool error. */
export async function hydrateForResponse(
  ctx: RequestContext,
  state: QueueState,
  previewCdnId?: string,
): Promise<{ creation: Creation | undefined; preview: CallToolResult['content'][number] | undefined }> {
  const [creation, preview] = await Promise.all([
    state.creationId
      ? ctx.client.creations.get(state.creationId, ctx.signal).catch(() => undefined)
      : Promise.resolve(undefined),
    previewBlock(ctx, previewCdnId ?? state.cdnId),
  ]);
  return { creation, preview };
}

export function pendingResult(ticket: QueueTicket, lastStatus?: string): CallToolResult {
  return ok(
    `Still running after the wait budget — this is normal for video and high-quality images. ` +
    `Call check_generation with queueId "${ticket.queueId}" to collect it.`,
    { queueId: ticket.queueId, status: lastStatus ?? ticket.status, pending: true },
  );
}
