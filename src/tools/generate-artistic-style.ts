import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { guard, ok, fail, generationSummary, hydrateForResponse, nsfwProseFragment, pendingResult } from '../result.js';
import { submitAndWait } from '../wait.js';
import { idempotencyToken } from '../idempotency.js';

const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'] as const;

export const registerGenerateArtisticStyle: RegisterTool = (server, ctx) => {
  server.registerTool(
    'generate_in_artistic_style',
    {
      title: 'Paint in a curated artistic style',
      description:
        'Artist Painter: render the prompt as a NEW work in a curated artistic style. This SPENDS the ' +
        'account\'s credit (billed like style-transfer). The subject is painted in the chosen style — ' +
        'unsigned unless the prompt asks for a signature. artisticStyleId comes from list_artistic_styles, ' +
        'or "auto" (default) lets the server pick the best-matching style for the prompt. Up to 3 optional ' +
        'subject images can anchor what gets painted. ' +
        'Needs a prompt OR at least one subject ref. Returns the finished creation within the wait budget, ' +
        'else a queueId for check_generation.',
      inputSchema: {
        prompt: z.string().max(500).optional().describe('Your subject. Optional when refCreationIds is given.'),
        artisticStyleId: z.string().optional().describe('An artisticStyleId from list_artistic_styles, or "auto" (default).'),
        refCreationIds: z.array(z.string().length(32)).max(3).optional()
          .describe('Up to 3 subject images (creation ids) to place into the artistic style.'),
        aspectRatio: z.enum(ASPECT_RATIOS).optional().describe('Shape of the output. Defaults to 1:1.'),
        quality: z.string().optional().describe('Quality preset id, or "auto" (default) to pick by tier.'),
        allowNSFW: z.boolean().optional().describe('Permit adult content, if the account allows it.'),
        wait: z.boolean().optional().describe('Block until ready (default true). Set false to get a queueId immediately.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args, extra) => guard(async () => {
      if (!args.prompt && !(args.refCreationIds && args.refCreationIds.length > 0)) {
        throw new Error('generate_in_artistic_style needs a "prompt" or at least one subject in refCreationIds.');
      }
      const rc = { ...ctx, signal: extra.signal };
      const params = {
        artisticStyleId: args.artisticStyleId || 'auto',
        ...(args.prompt ? { prompt: args.prompt } : {}),
        ...(args.refCreationIds && args.refCreationIds.length > 0 ? { refCreationIds: args.refCreationIds } : {}),
        ...(args.aspectRatio ? { aspectRatio: args.aspectRatio } : {}),
        ...(args.quality ? { quality: args.quality } : {}),
        ...(args.allowNSFW !== undefined ? { allowNSFW: args.allowNSFW } : {}),
      };
      const clientToken = idempotencyToken('generate_in_artistic_style', params, ctx.config.idempotencyWindowMs);

      const submit = () => ctx.client.generate.artisticStyle(
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
      const styleName = creation?.artisticStyleName ?? (creation as any)?.raw?.artisticStyleName;
      const result = ok(
        `Painting ready. creationId ${state.creationId}.` +
        (styleName ? ` Painted in the ${styleName} style.` : '') +
        nsfwProseFragment(creation) +
        ` Share the viewUrl with the user; the inline preview is already attached, use ` +
        `download_creation to save the full-resolution file locally, or pass the creationId as a ` +
        `reference to another generation.`,
        generationSummary(state, creation),
      );
      if (preview) result.content.push(preview);
      return result;
    }),
  );
};
