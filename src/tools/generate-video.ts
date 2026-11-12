import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { guard, ok, fail, generationSummary, hydrateForResponse, nsfwProseFragment, pendingResult, previewBlock, outcomeSuffix, acceptedDuration, lengthNote } from '../result.js';
import { submitAndWait } from '../wait.js';
import { idempotencyToken } from '../idempotency.js';

export const registerGenerateVideo: RegisterTool = (server, ctx) => {
  server.registerTool(
    'generate_video',
    {
      title: 'Generate a video from a still',
      description:
        'Animate an existing still creation into a short clip. This SPENDS the account\'s credit — video ' +
        'costs several times an image. A clip renders for minutes, so this usually returns a queueId to collect ' +
        'with check_generation rather than the finished clip; never submit again to retry, it would be charged twice. ' +
        'Call get_account first: it names the engine behind each video channel and what it takes (platform.engines), ' +
        'the lengths this account may submit (videoDurations, exact seconds), the quality presets (qualities.video) and ' +
        'the best pick open to the account (recommendation.video) — never guess them; a locked preset or length is refused ' +
        'before any charge. On an engine with sound the clip comes with sound, and the call can add up to 6 refCreationIds ' +
        'after the first frame (characters, props, places), an aspectRatio and an AUDIO REFERENCE (an MP3 from upload_audio ' +
        'as audioCreationId, used as music or as a voice sample); each reference adds a surcharge. The price follows the ' +
        'engine and grows faster than the length; "auto" draws the preset, so pin it for a predictable cost. The response ' +
        'carries the resolved quality and costUsd. Leave videoModel unset unless get_account shows a distinct engine on "next".',
      inputSchema: {
        prompt: z.string().min(1).max(20000)
          .describe('How the scene should move (camera, motion, mood). Lower below Founder: see get_account → recommendation.promptMaxChars.'),
        inputCreationId: z.string().length(32)
          .describe('The still creation to animate (the first frame) — from an earlier generation, upload_image or list_creations.'),
        videoModel: z.enum(['default', 'next']).optional()
          .describe('"default" (default) or "next", the channel kept for the next video engine. Each channel runs the engine get_account names (platform.engines); "next" answers VIDEO_MODEL_UNAVAILABLE, uncharged, while it is closed. Omit it unless get_account shows a distinct engine on "next".'),
        refCreationIds: z.array(z.string().length(32)).max(6).optional()
          .describe('Up to 6 more reference creations after the first frame (characters, props, places), within the cap of the engine behind the channel (get_account → platform.engines.video.<channel>.maxRefCreationIds); each adds a surcharge.'),
        aspectRatio: z.enum(['auto', '1:1', '3:2', '4:3', '16:9', '21:9', '2:3', '3:4', '9:16', '9:19.5']).optional()
          .describe('Output shape. "auto" (default) keeps the first frame\'s ratio. Vertical phone video (stories, Reels, TikTok) = "9:16"; a clip that fills a phone screen edge to edge (live wallpaper) = "9:19.5"; landscape / widescreen = "16:9"; "4:3" and "3:2" are landscape, "3:4" and "2:3" portrait.'),
        audioCreationId: z.string().length(32).optional()
          .describe('An audio creation from upload_audio (an MP3 of the account) used as the clip\'s audio reference, on an engine with sound; counts as one more reference for the price. Rejected when the creation is not an audio file (INVALID_AUDIO_REF).'),
        audioUse: z.enum(['music', 'voice']).optional()
          .describe('How the audio reference is used: "music" = soundtrack / sound design (default), "voice" = a voice sample the speaking character follows.'),
        duration: z.number().optional().describe('Clip length in exact seconds: a value of get_account → videoDurations that is not locked. Omit it for the account default (defaultVideoDuration). Any other length is refused with INVALID_DURATION, uncharged.'),
        quality: z.enum(['auto', 'fast', 'normal', 'high', 'max', 'ultra', 'ultimate']).optional().describe('Quality preset id — "fast", "normal", "high", "max", "ultra", "ultimate" — or "auto" (default, picked by tier). Pick an allowed id of get_account → qualities.video; recommendation.video names the best pick open to this account. Higher presets are tier-gated.'),
        style: z.string().optional().describe('Motion style id, or "auto" (default). Every style except "raw" runs TIXI on the prompt (the style guidance only exists through that rewrite); "raw" sends the prompt verbatim unless enhance is true.'),
        enhance: z.boolean().optional().describe('Run TIXI on the prompt with style "raw": TIXI writes the clip\'s brief (shots, pictures and, on an engine with sound, the sound) from your idea; a prompt starting with "tixi " adds a thinking pass. Every other style already runs TIXI and cannot switch it off. No extra credit.'),
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
        ...(args.refCreationIds?.length ? { refCreationIds: args.refCreationIds } : {}),
        ...(args.aspectRatio ? { aspectRatio: args.aspectRatio } : {}),
        ...(args.audioCreationId ? { audioCreationId: args.audioCreationId, audioUse: args.audioUse ?? 'music' } : {}),
        ...(args.duration !== undefined ? { duration: args.duration } : {}),
        ...(args.quality ? { quality: args.quality } : {}),
        ...(args.style ? { style: args.style } : {}),
        ...(args.enhance === true ? { enhanced: true } : {}),
        ...(args.allowNSFW !== undefined ? { allowNSFW: args.allowNSFW } : {}),
      };
      const clientToken = idempotencyToken('generate_video', params, ctx.config.idempotencyWindowMs);

      const submit = () => ctx.client.generate.video(
        { ...params, ...(clientToken ? { clientToken } : {}) },
        { wait: false, signal: extra.signal },
      );

      const asked = args.duration !== undefined ? { seconds: args.duration, of: 'asked' as const } : undefined;
      if (args.wait === false) {
        const ticket = await submit();
        const duration = acceptedDuration(ticket);
        return ok(
          `Queued.${lengthNote(duration, asked)} Call check_generation with queueId "${ticket.queueId}" to collect it.`,
          { queueId: ticket.queueId, status: ticket.status, quality: ticket.quality, costUsd: ticket.costUsd, ...(duration !== undefined ? { duration } : {}) },
        );
      }

      const outcome = await submitAndWait(rc, submit);
      const duration = acceptedDuration(outcome.ticket);
      if (outcome.kind === 'pending') return pendingResult(outcome.ticket, outcome.lastStatus, lengthNote(duration, asked));
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
        `Video ready. creationId ${state.creationId}.` + lengthNote(duration, asked) +
        nsfwProseFragment(creation) +
        ` Share the viewUrl with the user; first-frame preview attached inline, download_creation saves ` +
        `the mp4 locally.`,
        { ...generationSummary(state, creation), ...(duration !== undefined ? { duration } : {}) },
      );
      const preview = await previewBlock(rc, frame);
      if (preview) result.content.push(preview);
      return result;
    }),
  );
};
