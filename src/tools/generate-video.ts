import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { guard, ok, fail, generationSummary, hydrateForResponse, nsfwProseFragment, pendingResult, previewBlock } from '../result.js';
import { submitAndWait } from '../wait.js';
import { idempotencyToken } from '../idempotency.js';

export const registerGenerateVideo: RegisterTool = (server, ctx) => {
  server.registerTool(
    'generate_video',
    {
      title: 'Generate a video from a still',
      description:
        'Animate an existing still creation into a short clip. This SPENDS the account\'s credit — video ' +
        'costs several times an image. Takes ~1-3 minutes, so it usually returns a queueId to collect ' +
        'with check_generation rather than the finished clip. Durations: 5, 6.5 or 7.5 seconds ' +
        '(7.5 is tier-gated).',
      inputSchema: {
        prompt: z.string().min(1).max(500)
          .describe('How the scene should move (camera, motion, mood).'),
        inputCreationId: z.string().length(32)
          .describe('The still creation to animate — from an earlier generation, upload_image or list_creations.'),
        duration: z.number().optional().describe('Clip length in seconds: 5, 6.5 or 7.5 (tier-gated). Default 6.5.'),
        quality: z.string().optional().describe('Quality preset id, or "auto" (default) to pick by tier.'),
        style: z.string().optional().describe('Motion style id, or "auto" (default).'),
        frameInterpolation: z.boolean().optional().describe('Smoother motion via frame interpolation (costs more).'),
        allowNSFW: z.boolean().optional().describe('Permit adult content, if the account allows it.'),
        wait: z.boolean().optional().describe('Block up to the wait budget (default true). Set false to get the queueId immediately.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args, extra) => guard(async () => {
      const rc = { ...ctx, signal: extra.signal };
      const params = {
        prompt: args.prompt,
        inputCreationId: args.inputCreationId,
        ...(args.duration !== undefined ? { duration: args.duration } : {}),
        ...(args.quality ? { quality: args.quality } : {}),
        ...(args.style ? { style: args.style } : {}),
        ...(args.frameInterpolation !== undefined ? { frameInterpolation: args.frameInterpolation } : {}),
        ...(args.allowNSFW !== undefined ? { allowNSFW: args.allowNSFW } : {}),
      };
      const clientToken = idempotencyToken('generate_video', params, ctx.config.idempotencyWindowMs);

      const submit = () => ctx.client.generate.video(
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
      // Video is a special case: state.cdnId is the mp4 (previewBlock skips it),
      // so we hydrate the creation for BOTH the summary enrichment (NSFW,
      // description) AND to reach the first-frame preview cdnId that IS an image
      // the model can see. Metadata hydration is shared; preview fetch is
      // targeted at the frame, not the mp4.
      const creation = state.creationId
        ? await ctx.client.creations.get(state.creationId, extra.signal).catch(() => undefined)
        : undefined;
      const frame = (creation?.raw as any)?.framePreviewCdnIds?.[0] as string | undefined;
      const result = ok(
        `Video ready. creationId ${state.creationId}.` +
        nsfwProseFragment(creation) +
        ` Share the viewUrl with the user; first-frame preview attached inline, download_creation saves ` +
        `the mp4 locally.`,
        generationSummary(state, creation),
      );
      const preview = await previewBlock(rc, frame);
      if (preview) result.content.push(preview);
      return result;
    }),
  );
};
