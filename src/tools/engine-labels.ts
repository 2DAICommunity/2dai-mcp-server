/** Engine names are never written in static text: get_account reads them from `/v1/me` (`modelLabels`, `modelChannels`)
 *  at call time, so a server switch renames every channel without a release. Typed here because the SDK this server
 *  builds against may predate `modelLabels`. */
export type ChannelLabel = { engine: string; family: string; label: string };
export type Channel = 'default' | 'next';
export type ModelLabels = { video?: Partial<Record<Channel, ChannelLabel | null>>; image?: Partial<Record<Channel, ChannelLabel | null>> };
export type ModelChannels = { video?: Partial<Record<Channel, string | null>>; image?: Partial<Record<Channel, string | null>> };

/** What each engine takes, keyed on the engine id the server reports — never on the channel. */
const ENGINE_FACTS: Record<'video' | 'image', Record<string, string>> = {
  video: {
    gen8: 'clips with sound at 24 fps, the first frame plus up to 6 refCreationIds, aspectRatio and an optional audio reference',
    gen7: 'silent clips from the first frame only (refCreationIds, aspectRatio and audio references are not used)',
  },
  image: {
    gen8: 'up to 6 refCreationIds read natively, legible text in the picture, long literal prompts, negativePrompt applied at every preset',
    gen7: 'up to 3 refCreationIds, negativePrompt not applied',
  },
};

/** The engine behind a channel: its label when the server sends one, else its id; undefined when the channel is closed. */
export function channelEngine(kind: 'video' | 'image', channel: Channel, labels?: ModelLabels, channels?: ModelChannels): { id: string; label: string } | undefined {
  const l = labels?.[kind]?.[channel];
  if (l && typeof l.engine === 'string') return { id: l.engine, label: typeof l.label === 'string' && l.label ? l.label : l.engine };
  const id = channels?.[kind]?.[channel];
  return typeof id === 'string' && id ? { id, label: id } : undefined;
}

/** "Gen8.1 — clips with sound …", or the bare label for an engine this release does not describe. */
export function describeEngine(kind: 'video' | 'image', engine: { id: string; label: string }): string {
  const facts = ENGINE_FACTS[kind][engine.id];
  return facts ? `${engine.label} — ${facts}` : engine.label;
}

/** The distinct engine labels behind the open channels, in a readable list ("Gen8.1", "Gen7.2 and Gen8.1"). */
export function engineFamilies(labels?: ModelLabels, channels?: ModelChannels): string {
  const names: string[] = [];
  for (const kind of ['video', 'image'] as const) {
    for (const ch of ['default', 'next'] as const) {
      const e = channelEngine(kind, ch, labels, channels);
      if (e && !names.includes(e.label)) names.push(e.label);
    }
  }
  names.sort();
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
