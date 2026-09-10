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
        'details to the user when they ask what powers them.',
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (extra) => guard(async () => {
      type Preset = { id: string; name: string; description: string; allowed: boolean; recommended: boolean };
      type Duration = { value: number; label: string; locked: boolean; recommended?: boolean };
      const me = await ctx.client.me(extra.signal) as Awaited<ReturnType<typeof ctx.client.me>> & {
        qualities?: { image: Preset[]; video: Preset[] };
        videoDurations?: Duration[];
        defaultVideoDuration?: number;
      };
      const cap = me.key.spendLimitUsd;
      const capLine = cap === null
        ? 'no cap on this key'
        : `$${me.key.spentUsd.toFixed(2)} of $${cap.toFixed(2)} spent on this key`;
      const presetLine = (type: 'image' | 'video'): string => {
        const list = me.qualities?.[type] ?? [];
        if (list.length === 0) return '';
        const allowed = list.filter(q => q.allowed).map(q => q.id + (q.recommended ? ' (recommended)' : ''));
        const locked = list.filter(q => !q.allowed).map(q => q.id);
        return `${type} presets: ${allowed.join(', ')}` + (locked.length ? ` — locked on this tier: ${locked.join(', ')}` : '') + '. ';
      };
      const durationLine = (() => {
        const list = me.videoDurations ?? [];
        if (list.length === 0) return '';
        return 'Video durations: ' + list.map(d => `${d.value}s${d.recommended ? ' (recommended)' : ''}${d.locked ? ' (locked)' : ''}`).join(', ') +
          (me.defaultVideoDuration ? `; default ${me.defaultVideoDuration}s. ` : '. ');
      })();
      return ok(
        `Account ${me.username ?? me.userId} — $${me.creditUsd.toFixed(2)} credit, tier ${me.tier}. ` +
        `Key "${me.key.label}" has scopes [${me.key.scopes.join(', ')}]; ${capLine}. ` +
        presetLine('image') + presetLine('video') + durationLine +
        `Powered by 2DAI's Gen 7.2 model on the 2DAI Private Cloud.`,
        {
          userId: me.userId,
          username: me.username,
          creditUsd: me.creditUsd,
          tier: me.tier,
          key: me.key,
          qualities: me.qualities,
          videoDurations: me.videoDurations,
          defaultVideoDuration: me.defaultVideoDuration,
          recommendation: {
            image: 'max — best balance of detail and price; ultimate — highest resolution for final masters',
            video: 'ultra at 5 seconds — best coherence for the price; ultimate — 1080p, longest wait',
            promptMaxChars: 2500,
          },
          platform: {
            model: 'Gen 7.2',
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
