import { TimeoutError, type QueueState, type QueueTicket } from '2dai-cloud-sdk';
import type { RequestContext } from './context.js';

export type WaitOutcome =
  | { kind: 'done'; ticket: QueueTicket; state: QueueState }
  | { kind: 'failed'; ticket: QueueTicket; state: QueueState }
  | { kind: 'pending'; ticket: QueueTicket; lastStatus?: string };

/** Adaptive wait — the resolution to the core tension between generation times
 *  (10 s for a fast image, ~3 min for video) and the tool-call timeouts MCP
 *  hosts impose.
 *
 *  Always submits with `wait: false` first. Blocking submits would surface a
 *  timeout as a thrown error carrying no queueId, and the caller would have
 *  paid for a generation it can no longer find. Holding the ticket first means
 *  every outcome, including giving up, can still tell the agent what to poll.
 *
 *  Under the budget the tool feels one-shot, which is the 90 % case. Over it,
 *  it degrades to a ticket plus an explicit next step rather than hanging until
 *  the host kills the call. */
export async function submitAndWait(
  ctx: RequestContext,
  submit: () => Promise<QueueTicket>,
): Promise<WaitOutcome> {
  const ticket = await submit();
  if (ctx.config.waitBudgetMs <= 0) return { kind: 'pending', ticket, lastStatus: ticket.status };
  try {
    const state = await ctx.client.queue.waitFor(ticket.queueId, {
      timeoutMs: ctx.config.waitBudgetMs,
      signal: ctx.signal,
    });
    // Any terminal status comes back as a value; only 'completed' is a success.
    return state.status === 'completed'
      ? { kind: 'done', ticket, state }
      : { kind: 'failed', ticket, state };
  } catch (err) {
    // The budget ran out — the job is still alive, so hand back the ticket.
    // An abort is NOT a timeout: the user cancelled, so let it propagate.
    if (err instanceof TimeoutError) return { kind: 'pending', ticket };
    throw err;
  }
}
