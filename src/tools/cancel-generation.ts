import { z } from 'zod';
import { ApiError } from '2dai-cloud-sdk';
import type { RegisterTool } from './types.js';
import { guard, ok, fail } from '../result.js';

export const registerCancelGeneration: RegisterTool = (server, ctx) => {
  server.registerTool(
    'cancel_generation',
    {
      title: 'Cancel a queued generation',
      description:
        'Cancel a generation that is still WAITING in the queue — its charge is refunded and the ' +
        'queue slot freed. Only works before processing starts: once a worker has picked the job up ' +
        'it cannot be aborted, and this returns an explanation with the current status instead. ' +
        'Costs nothing.',
      inputSchema: {
        queueId: z.string().min(1).describe('The queueId from a previous generate_* call.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args, extra) => guard(async () => {
      try {
        const res = await ctx.client.queue.cancel(args.queueId, extra.signal);
        return ok('Cancelled — the charge was refunded and the queue slot released.', res);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'NOT_PENDING') {
          const status = typeof (err.details as { status?: unknown })?.status === 'string'
            ? (err.details as { status: string }).status
            : undefined;
          const running = status === 'processing' || status === 'inProgress';
          return fail(new Error(
            `Too late to cancel — this generation is already ${status ?? 'past the queue'}. ` +
            (running
              ? 'Let it finish and collect it with check_generation; if it fails on its own, the charge is refunded automatically.'
              : 'It already reached a final state — check_generation shows the outcome.'),
          ));
        }
        throw err;
      }
    }),
  );
};
