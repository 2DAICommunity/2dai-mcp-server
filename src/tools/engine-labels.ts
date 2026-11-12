/** Engine names are never written in static text: get_account reads them from `/v1/me` (`channels`, `modelLabels`,
 *  `modelChannels`) at call time, so a server switch renames every channel without a release. Typed here because the
 *  SDK this server builds against may predate `modelLabels` / `channels`. */
export type ChannelLabel = { engine: string; family: string; label: string };
export type Channel = 'default' | 'next';
export type ModelLabels = { video?: Partial<Record<Channel, ChannelLabel | null>>; image?: Partial<Record<Channel, ChannelLabel | null>> };
export type ModelChannels = { video?: Partial<Record<Channel, string | null>>; image?: Partial<Record<Channel, string | null>> };

type Preset = { id: string; name: string; description: string; allowed: boolean; recommended: boolean };
type Duration = { value: number; label: string; locked: boolean; recommended?: boolean };

/** One channel of `/v1/me.channels` (server ≥ 2.9.0): what the engine behind it takes, access resolved. */
export type ChannelFacts = {
  engine: string;
  family?: string;
  label?: string;
  displayName?: string;
  allowed?: boolean;
  qualities?: Preset[];
  refs?: { max: number; firstFrame?: boolean };
  negativePrompt?: boolean;
  traits?: string;
  durations?: Duration[];
  defaultDuration?: number;
  audio?: { output?: boolean; reference?: boolean; uses?: string[] };
  aspectRatios?: boolean;
  outputFps?: number;
};
export type MeChannels = { video?: Partial<Record<Channel, ChannelFacts | null>>; image?: Partial<Record<Channel, ChannelFacts | null>> };

/** Fallback for servers before 2.9.0, which send no `channels`: what each engine takes, keyed on the engine id. */
const ENGINE_FACTS: Record<'video' | 'image', Record<string, string>> = {
  video: {
    gen8: 'clips with sound at 24 fps, the first frame plus up to 6 refCreationIds, aspectRatio and an optional audio reference',
  },
  image: {
    gen8: 'up to 6 refCreationIds read natively, legible text in the picture, long literal prompts, negativePrompt applied at every preset',
  },
};

function isFacts(v: unknown): v is ChannelFacts {
  return !!v && typeof v === 'object' && typeof (v as ChannelFacts).engine === 'string' && !!(v as ChannelFacts).engine;
}

/** The facts of one channel when the server sends them; undefined for a closed channel or an older server. */
export function channelFacts(kind: 'video' | 'image', channel: Channel, channels?: MeChannels): ChannelFacts | undefined {
  const f = channels?.[kind]?.[channel];
  return isFacts(f) ? f : undefined;
}

/** The engine behind a channel: its label when the server sends one, else its id; undefined when the channel is closed. */
export function channelEngine(kind: 'video' | 'image', channel: Channel, labels?: ModelLabels, channels?: ModelChannels, facts?: MeChannels): { id: string; label: string } | undefined {
  const f = channelFacts(kind, channel, facts);
  if (f) return { id: f.engine, label: typeof f.label === 'string' && f.label ? f.label : f.engine };
  const l = labels?.[kind]?.[channel];
  if (l && typeof l.engine === 'string') return { id: l.engine, label: typeof l.label === 'string' && l.label ? l.label : l.engine };
  const id = channels?.[kind]?.[channel];
  return typeof id === 'string' && id ? { id, label: id } : undefined;
}

function listPhrase(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The reference cap a tool call may send as refCreationIds: the first frame is not one of them. */
export function refCreationIdsMax(facts: ChannelFacts): number | undefined {
  const max = facts.refs?.max;
  if (typeof max !== 'number' || !Number.isFinite(max)) return undefined;
  return Math.max(0, facts.refs?.firstFrame ? max - 1 : max);
}

function mechanics(kind: 'video' | 'image', f: ChannelFacts): string {
  const refs = refCreationIdsMax(f);
  if (kind === 'video') {
    const sound = f.audio?.output ? 'clips with sound' : 'silent clips';
    const fps = typeof f.outputFps === 'number' && f.outputFps > 0 ? ` at ${f.outputFps} fps` : '';
    const parts = [`${sound}${fps}`];
    if (refs !== undefined) parts.push(refs > 0 ? `the first frame plus up to ${refs} refCreationIds` : 'the first frame only');
    if (f.aspectRatios) parts.push('aspectRatio');
    if (f.audio?.reference) parts.push('an optional audio reference');
    return listPhrase(parts);
  }
  const parts: string[] = [];
  if (refs !== undefined) parts.push(refs > 0 ? `up to ${refs} refCreationIds` : 'no refCreationIds');
  if (f.negativePrompt) parts.push('negativePrompt applied at every preset');
  return parts.join(', ');
}

/** The engine's own words minus the clauses the facts already say (references, sound, frame rate). */
function extraTraits(traits: unknown): string {
  if (typeof traits !== 'string') return '';
  return traits.split(';').map(t => t.trim()).filter(t => t && !/\b(references?|sound|fps|audio|first frame)\b/i.test(t)).join('; ');
}

/** "Gen8.1 — clips with sound …": built from the channel facts the server sends (`/v1/me.channels`), else from this
 *  release's table, else the bare label for an engine neither describes. */
export function describeEngine(kind: 'video' | 'image', engine: { id: string; label: string }, facts?: ChannelFacts): string {
  if (facts && facts.engine === engine.id) {
    const m = mechanics(kind, facts);
    const traits = extraTraits(facts.traits);
    const body = [m, traits].filter(Boolean).join('; ');
    return body ? `${engine.label} — ${body}` : engine.label;
  }
  const known = ENGINE_FACTS[kind][engine.id];
  return known ? `${engine.label} — ${known}` : engine.label;
}

/** Structured facts of one channel for `platform.engines`, from the server's `channels` when present. */
export function engineFacts(kind: 'video' | 'image', facts: ChannelFacts): Record<string, unknown> {
  const refs = refCreationIdsMax(facts);
  return {
    engine: facts.engine,
    ...(facts.label ? { label: facts.label } : {}),
    ...(facts.displayName ? { displayName: facts.displayName } : {}),
    ...(typeof facts.allowed === 'boolean' ? { allowed: facts.allowed } : {}),
    ...(refs !== undefined ? { maxRefCreationIds: refs } : {}),
    ...(typeof facts.negativePrompt === 'boolean' ? { negativePrompt: facts.negativePrompt } : {}),
    ...(kind === 'video' ? {
      ...(facts.audio ? { sound: facts.audio.output === true, audioReference: facts.audio.reference === true, ...(facts.audio.uses?.length ? { audioUses: facts.audio.uses } : {}) } : {}),
      ...(typeof facts.aspectRatios === 'boolean' ? { aspectRatio: facts.aspectRatios } : {}),
      ...(typeof facts.outputFps === 'number' ? { outputFps: facts.outputFps } : {}),
      ...(typeof facts.defaultDuration === 'number' ? { defaultDuration: facts.defaultDuration } : {}),
    } : {}),
    ...(facts.traits ? { traits: facts.traits } : {}),
  };
}

/** The distinct engine labels behind the open channels, in a readable list ("Gen8.1", or "A and B" when they differ). */
export function engineFamilies(labels?: ModelLabels, channels?: ModelChannels, facts?: MeChannels): string {
  const names: string[] = [];
  for (const kind of ['video', 'image'] as const) {
    for (const ch of ['default', 'next'] as const) {
      const e = channelEngine(kind, ch, labels, channels, facts);
      if (e && !names.includes(e.label)) names.push(e.label);
    }
  }
  names.sort();
  return listPhrase(names);
}
