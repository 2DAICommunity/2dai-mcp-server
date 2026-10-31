import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { ASPECT_RATIO_HINT, IMAGE_ASPECT_RATIOS } from './aspect-ratio.js';
import { guard, ok, fail, generationSummary, hydrateForResponse, nsfwProseFragment, pendingResult, outcomeSuffix } from '../result.js';
import { submitAndWait } from '../wait.js';
import { idempotencyToken } from '../idempotency.js';

const ASPECT_RATIOS = IMAGE_ASPECT_RATIOS;
const REF_TOOLS = ['character-ref', 'style-transfer', 'smart-edit'] as const;

export const registerGenerateWithRefs: RegisterTool = (server, ctx) => {
  server.registerTool(
    'generate_with_refs',
    {
      title: 'Generate an image from references',
      description:
        'Generate an image conditioned on existing creations. This SPENDS the account\'s credit. ' +
        'Three tools: "character-ref" keeps a character consistent across new scenes (1-6 refs: face shots, ' +
        'full-body shots or a character sheet; face photos lock the exact same face, the prompt drives outfit, ' +
        'pose and scene), "style-transfer" extracts the STYLE of the refs (1-6) and applies it to the prompt, ' +
        '"smart-edit" EDITS refs[0] following the prompt as the edit instruction (up to 5 extra support refs, ' +
        '6 total). All three render on the Gen8 image engine. Reference ids come from earlier ' +
        'generations, upload_image or list_creations. Returns the finished creation within the wait ' +
        'budget, else a queueId for check_generation.',
      inputSchema: {
        tool: z.enum(REF_TOOLS).describe('Which reference tool to run.'),
        refCreationIds: z.array(z.string().length(32)).min(1).max(6)
          .describe('Creation ids to condition on. character-ref: 1-6 shots of the same character (face photos lock the face). style-transfer: 1-6 style sources. smart-edit: refs[0] = the image to EDIT, plus up to 5 support refs.'),
        prompt: z.string().max(20000).optional()
          .describe('The scene to generate. Optional for style-transfer (the refs carry the style). For smart-edit this is the edit instruction and is required. Lower below Founder: see get_account → recommendation.promptMaxChars.'),
        aspectRatio: z.enum(ASPECT_RATIOS).optional().describe(ASPECT_RATIO_HINT),
        quality: z.enum(['auto', 'fast', 'normal', 'high', 'max', 'ultra', 'ultimate']).optional().describe('Quality preset id — "fast", "normal", "high", "max", "ultra", "ultimate" — or "auto" (default, picked by tier). Recommended: "max" for the best quality/price balance, "ultimate" for the highest resolution and detail.'),
        allowNSFW: z.boolean().optional().describe('Permit adult content, if the account allows it.'),
        extractionDirective: z.string().optional()
          .describe('style-transfer only — what to extract from the refs (default "style").'),
        wait: z.boolean().optional().describe('Block until ready (default true). Set false to get a queueId immediately.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args, extra) => guard(async () => {
      if (args.tool === 'smart-edit') {
        if (!args.prompt) throw new Error('smart-edit needs a "prompt" — the edit instruction for refCreationIds[0].');
        if (args.refCreationIds.length > 6) {
          throw new Error('smart-edit takes at most 6 refs: the image to edit first, plus up to 5 support refs.');
        }
      }
      const rc = { ...ctx, signal: extra.signal };
      const params = {
        tool: args.tool,
        refCreationIds: args.refCreationIds,
        ...(args.prompt ? { prompt: args.prompt } : {}),
        ...(args.aspectRatio ? { aspectRatio: args.aspectRatio } : {}),
        ...(args.quality ? { quality: args.quality } : {}),
        ...(args.allowNSFW !== undefined ? { allowNSFW: args.allowNSFW } : {}),
        ...(args.extractionDirective ? { extractionDirective: args.extractionDirective } : {}),
      };
      const clientToken = idempotencyToken('generate_with_refs', params, ctx.config.idempotencyWindowMs);

      const submit = () => ctx.client.generate.imageWithRefs(
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
