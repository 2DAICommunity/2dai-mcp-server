import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { guard, ok, fail, generationSummary, pendingResult, previewBlock } from '../result.js';
import { submitAndWait } from '../wait.js';
import { idempotencyToken } from '../idempotency.js';

const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'] as const;
const REF_TOOLS = ['face-ref', 'character-ref', 'style-transfer', 'smart-edit'] as const;

export const registerGenerateWithRefs: RegisterTool = (server, ctx) => {
  server.registerTool(
    'generate_with_refs',
    {
      title: 'Generate an image from references',
      description:
        'Generate an image conditioned on existing creations. This SPENDS the account\'s credit. ' +
        'Four tools: "face-ref" keeps a face identity across new scenes (1-6 refs), "character-ref" ' +
        'keeps a whole character consistent (1-6 refs), "style-transfer" extracts the STYLE of the refs ' +
        '(1-3) and applies it to the prompt, "smart-edit" EDITS refs[0] following the prompt as the ' +
        'edit instruction (up to 3 extra support refs, 4 total). Reference ids come from earlier ' +
        'generations, upload_image or list_creations. Returns the finished creation within the wait ' +
        'budget, else a queueId for check_generation.',
      inputSchema: {
        tool: z.enum(REF_TOOLS).describe('Which reference tool to run.'),
        refCreationIds: z.array(z.string().length(32)).min(1).max(6)
          .describe('Creation ids to condition on. face/character-ref: 1-6 identity shots. style-transfer: 1-3 style sources. smart-edit: refs[0] = the image to EDIT, plus up to 3 support refs.'),
        prompt: z.string().max(500).optional()
          .describe('The scene to generate. Optional for style-transfer (the refs carry the style). For smart-edit this is the edit instruction and is required.'),
        aspectRatio: z.enum(ASPECT_RATIOS).optional().describe('Shape of the output. Defaults to 1:1.'),
        quality: z.string().optional().describe('Quality preset id, or "auto" (default) to pick by tier.'),
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
        if (args.refCreationIds.length > 4) {
          throw new Error('smart-edit takes at most 4 refs: the image to edit first, plus up to 3 support refs.');
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
      const result = ok(
        `Image ready. creationId ${state.creationId}. ` +
        `Share the viewUrl with the user to see it on 2DAI (login); use download_creation to save it ` +
        `locally, or pass the creationId as a reference to another generation.`,
        generationSummary(state),
      );
      const preview = await previewBlock(rc, state.cdnId);
      if (preview) result.content.push(preview);
      return result;
    }),
  );
};
