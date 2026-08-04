import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { QueueState, QueueTicket } from '2dai-cloud-sdk';
import type { RequestContext } from './context.js';
import { describeError } from './errors.js';

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

/** One shape for "a generation reached a terminal or pending state", shared by
 *  every generation tool and by check_generation, so an agent sees the same
 *  fields no matter which one it called. `viewUrl` is the link to hand to the
 *  human; `downloadUrl` is key-authenticated (for the download_creation tool),
 *  never a browser link. */
export function generationSummary(state: QueueState): Record<string, unknown> {
  return {
    queueId: state.queueId,
    status: state.status,
    creationId: state.creationId,
    viewUrl: viewUrlFor(state.creationId),
    cdnId: state.cdnId,
    downloadUrl: state.downloadUrl,
    costUsd: state.costUsd,
    completedAt: state.completedAt,
  };
}

export function pendingResult(ticket: QueueTicket, lastStatus?: string): CallToolResult {
  return ok(
    `Still running after the wait budget — this is normal for video and high-quality images. ` +
    `Call check_generation with queueId "${ticket.queueId}" to collect it.`,
    { queueId: ticket.queueId, status: lastStatus ?? ticket.status, pending: true },
  );
}
