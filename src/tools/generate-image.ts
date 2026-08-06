import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { guard, ok, fail, generationSummary, hydrateForResponse, nsfwProseFragment, pendingResult } from '../result.js';
import { submitAndWait } from '../wait.js';
import { idempotencyToken } from '../idempotency.js';

const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'] as const;

export const registerGenerateImage: RegisterTool = (server, ctx) => {
  server.registerTool(
    'generate_image',
    {
      title: 'Generate an image',
      description:
        'Generate an image on the 2DAI account from a text prompt. This SPENDS the account\'s credit. ' +
        'Returns the finished creation when it lands within the wait budget, otherwise a queueId to poll ' +
        'with check_generation. Style and quality default to "auto" (the server picks by tier).',
      inputSchema: {
        prompt: z.string().min(1).max(500).describe('What to generate. Be specific; this drives the whole image.'),
        aspectRatio: z.enum(ASPECT_RATIOS).optional().describe('Shape of the output. Defaults to 1:1.'),
        quality: z.string().optional().describe('Quality preset id, or "auto" (default) to pick by tier.'),
        style: z.string().optional().describe('Style id, or "auto" (default) to let the server choose.'),
        negativePrompt: z.string().max(500).optional().describe('What to avoid in the image.'),
        allowNSFW: z.boolean().optional().describe('Permit adult content, if the account allows it.'),
        wait: z.boolean().optional().describe('Block until the image is ready (default true). Set false to get a queueId immediately.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args, extra) => guard(async () => {
      const rc = { ...ctx, signal: extra.signal };
      const params = {
        prompt: args.prompt,
        ...(args.aspectRatio ? { aspectRatio: args.aspectRatio } : {}),
        ...(args.quality ? { quality: args.quality } : {}),
        ...(args.style ? { style: args.style } : {}),
        ...(args.negativePrompt ? { negativePrompt: args.negativePrompt } : {}),
        ...(args.allowNSFW !== undefined ? { allowNSFW: args.allowNSFW } : {}),
      };
      // Stable within the idempotency window so a host retry of the same call
      // is refused by the API instead of charged twice. See idempotency.ts.
      const clientToken = idempotencyToken('generate_image', params, ctx.config.idempotencyWindowMs);

      const submit = () => ctx.client.generate.image(
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
        `Image ready. creationId ${state.creationId}.` +
        nsfwProseFragment(creation) +
        ` Share the viewUrl with the user to see it on 2DAI (login); the inline preview is already ` +
        `attached, use download_creation to save the full-resolution file locally, or pass the creationId ` +
        `as a reference to another generation.`,
        generationSummary(state, creation),
      );
      if (preview) result.content.push(preview);
      return result;
    }),
  );
};
