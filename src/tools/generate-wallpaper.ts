import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { guard, ok, fail, generationSummary, hydrateForResponse, nsfwProseFragment, pendingResult } from '../result.js';
import { submitAndWait } from '../wait.js';
import { idempotencyToken } from '../idempotency.js';

export const registerGenerateWallpaper: RegisterTool = (server, ctx) => {
  server.registerTool(
    'generate_wallpaper',
    {
      title: 'Expand a creation into a wallpaper',
      description:
        'Expand an existing creation into a wallpaper format — the original content is preserved and ' +
        'the surroundings are painted outward to fill the new shape. This SPENDS the account\'s ' +
        'credit: the price follows the chosen dimension, and quality is fixed at Ultra (there is no ' +
        'quality knob on this tool). Dimensions: "standard", "photo", "widescreen", "ultrawide" — ' +
        'unknown values are rejected. Optional extra refs and a prompt steer the newly painted areas. ' +
        'Returns the finished creation within the wait budget, else a queueId for check_generation.',
      inputSchema: {
        inputCreationId: z.string().length(32)
          .describe('The creation to expand — from an earlier generation, upload_image or list_creations.'),
        dimension: z.string().min(1)
          .describe('Target wallpaper dimension id: "standard", "photo", "widescreen" or "ultrawide". Drives the price.'),
        refCreationIds: z.array(z.string().length(32)).max(3).optional()
          .describe('Up to 3 extra reference creations to steer the expanded areas.'),
        prompt: z.string().max(500).optional()
          .describe('Optional guidance for what the newly painted areas should contain.'),
        allowNSFW: z.boolean().optional().describe('Permit adult content, if the account allows it.'),
        wait: z.boolean().optional().describe('Block until ready (default true). Set false to get a queueId immediately.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args, extra) => guard(async () => {
      const rc = { ...ctx, signal: extra.signal };
      const params = {
        inputCreationId: args.inputCreationId,
        dimension: args.dimension,
        ...(args.refCreationIds?.length ? { refCreationIds: args.refCreationIds } : {}),
        ...(args.prompt ? { prompt: args.prompt } : {}),
        ...(args.allowNSFW !== undefined ? { allowNSFW: args.allowNSFW } : {}),
      };
      const clientToken = idempotencyToken('generate_wallpaper', params, ctx.config.idempotencyWindowMs);

      const submit = () => ctx.client.generate.wallpaper(
        { ...params, ...(clientToken ? { clientToken } : {}) },
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
        `Wallpaper ready. creationId ${state.creationId}.` +
        nsfwProseFragment(creation) +
        ` Share the viewUrl with the user; preview attached inline, download_creation saves the full ` +
        `file locally.`,
        generationSummary(state, creation),
      );
      if (preview) result.content.push(preview);
      return result;
    }),
  );
};
