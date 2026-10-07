import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { guard, ok, fail, generationSummary, hydrateForResponse, nsfwProseFragment, pendingResult, previewBlock, outcomeSuffix } from '../result.js';
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
        'with check_generation rather than the finished clip. Durations: 5, 6 or 7 seconds ' +
        '(7 is tier-gated), at 18 fps native (the model\'s cadence); frameInterpolation doubles the frame rate to 36 fps for twice the price. ' +
        'Recommended: quality "ultra" at 5 seconds — the best coherence for the price; "ultimate" is 1080p with the longest wait. ' +
        'Subject identity holds for roughly the first 2.5–3.5 s of a clip, so write the cut at ~3 s, keep one action per shot, ' +
        'and name the light colour in the motion prompt when the scene is lit in colour (limits colour drift). ' +
        'Price = tool base × preset × duration multiplier (1 / 1.3 / 1.5) × 2 with frameInterpolation; "auto" draws the preset, ' +
        'so pin the preset for a predictable cost. The response carries the resolved quality and costUsd. ' +
        'videoModel "next" = Gen8 Flash, the new video engine: clips WITH sound, from the first frame plus up to 6 refCreationIds ' +
        '(characters, props, places — each adds a surcharge), optional aspectRatio, and an optional AUDIO REFERENCE: an MP3 uploaded with ' +
        'upload_audio as audioCreationId, used as music (soundtrack / sound design) or as a voice sample (audioUse) — it counts as one more reference. ' +
        'No frameInterpolation. Lengths and quality presets ' +
        'depend on the account: at launch Fast quality and 1, 5, 8 or 10 seconds, more with later releases and higher tiers — ' +
        'get_account lists what this account may submit, never guess. Long clips render for several minutes: expect a queueId to collect with check_generation.',
      inputSchema: {
        prompt: z.string().min(1).max(20000)
          .describe('How the scene should move (camera, motion, mood). Lower below Founder: see get_account → recommendation.promptMaxChars.'),
        inputCreationId: z.string().length(32)
          .describe('The still creation to animate (the first frame) — from an earlier generation, upload_image or list_creations.'),
        videoModel: z.enum(['default', 'next']).optional()
          .describe('"default" (Video: silent, 5, 6 or 7 s) or "next" (Gen8 Flash: with sound, up to 6 references; lengths per get_account). Default "default".'),
        refCreationIds: z.array(z.string().length(32)).max(6).optional()
          .describe('Gen8 Flash only: up to 6 more reference creations after the first frame (characters, props, places). Each adds a surcharge.'),
        aspectRatio: z.enum(['auto', '1:1', '3:2', '4:3', '16:9', '21:9', '2:3', '3:4', '9:16']).optional()
          .describe('Gen8 Flash only: output shape. "auto" (default) keeps the first frame\'s ratio.'),
        audioCreationId: z.string().length(32).optional()
          .describe('Gen8 Flash only: an audio creation from upload_audio (an MP3 of the account) used as the clip\'s audio reference; counts as one more reference for the price. Rejected on the default model (AUDIO_REF_NEXT_ONLY) and when the creation is not an audio file (INVALID_AUDIO_REF).'),
        audioUse: z.enum(['music', 'voice']).optional()
          .describe('How the audio reference is used: "music" = soundtrack / sound design (default), "voice" = a voice sample the speaking character follows.'),
        duration: z.number().optional().describe('Clip length in seconds. Video: 5 (recommended), 6 or 7 (7 is tier-gated). Gen8 Flash (videoModel next): the lengths get_account lists for this account (1, 5, 8 or 10 at launch). Default 5. On Video, subjects stay coherent best on short clips: prefer several 5-second shots over one long one.'),
        quality: z.enum(['auto', 'fast', 'normal', 'high', 'max', 'ultra', 'ultimate']).optional().describe('Quality preset id — "fast", "normal", "high", "max", "ultra", "ultimate" — or "auto" (default, picked by tier). Recommended: "ultra" (800p) at 5 seconds for the best coherence for the price; "ultimate" is 1080p with the longest wait. Ultra and ultimate are tier-gated.'),
        style: z.string().optional().describe('Motion style id, or "auto" (default). Every style except "raw" runs TIXI on the prompt (the style guidance only exists through that rewrite); "raw" sends the prompt verbatim unless enhance is true.'),
        enhance: z.boolean().optional().describe('Run TIXI on the prompt with style "raw": TIXI writes the motion scenario (Video) or the full Gen8 Flash brief (shots, pictures, sound) from your idea; a prompt starting with "tixi " adds a thinking pass. Every other style already runs TIXI and cannot switch it off. No extra credit.'),
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
        ...(args.videoModel ? { videoModel: args.videoModel } : {}),
        ...(args.videoModel === 'next' && args.refCreationIds?.length ? { refCreationIds: args.refCreationIds } : {}),
        ...(args.videoModel === 'next' && args.aspectRatio ? { aspectRatio: args.aspectRatio } : {}),
        ...(args.videoModel === 'next' && args.audioCreationId ? { audioCreationId: args.audioCreationId, audioUse: args.audioUse ?? 'music' } : {}),
        ...(args.duration !== undefined ? { duration: args.duration } : {}),
        ...(args.quality ? { quality: args.quality } : {}),
        ...(args.style ? { style: args.style } : {}),
        ...(args.enhance === true ? { enhanced: true } : {}),
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
