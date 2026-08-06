import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { guard, ok, fail, generationSummary, hydrateForResponse, nsfwProseFragment } from '../result.js';

/** The other half of the adaptive wait: whenever a generation outlives the
 *  wait budget, this is how the agent collects it. */
export const registerCheckGeneration: RegisterTool = (server, ctx) => {
  server.registerTool(
    'check_generation',
    {
      title: 'Check a generation',
      description:
        'Look up a generation by its queueId — the one returned when a generate_* call outlived its wait budget. ' +
        'Reports whether it is still running, and returns the finished creation once it lands. Costs nothing.',
      inputSchema: {
        queueId: z.string().min(1).describe('The queueId from a previous generate_* call.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args, extra) => guard(async () => {
      const rc = { ...ctx, signal: extra.signal };
      const state = await ctx.client.queue.get(args.queueId, extra.signal);

      if (state.status === 'completed') {
        const { creation, preview } = await hydrateForResponse(rc, state);
        const result = ok(
          `Done. creationId ${state.creationId}.` +
          nsfwProseFragment(creation) +
          ` Share the viewUrl with the user; preview attached inline (when the output is an image), and ` +
          `download_creation saves the full asset locally.`,
          generationSummary(state, creation),
        );
        if (preview) result.content.push(preview);
        return result;
      }

      const TERMINAL = ['failed', 'cancelled', 'dismissed', 'timeout', 'expired'];
      if (TERMINAL.includes(state.status)) {
        return fail(new Error(
          `Generation ${state.queueId} ended as "${state.status}"${state.error ? `: ${state.error}` : ''}.`,
        ));
      }

      return ok(
        `Still ${state.status}. Check again in a few seconds.`,
        generationSummary(state),
      );
    }),
  );
};
