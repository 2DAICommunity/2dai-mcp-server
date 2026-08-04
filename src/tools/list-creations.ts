import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { guard, ok } from '../result.js';
import { slimRow } from './rows.js';

const ACTIVITIES = ['all', 'history', 'uploaded', 'likes', 'public', 'trash', 'sdk', 'mcp', 'portfolio'] as const;
const SORTS = ['newest', 'oldest', 'updated', 'size-desc', 'size-asc', 'type-asc', 'type-desc'] as const;

export const registerListCreations: RegisterTool = (server, ctx) => {
  server.registerTool(
    'list_creations',
    {
      title: 'List creations',
      description:
        'Page through the account\'s creations, newest first — or pick ONE at random with random=true. ' +
        'Filter MODES are mutually exclusive: folderId ("root" for ungrouped) / trashed=true; an ' +
        'activity lens; a smart collection ("faces", "videos", "crop", "alpha", or "favorites" = ' +
        'creations inside starred folders); or sharedFolderId for a folder another user shared with ' +
        'this account. Cross-cutting filters combine with any mode: search (whole words over ' +
        'description + tags, trailing * makes a prefix), sort, hideFiled, and usedRef=<creationId> ' +
        'for creations BUILT FROM that creation. Paginate by passing back nextBeforeDate (newest-first ' +
        'only) or with page. Rows carry nsfwFlagged/nsfwRate so you can apply your own content ' +
        'safeguards on top of the platform\'s. Each row has a viewUrl — the browser link to give the ' +
        'user (opens in their signed-in 2DAI drive). Costs nothing.',
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe('Rows per page (default 20, max 100).'),
        beforeDate: z.string().optional().describe('Pagination cursor — the nextBeforeDate from the previous page.'),
        page: z.number().int().min(1).optional().describe('1-based page (offset paging). Prefer beforeDate for deep walks.'),
        folderId: z.string().optional().describe('Filter to one folder, or "root" for ungrouped creations.'),
        trashed: z.boolean().optional().describe('List the trash instead of the active library.'),
        activity: z.enum(ACTIVITIES).optional()
          .describe('Activity lens: all, history (generations), uploaded, likes, public, trash, sdk, mcp, or portfolio.'),
        smart: z.string().optional()
          .describe('Smart collection: "faces", "videos", "crop", "alpha", or "favorites" (creations in starred folders).'),
        sharedFolderId: z.string().optional().describe('A folder shared WITH this account — read-only collaborator view.'),
        search: z.string().min(1).max(128).optional()
          .describe('Free-text search over descriptions and tags. Whole-word AND; a trailing * makes a token a prefix ("cyber*").'),
        sort: z.enum(SORTS).optional().describe('Ordering (default newest). Only "newest" emits a nextBeforeDate cursor.'),
        hideFiled: z.boolean().optional()
          .describe('Skip creations already filed into a folder (history/uploaded/likes/sdk/mcp lenses only).'),
        random: z.boolean().optional()
          .describe('Return ONE uniformly-random creation from the filtered set instead of a page (not available on trash).'),
        usedRef: z.string().length(32).optional()
          .describe('Only creations built FROM this creation (reference slots and lineage, clone families included).'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args, extra) => guard(async () => {
      const filters = {
        ...(args.folderId ? { folderId: args.folderId } : {}),
        ...(args.trashed !== undefined ? { trashed: args.trashed } : {}),
        ...(args.activity ? { activity: args.activity } : {}),
        ...(args.smart ? { smart: args.smart } : {}),
        ...(args.sharedFolderId ? { sharedFolderId: args.sharedFolderId } : {}),
        ...(args.search ? { search: args.search } : {}),
        ...(args.sort ? { sort: args.sort } : {}),
        ...(args.hideFiled !== undefined ? { hideFiled: args.hideFiled } : {}),
        ...(args.usedRef ? { usedRef: args.usedRef } : {}),
      };

      if (args.random) {
        const pick = await ctx.client.creations.random({ ...filters, signal: extra.signal });
        return pick
          ? ok(`Random pick: creationId ${pick.creationId}.`, { creation: slimRow(pick) })
          : ok('No creation matches this filter.', { creation: null });
      }

      const page = await ctx.client.creations.list({
        ...filters,
        ...(args.limit !== undefined ? { limit: args.limit } : {}),
        ...(args.beforeDate ? { beforeDate: args.beforeDate } : {}),
        ...(args.page !== undefined ? { page: args.page } : {}),
        signal: extra.signal,
      });
      const rows = page.creations.map(slimRow);
      return ok(
        `${rows.length} creation(s)${page.nextBeforeDate ? ' — more available, pass nextBeforeDate to continue' : ''}.`,
        {
          creations: rows,
          ...(page.page !== undefined ? { page: page.page } : {}),
          ...(page.nextBeforeDate ? { nextBeforeDate: page.nextBeforeDate } : {}),
        },
      );
    }),
  );
};
