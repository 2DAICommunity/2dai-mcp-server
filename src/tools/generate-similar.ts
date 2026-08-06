import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { guard, ok, fail, generationSummary, hydrateForResponse, nsfwProseFragment, pendingResult } from '../result.js';
import { submitAndWait } from '../wait.js';

export const registerGenerateSimilar: RegisterTool = (server, ctx) => {
  server.registerTool(
    'generate_similar',
    {
      title: 'Generate more like a creation',
      description:
        'Re-run an existing creation — the SERVER re-derives the original tool\'s parameters (prompt, ' +
        'style, quality, dimensions, references) from the stored row and submits a fresh generation. ' +
        'This SPENDS the account\'s credit at the usual price. The natural "make more like this one" ' +
        'verb: no parameters to reconstruct. Raw uploads and wallpaper-resize outputs can\'t be ' +
        're-derived and are refused. Rapid identical calls within ~5s are deduplicated server-side, ' +
        'never double-charged.',
      inputSchema: {
        creationId: z.string().length(32)
          .describe('The creation to re-run — from an earlier generation or list_creations.'),
        wait: z.boolean().optional().describe('Block until ready (default true). Set false to get a queueId immediately.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args, extra) => guard(async () => {
      const rc = { ...ctx, signal: extra.signal };
      // No client idempotency token here: the server rebuilds the whole submit
      // body from the stored creation, so its own 5s dedup bucket is the
      // authority — identical derived bodies collapse by construction.
      const submit = () => ctx.client.generate.similar(
        args.creationId,
        { wait: false, signal: extra.signal },
      );

      if (args.wait === false) {
        const ticket = await submit();
        return ok(
          `Queued. Call check_generation with queueId "${ticket.queueId}" to collect it.`,
          { queueId: ticket.queueId, status: ticket.status, costUsd: ticket.costUsd },
        );
      }

      const outcome = await submitAndWait(rc, submit);
      if (outcome.kind === 'pending') return pendingResult(outcome.ticket, outcome.lastStatus);
      if (outcome.kind === 'failed') {
        return fail(new Error(
          `Generation ${outcome.state.queueId} ended as "${outcome.state.status}"` +
          `${outcome.state.error ? `: ${outcome.state.error}` : ''}.`,
        ));
      }

      const { state } = outcome;
      const { creation, preview } = await hydrateForResponse(rc, state);
      const result = ok(
        `Variation ready. creationId ${state.creationId} (parent kept in retriedFromCreationId).` +
        nsfwProseFragment(creation) +
        ` Share the viewUrl with the user; preview attached inline.`,
        generationSummary(state, creation),
      );
      if (preview) result.content.push(preview);
      return result;
    }),
  );
};
