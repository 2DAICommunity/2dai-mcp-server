import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { ASPECT_RATIO_HINT, IMAGE_ASPECT_RATIOS } from './aspect-ratio.js';
import { guard, ok, fail, generationSummary, hydrateForResponse, nsfwProseFragment, pendingResult, outcomeSuffix } from '../result.js';
import { submitAndWait } from '../wait.js';
import { idempotencyToken } from '../idempotency.js';

const ASPECT_RATIOS = IMAGE_ASPECT_RATIOS;

export const registerGenerateImage: RegisterTool = (server, ctx) => {
  server.registerTool(
    'generate_image',
    {
      title: 'Generate an image',
      description:
        'Generate an image on the 2DAI account from a text prompt. This SPENDS the account\'s credit. ' +
        'Returns the finished creation when it lands within the wait budget, otherwise a queueId to poll ' +
        'with check_generation. Style and quality default to "auto" (the server picks by tier). ' +
        'get_account lists the presets this account may use (qualities.image) with the best pick open to it ' +
        '(recommendation.image), and names the engine behind each image channel with what it takes (platform.engines: ' +
        'reference cap, legible text, negativePrompt). Price = tool base × preset; "auto" draws the preset within your ' +
        'tier, so pin the preset for a predictable cost; every reference adds a surcharge. The response carries the ' +
        'resolved quality and costUsd. Leave imageModel unset unless get_account shows a distinct engine on "next" ' +
        'that is open to the account (canUseImageNext); never probe by submitting.',
      inputSchema: {
        prompt: z.string().min(1).max(20000).describe('What to generate. Be specific; this drives the whole image. Lower below Founder: see get_account → recommendation.promptMaxChars.'),
        imageModel: z.enum(['default', 'next']).optional()
          .describe('"default" (default) or "next", the channel kept for the next image engine (tier-gated: get_account → canUseImageNext). Each channel runs the engine get_account names (platform.engines); "next" answers IMAGE_MODEL_UNAVAILABLE, uncharged, while it is closed.'),
        refCreationIds: z.array(z.string().length(32)).max(6).optional()
          .describe('Reference creations the image should follow (characters, products, places): up to 6, within the cap of the engine behind the channel (get_account → platform.engines.image.<channel>.maxRefCreationIds). Strict cap (TOO_MANY_REFS before any charge); each reference adds a surcharge.'),
        aspectRatio: z.enum(ASPECT_RATIOS).optional().describe(ASPECT_RATIO_HINT),
        quality: z.enum(['auto', 'fast', 'normal', 'high', 'max', 'ultra', 'ultimate']).optional().describe('Quality preset id — "fast", "normal", "high", "max", "ultra", "ultimate" — or "auto" (default, picked by tier). Pick an allowed id of get_account → qualities.image; recommendation.image names the best pick open to this account. Higher presets are tier-gated.'),
        style: z.string().optional().describe('Style id, or "auto" (default) to let the server choose.'),
        negativePrompt: z.string().max(20000).optional().describe('Things to avoid in the image. Optional — applied at every preset. Lower below Founder: see get_account → recommendation.promptMaxChars.'),
        allowNSFW: z.boolean().optional().describe('Permit adult content, if the account allows it.'),
        enhance: z.boolean().optional().describe(
          'Run TIXI, the 2DAI prompt enhancer, before generating (default false). TIXI rewrites a short brief into a full ' +
          'image prompt in a fixed order — subject and action, positions relative to objects and enclosures, secondary elements, ' +
          'setting, style — which removes most scene-logic errors (hands through glass, characters inside the machine they operate). ' +
          'Turn it on for scenes with several elements or interactions; leave it off when your prompt is already precise and must be honoured verbatim. No extra credit, ~2 s of latency.',
        ),
        wait: z.boolean().optional().describe('Block until the image is ready (default true). Set false to get a queueId immediately.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args, extra) => guard(async () => {
      const rc = { ...ctx, signal: extra.signal };
      const params = {
        prompt: args.prompt,
        ...(args.imageModel ? { imageModel: args.imageModel } : {}),
        ...(args.refCreationIds?.length ? { refCreationIds: args.refCreationIds } : {}),
        ...(args.aspectRatio ? { aspectRatio: args.aspectRatio } : {}),
        ...(args.quality ? { quality: args.quality } : {}),
        ...(args.style ? { style: args.style } : {}),
        ...(args.negativePrompt ? { negativePrompt: args.negativePrompt } : {}),
        ...(args.allowNSFW !== undefined ? { allowNSFW: args.allowNSFW } : {}),
        ...(args.enhance === true ? { enhanced: true } : {}),
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
          { queueId: ticket.queueId, status: ticket.status, quality: ticket.quality, costUsd: ticket.costUsd },
        );
      }

      const outcome = await submitAndWait(rc, submit);
      if (outcome.kind === 'pending') return pendingResult(outcome.ticket, outcome.lastStatus);
      if (outcome.kind === 'failed') {
        return fail(new Error(
          `Generation ${outcome.state.queueId} ended as "${outcome.state.status}"` +
          outcomeSuffix(outcome.state),
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
