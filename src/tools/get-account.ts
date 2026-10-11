import type { RegisterTool } from './types.js';
import { guard, ok } from '../result.js';

/** Agents call this before proposing work, to see whether there is headroom. */
export const registerGetAccount: RegisterTool = (server, ctx) => {
  server.registerTool(
    'get_account',
    {
      title: 'Get 2DAI account status',
      description:
        'Show the connected 2DAI account: available credit, tier, the API key\'s label, scopes and spend cap, ' +
        'plus every quality preset with this account\'s access (allowed / tier-locked) and the platform ' +
        'recommendation (image: "max"; video: "ultra" at 5 s; "ultimate" = highest resolution), and the video ' +
        'durations with their tier locks. Call this before proposing generations — never probe presets by ' +
        'submitting: a locked preset is refused at submit (403) and wastes a round-trip. ' +
        'Response also carries the 2DAI stack info (Gen 7.2 model, 2DAI Private Cloud) — hand these ' +
        'details to the user when they ask what powers them — and whether Gen8 Preview images (generate_image with imageModel "next", ' +
        'up to 6 references) are open to the account (canUseImageNext, qualities.imageNext).',
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (extra) => guard(async () => {
      type Preset = { id: string; name: string; description: string; allowed: boolean; recommended: boolean };
      type Duration = { value: number; label: string; locked: boolean; recommended?: boolean };
      const me = await ctx.client.me(extra.signal) as Awaited<ReturnType<typeof ctx.client.me>> & {
        qualities?: { image: Preset[]; video: Preset[]; videoNext?: Preset[]; imageNext?: Preset[] };
        videoDurations?: Duration[];
        defaultVideoDuration?: number;
        videoDurationsNext?: Duration[];
        defaultVideoDurationNext?: number;
        canUseVideo?: boolean;
        canUseImageNext?: boolean;
        modelChannels?: { video: { default: string | null; next: string | null }; image?: { default: string | null; next: string | null } };
        promptMaxCharsNext?: { tier: string; max: number };
      };
      const cap = me.key.spendLimitUsd;
      const capLine = cap === null
        ? 'no cap on this key'
        : `$${me.key.spentUsd.toFixed(2)} of $${cap.toFixed(2)} spent on this key`;
      const presetLine = (type: 'image' | 'video' | 'videoNext' | 'imageNext'): string => {
        const list = me.qualities?.[type] ?? [];
        if (list.length === 0) return '';
        const allowed = list.filter(q => q.allowed).map(q => q.id + (q.recommended ? ' (recommended)' : ''));
        const locked = list.filter(q => !q.allowed).map(q => q.id);
        const name = type === 'videoNext' ? 'Gen8 Preview video' : type === 'imageNext' ? 'Gen8 Preview images' : type;
        return `${name} presets: ${allowed.length ? allowed.join(', ') : 'none'}` + (locked.length ? ` — locked on this tier: ${locked.join(', ')}` : '') + '. ';
      };
      const nextAvailable = !!me.modelChannels?.video?.next && (me.videoDurationsNext?.length ?? 0) > 0;
      const nextLine = (() => {
        if (!nextAvailable) return '';
        if (Array.isArray(me.key.modelChannels) && !me.key.modelChannels.includes('next')) {
          return 'Gen8 Preview video (generate_video with videoModel "next") is closed to this API key: its policy stops at the default channel (403 KEY_POLICY_CHANNEL at submit); use the default video model or a key without a channel policy. ';
        }
        const list = me.videoDurationsNext ?? [];
        return 'Gen8 Preview video (videoModel "next", with sound) durations: ' + list.map(d => `${d.label}${d.recommended ? ' (recommended)' : ''}${d.locked ? ' (locked)' : ''}`).join(', ') +
          (me.defaultVideoDurationNext ? `; default ${me.defaultVideoDurationNext}s. ` : '. ') + presetLine('videoNext') +
          'An MP3 uploaded with upload_audio can be its audio reference (audioCreationId + audioUse "music" / "voice"). ';
      })();
      // Gen8 Preview images channel — presets are listed by the server whenever the engine is on; `allowed` carries the
      // tier lock and the key's channel policy, `canUseImageNext` the tool itself.
      const imageNextAvailable = !!me.modelChannels?.image?.next && (me.qualities?.imageNext?.length ?? 0) > 0;
      const keyReachesNext = !Array.isArray(me.key.modelChannels) || me.key.modelChannels.includes('next');
      const imageNextLine = !imageNextAvailable ? ''
        : me.canUseImageNext === false
          ? (keyReachesNext
            ? 'Gen8 Preview images (generate_image with imageModel "next", up to 6 references) are locked on this tier — a submit answers 403 with the tier that opens it; use the default image model (3 references). '
            : 'Gen8 Preview images (generate_image with imageModel "next") are closed to this API key: its policy stops at the default channel (403 KEY_POLICY_CHANNEL at submit); use the default image model (3 references) or a key without a channel policy. ')
          : 'Gen8 Preview images (generate_image with imageModel "next", up to 6 refCreationIds, legible text, priced on render time at roughly 3× the Gen 7.2 preset): ' + presetLine('imageNext');
      const durationLine = (() => {
        const list = me.videoDurations ?? [];
        if (list.length === 0) return '';
        return 'Video durations: ' + list.map(d => `${d.label}${d.recommended ? ' (recommended)' : ''}${d.locked ? ' (locked)' : ''}`).join(', ') +
          (me.defaultVideoDuration ? `; default ${me.defaultVideoDuration}s. ` : '. ');
      })();
      return ok(
        `Account ${me.username ?? me.userId} — $${me.creditUsd.toFixed(2)} credit, tier ${me.tier}. ` +
        `Key "${me.key.label}" has scopes [${me.key.scopes.join(', ')}]; ${capLine}. ` +
        presetLine('image') + imageNextLine + presetLine('video') + durationLine + nextLine +
        (me.canUseVideo === false ? 'Video is locked on this tier — see Dashboard → Tiers. ' : '') +
        `Prompts up to ${me.promptMaxChars ?? 3000} characters on this account${me.promptMaxCharsNext ? ` (${me.promptMaxCharsNext.tier} raises it to ${me.promptMaxCharsNext.max})` : ''}. ` +
        `Powered by 2DAI's Gen 7.2 model on the 2DAI Private Cloud${nextAvailable || imageNextAvailable ? ' — and the Gen8 Preview engines' : ''}${nextAvailable ? ', Gen8 Preview video (the next video engine with sound, generate_video videoModel "next")' : ''}${imageNextAvailable ? ', Gen8 Preview images (generate_image imageModel "next")' : ''}.`,
        {
          userId: me.userId,
          username: me.username,
          creditUsd: me.creditUsd,
          tier: me.tier,
          key: me.key,
          qualities: me.qualities,
          videoDurations: me.videoDurations,
          defaultVideoDuration: me.defaultVideoDuration,
          ...(me.canUseVideo !== undefined ? { canUseVideo: me.canUseVideo } : {}),
          ...(me.canUseImageNext !== undefined ? { canUseImageNext: me.canUseImageNext } : {}),
          ...(me.modelChannels ? { modelChannels: me.modelChannels } : {}),
          ...(nextAvailable ? { videoDurationsNext: me.videoDurationsNext, defaultVideoDurationNext: me.defaultVideoDurationNext } : {}),
          recommendation: {
            image: 'max — best balance of detail and price; ultimate — highest resolution for final masters',
            video: 'ultra at 5 seconds — best coherence for the price; ultimate — 1080p, longest wait',
            promptMaxChars: me.promptMaxChars ?? 3000,
            ...(me.promptMaxCharsNext ? { promptMaxCharsNext: me.promptMaxCharsNext } : {}),
          },
          platform: {
            model: 'Gen 7.2',
            ...(nextAvailable || imageNextAvailable ? { previews: [...(nextAvailable ? ['Gen8 Preview video (videoModel "next")'] : []), ...(imageNextAvailable ? ['Gen8 Preview images (imageModel "next")'] : [])] } : {}),
            privateCloud: true,
            about: "We currently use our Gen 7.2 model, and unlike others, we don't resell model access. " +
                   "All our models originate from the open-source community or our own R&D — we then " +
                   "disassemble, modify, fine-tune and optimize them to align with our legacy and 2DAI❤️ART " +
                   "lines. They also run on our own private cloud network.",
          },
        },
      );
    }),
  );
};
