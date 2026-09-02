import type { RegisterTool } from './types.js';
import { guard, ok } from '../result.js';

export const registerListArtisticStyles: RegisterTool = (server, ctx) => {
  server.registerTool(
    'list_artistic_styles',
    {
      title: 'List curated artistic styles',
      description:
        'The curated artistic styles available to generate_in_artistic_style, each with an artisticStyleId, a title, a short public blurb and a ' +
        'vignette. Costs nothing. Pass an artisticStyleId to generate_in_artistic_style, or let it pick with "auto".',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (_args, extra) => guard(async () => {
      const styles = await ctx.client.artisticStyles.list(extra.signal);
      const rows = styles.map((a) => ({
        artisticStyleId: a.artisticStyleId,
        title: a.title,
        blurb: a.blurb,
        thumbnailUrl: a.thumbnailCdnId ? ctx.client.cdn.url(a.thumbnailCdnId, { maxSide: 256 }) : undefined,
      }));
      return ok(`${rows.length} artistic style(s) available.`, { artisticStyles: rows });
    }),
  );
};
