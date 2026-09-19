import { z } from 'zod';
import type { RegisterTool } from './types.js';
import type { QueueState } from '2dai-cloud-sdk';
import { guard, ok, fail, generationSummary, hydrateForResponse, nsfwProseFragment, outcomeSuffix, outcomeText } from '../result.js';

/** The other half of the adaptive wait: whenever a generation outlives the
 *  wait budget, this is how the agent collects it. */
export const registerCheckGeneration: RegisterTool = (server, ctx) => {
  server.registerTool(
    'check_generation',
    {
      title: 'Check a generation',
      description:
        'Look up one generation by its queueId — the one returned when a generate_* call outlived its wait budget — ' +
        'or up to 25 at once with queueIds. Reports which are still running and returns the finished creations ' +
        'once they land (batch mode: one line per job, no inline previews). Costs nothing.',
      inputSchema: {
        queueId: z.string().min(1).optional().describe('The queueId from a previous generate_* call.'),
        queueIds: z.array(z.string().min(1)).min(1).max(25).optional()
          .describe('Several queueIds to poll in one call (max 25) — for a batch of shots.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args, extra) => guard(async () => {
      const rc = { ...ctx, signal: extra.signal };
      const TERMINAL = ['failed', 'cancelled', 'dismissed', 'timeout', 'expired'];

      if (args.queueIds && args.queueIds.length > 0) {
        const ids = [...new Set(args.queueIds)];
        const states = await Promise.all(ids.map(id => ctx.client.queue.get(id, extra.signal).catch((e: Error): QueueState => ({ queueId: id, status: 'failed', error: `lookup failed: ${e.message}` }))));
        const done = states.filter(s => s.status === 'completed');
        const creations = await Promise.all(done.map(s => hydrateForResponse(rc, s).then(h => h.creation).catch(() => undefined)));
        const byId = new Map(done.map((s, i) => [s.queueId, creations[i]]));
        const lines = states.map(s => {
          if (s.status === 'completed') return `${s.queueId}: done → creationId ${s.creationId}${nsfwProseFragment(byId.get(s.queueId))}`;
          if (TERMINAL.includes(s.status)) return `${s.queueId}: ${s.status}${outcomeText(s) ? ` — ${outcomeText(s)}` : ''}`;
          return `${s.queueId}: ${s.status}`;
        });
        const pending = states.filter(s => !TERMINAL.includes(s.status) && s.status !== 'completed').length;
        return ok(
          `${done.length} done, ${pending} still running, ${states.length - done.length - pending} ended in error.\n` + lines.join('\n') +
          (pending > 0 ? '\nCheck again in a few seconds for the running ones.' : ''),
          { jobs: states.map(s => generationSummary(s, byId.get(s.queueId))), done: done.length, pending },
        );
      }

      if (!args.queueId) return fail(new Error('Pass a queueId, or queueIds for a batch.'));
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

      if (TERMINAL.includes(state.status)) {
        return fail(new Error(
          `Generation ${state.queueId} ended as "${state.status}"${outcomeSuffix(state)}`,
        ));
      }

      return ok(
        `Still ${state.status}. Check again in a few seconds.`,
        generationSummary(state),
      );
    }),
  );
};
