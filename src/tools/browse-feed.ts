import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { guard, ok } from '../result.js';
import { slimRow } from './rows.js';

export const registerBrowseFeed: RegisterTool = (server, ctx) => {
  server.registerTool(
    'browse_feed',
    {
      title: 'Browse the public feed',
      description:
        'Page through the 2DAI public feed — what creators across the platform have published, ' +
        'newest first. Useful for inspiration and trend scans. Rows belong to OTHER accounts ' +
        '(isOwner: false, prompts hidden); you can like them with organise_creation. NSFW-flagged ' +
        'rows are excluded unless includeNsfw is set, and every row carries nsfwFlagged so you can ' +
        'apply your own safeguards. Costs nothing.',
      inputSchema: {
        limit: z.number().int().min(1).max(24).optional().describe('Rows per page (default 12, max 24).'),
        page: z.number().int().min(1).optional().describe('1-based page, newest published first.'),
        includeNsfw: z.boolean().optional().describe('Include NSFW-flagged rows (off by default).'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args, extra) => guard(async () => {
      const feed = await ctx.client.creations.feed({
        limit: args.limit ?? 12,
        ...(args.page !== undefined ? { page: args.page } : {}),
        ...(args.includeNsfw !== undefined ? { includeNsfw: args.includeNsfw } : {}),
        signal: extra.signal,
      });
      const rows = feed.creations.map(slimRow);
      return ok(
        `${rows.length} public creation(s) (page ${feed.page})${feed.hasMore ? ' — more available, ask for the next page' : ''}.`,
        { creations: rows, page: feed.page, limit: feed.limit, hasMore: feed.hasMore },
      );
    }),
  );
};
