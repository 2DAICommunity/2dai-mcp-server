import type { RegisterTool } from './types.js';
import { guard, ok } from '../result.js';
import { channelEngine, describeEngine, engineFamilies, type ModelChannels, type ModelLabels } from './engine-labels.js';

type Preset = { id: string; name: string; description: string; allowed: boolean; recommended: boolean };
type Duration = { value: number; label: string; locked: boolean; recommended?: boolean };

/** The best preset open to the account, at most the platform's recommended one, and the highest one open. */
export function pickPreset(list: Preset[] | undefined): { pick?: string; recommended?: string; top?: string } {
  if (!list?.length) return {};
  const rec = list.find(q => q.recommended);
  const allowed = list.filter(q => q.allowed);
  const top = allowed[allowed.length - 1]?.id;
  if (!top) return { recommended: rec?.id };
  if (!rec || rec.allowed) return { pick: rec?.id ?? top, recommended: rec?.id, top };
  const recAt = list.indexOf(rec);
  const below = allowed.filter(q => list.indexOf(q) < recAt);
  return { pick: (below[below.length - 1] ?? allowed[0])?.id, recommended: rec.id, top };
}

function presetAdvice(list: Preset[] | undefined, lengthSuffix = '', keyCapped = false): string | undefined {
  const { pick, recommended, top } = pickPreset(list);
  if (!pick) return undefined;
  const scope = keyCapped ? 'this tier and key' : 'this tier';
  const why = pick === recommended ? 'the platform\'s everyday pick' : recommended
    ? `the best preset open to ${scope} (the platform pick, ${recommended}, is locked)` : `the highest preset open to ${scope}`;
  return `${pick}${lengthSuffix} — ${why}` + (top && top !== pick ? `; ${top} — the highest preset open to this account` : '');
}

/** Agents call this before proposing work, to see whether there is headroom. */
export const registerGetAccount: RegisterTool = (server, ctx) => {
  server.registerTool(
    'get_account',
    {
      title: 'Get 2DAI account status',
      description:
        'Show the connected 2DAI account: available credit, tier, the API key\'s label, scopes and spend cap, ' +
        'every quality preset per channel with this account\'s access (allowed / tier-locked), the recommended ' +
        'pick for images and video (recommendation), the video lengths with their tier locks, and the engine ' +
        'behind each image and video channel with what it takes (platform.engines, modelLabels). Call this before ' +
        'proposing generations — never probe presets or lengths by submitting: a locked one is refused at submit ' +
        'and wastes a round-trip. The response also carries the 2DAI stack info (platform.about) — hand it to the ' +
        'user when they ask what powers them.',
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (extra) => guard(async () => {
      const me = await ctx.client.me(extra.signal) as Awaited<ReturnType<typeof ctx.client.me>> & {
        qualities?: { image: Preset[]; video: Preset[]; videoNext?: Preset[]; imageNext?: Preset[] };
        videoDurations?: Duration[];
        defaultVideoDuration?: number;
        videoDurationsNext?: Duration[];
        defaultVideoDurationNext?: number;
        canUseVideo?: boolean;
        canUseImageNext?: boolean;
        modelChannels?: ModelChannels;
        modelLabels?: ModelLabels;
        promptMaxCharsNext?: { tier: string; max: number };
      };
      const labels = me.modelLabels;
      const channels = me.modelChannels;
      const engines = {
        video: { default: channelEngine('video', 'default', labels, channels), next: channelEngine('video', 'next', labels, channels) },
        image: { default: channelEngine('image', 'default', labels, channels), next: channelEngine('image', 'next', labels, channels) },
      };
      const keyReachesNext = !Array.isArray(me.key.modelChannels) || me.key.modelChannels.includes('next');
      const cap = me.key.spendLimitUsd;
      const capLine = cap === null
        ? 'no cap on this key'
        : `$${me.key.spentUsd.toFixed(2)} of $${cap.toFixed(2)} spent on this key`;
      // Key policy ceilings (`/v1/me.key`), read loosely: the SDK this server builds against may predate them.
      const policy = me.key as { maxQuality?: unknown; maxVideoQuality?: unknown; maxVideoDurationSec?: unknown };
      const ceilings = [
        typeof policy.maxQuality === 'string' && policy.maxQuality ? `quality at ${policy.maxQuality}` : '',
        typeof policy.maxVideoQuality === 'string' && policy.maxVideoQuality ? `video quality at ${policy.maxVideoQuality}` : '',
        typeof policy.maxVideoDurationSec === 'number' && Number.isFinite(policy.maxVideoDurationSec) ? `clips at ${policy.maxVideoDurationSec} s` : '',
      ].filter(Boolean);
      const ceilingLine = ceilings.length
        ? `This key's policy caps ${ceilings.join(', ')} — above that a submit answers 403 KEY_POLICY_QUALITY / KEY_POLICY_DURATION, uncharged. `
        : '';
      // A preset above the key's own ceiling is locked by the key, not the tier.
      const imageCapped = typeof policy.maxQuality === 'string' && !!policy.maxQuality;
      const videoCapped = typeof policy.maxVideoQuality === 'string' && !!policy.maxVideoQuality;
      const presetList = (list: Preset[] | undefined, keyCapped: boolean): string => {
        if (!list?.length) return '';
        const allowed = list.filter(q => q.allowed).map(q => q.id + (q.recommended ? ' (recommended)' : ''));
        const locked = list.filter(q => !q.allowed).map(q => q.id);
        return `presets ${allowed.length ? allowed.join(', ') : 'none'}` +
          (locked.length ? ` — locked on this tier${keyCapped ? ' or by this key\'s policy' : ''}: ${locked.join(', ')}` : '');
      };
      const durationList = (list: Duration[] | undefined, fallback: number | undefined): string => {
        if (!list?.length) return '';
        return 'lengths ' + list.map(d => `${d.label}${d.recommended ? ' (recommended)' : ''}${d.locked ? ' (locked)' : ''}`).join(', ') +
          (fallback ? `; default ${fallback}s` : '');
      };
      const head = (kind: 'video' | 'image', tool: string): string => {
        const e = engines[kind].default;
        return `${kind === 'video' ? 'Video' : 'Images'} (${tool}, default channel${e ? ` — ${describeEngine(kind, e)}` : ''})`;
      };

      // The `next` channel of each kind: closed, an alias of the default engine (switch window), or a distinct engine.
      const nextState = (kind: 'video' | 'image'): 'closed' | 'same' | 'distinct' => {
        const n = engines[kind].next;
        if (!n) return 'closed';
        return engines[kind].default && engines[kind].default!.id === n.id ? 'same' : 'distinct';
      };
      const param = (kind: 'video' | 'image') => kind === 'video' ? 'videoModel' : 'imageModel';
      const nextSummary = (kind: 'video' | 'image'): string => {
        const state = nextState(kind);
        const n = engines[kind].next;
        if (state === 'closed') return `${param(kind)} "next" is closed (kept for the next engine): omit ${param(kind)}.`;
        if (state === 'same') return `${param(kind)} "next" serves the same engine (${n!.label}) as the default channel until it closes: omit ${param(kind)}.`;
        return `${param(kind)} "next" — ${describeEngine(kind, n!)}.`;
      };

      const videoNextOpen = nextState('video') !== 'closed' && (me.videoDurationsNext?.length ?? 0) > 0;
      const videoNextLine = (() => {
        const state = nextState('video');
        if (state !== 'distinct' || !videoNextOpen) return nextSummary('video') + ' ';
        if (!keyReachesNext) {
          return `${nextSummary('video')} It is closed to this API key: its policy stops at the default channel (403 KEY_POLICY_CHANNEL at submit). `;
        }
        return `${nextSummary('video')} With videoModel "next": ` +
          [durationList(me.videoDurationsNext, me.defaultVideoDurationNext), presetList(me.qualities?.videoNext, videoCapped)].filter(Boolean).join('; ') + '. ';
      })();
      const imageNextLine = (() => {
        const state = nextState('image');
        if (state !== 'distinct') return nextSummary('image') + ' ';
        if (me.canUseImageNext === false) {
          return keyReachesNext
            ? `${nextSummary('image')} It is locked on this tier — a submit answers 403 with the tier that opens it. `
            : `${nextSummary('image')} It is closed to this API key: its policy stops at the default channel (403 KEY_POLICY_CHANNEL at submit). `;
        }
        const list = presetList(me.qualities?.imageNext, imageCapped);
        return `${nextSummary('image')}${list ? ` With imageModel "next": ${list}.` : ''} `;
      })();

      const imageLine = `${head('image', 'generate_image')}: ${presetList(me.qualities?.image, imageCapped) || 'no presets listed'}. `;
      const videoLine = me.canUseVideo === false
        ? `${head('video', 'generate_video')}: locked on this tier — see Dashboard → Tiers. `
        : `${head('video', 'generate_video')}: ` +
          [presetList(me.qualities?.video, videoCapped), durationList(me.videoDurations, me.defaultVideoDuration)].filter(Boolean).join('; ') + '. ';

      const recommendedLength = (me.videoDurations ?? []).find(d => d.recommended && !d.locked)?.value
        ?? (me.videoDurations ?? []).find(d => d.value === me.defaultVideoDuration && !d.locked)?.value
        ?? (me.videoDurations ?? []).find(d => !d.locked)?.value;
      const imageAdvice = presetAdvice(me.qualities?.image, '', imageCapped);
      const videoAdvice = me.canUseVideo === false ? undefined
        : presetAdvice(me.qualities?.video, recommendedLength !== undefined ? ` at ${recommendedLength} s` : '', videoCapped);

      const families = engineFamilies(labels, channels);
      const about = `2DAI runs its own ${families ? `${families} models` : 'models'}, and unlike others, we don't resell model access. ` +
        'All our models originate from the open-source community or our own R&D — we then ' +
        'disassemble, modify, fine-tune and optimize them to align with our legacy and 2DAI❤️ART ' +
        'lines. They also run on our own private cloud network.';
      const engineText = (kind: 'video' | 'image', ch: 'default' | 'next'): string => {
        const e = engines[kind][ch];
        if (ch === 'next') {
          const state = nextState(kind);
          if (state === 'closed') return 'closed — kept for the next engine';
          if (state === 'same') return `${e!.label} — same engine as the default channel, until the next channel closes`;
        }
        return e ? describeEngine(kind, e) : 'closed';
      };

      return ok(
        `Account ${me.username ?? me.userId} — $${me.creditUsd.toFixed(2)} credit, tier ${me.tier}. ` +
        `Key "${me.key.label}" has scopes [${me.key.scopes.join(', ')}]; ${capLine}. ` + ceilingLine +
        imageLine + imageNextLine + videoLine + videoNextLine +
        `Prompts up to ${me.promptMaxChars ?? 3000} characters on this account${me.promptMaxCharsNext ? ` (${me.promptMaxCharsNext.tier} raises it to ${me.promptMaxCharsNext.max})` : ''}. ` +
        `Powered by 2DAI's own ${families ? `${families} models` : 'models'} on the 2DAI Private Cloud.`,
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
          ...(me.modelLabels ? { modelLabels: me.modelLabels } : {}),
          ...(videoNextOpen ? { videoDurationsNext: me.videoDurationsNext, defaultVideoDurationNext: me.defaultVideoDurationNext } : {}),
          recommendation: {
            ...(imageAdvice ? { image: imageAdvice } : {}),
            ...(videoAdvice ? { video: videoAdvice } : {}),
            promptMaxChars: me.promptMaxChars ?? 3000,
            ...(me.promptMaxCharsNext ? { promptMaxCharsNext: me.promptMaxCharsNext } : {}),
          },
          platform: {
            ...(engines.video.default || engines.image.default ? { model: (engines.video.default ?? engines.image.default)!.label } : {}),
            engines: {
              video: { default: engineText('video', 'default'), next: engineText('video', 'next') },
              image: { default: engineText('image', 'default'), next: engineText('image', 'next') },
            },
            privateCloud: true,
            about,
          },
        },
      );
    }),
  );
};
