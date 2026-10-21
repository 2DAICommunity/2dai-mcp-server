import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { fail, guard, ok } from '../result.js';
import { slimRow } from './rows.js';

const ACTIVITIES = ['all', 'history', 'uploaded', 'likes', 'public', 'trash', 'sdk', 'mcp', 'portfolio'] as const;
const SORTS = ['newest', 'oldest', 'updated', 'size-desc', 'size-asc', 'type-asc', 'type-desc'] as const;
const RATIOS = ['square', 'landscape', 'portrait'] as const;
const LIKE_FILTERS = ['liked', 'unliked'] as const;
const MEDIA_KINDS = ['image', 'video', 'audio'] as const;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/** A day alone ("2026-10-20") means that whole day: `to` moves to its last millisecond (UTC). Only a full date or a
 *  date-time passes — a bare year or "2026-10" would be misread (the API takes an all-digit value as epoch ms). */
function dateBound(raw: string, end: boolean): string | null {
  const v = raw.trim();
  if (!ISO_RE.test(v)) return null;
  const instant = end && DAY_RE.test(v) ? `${v}T23:59:59.999Z` : v;
  return Number.isNaN(Date.parse(instant)) ? null : instant;
}

export const registerListCreations: RegisterTool = (server, ctx) => {
  server.registerTool(
    'list_creations',
    {
      title: 'List creations',
      description:
        'Page through the account\'s creations, newest first — or pick ONE at random with random=true. ' +
        'Filter MODES are mutually exclusive: folderId ("root" for ungrouped) / trashed=true; an ' +
        'activity lens; a smart collection ("faces", "videos", "crop", "alpha", or "favorites" = ' +
        'creations inside starred folders); sharedFolderId for a folder another user shared with ' +
        'this account; or groupId for a folder group (every folder filed in it, one listing). ' +
        'Cross-cutting filters combine with any mode: search (whole words over ' +
        'description + tags, trailing * makes a prefix), sort, ratioFilter, from/to dates, likeFilter ' +
        '(liked / unliked by this account), mediaKind (image — GIFs included — / video / audio), blockNsfw, ' +
        'hideFiled, and usedRef=<creationId> for creations BUILT FROM that creation. random=true draws ' +
        'from the same filtered set (images and videos only). Paginate by passing back nextBeforeDate (newest-first ' +
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
        groupId: z.string().optional()
          .describe('A folder group — creations across every folder filed in it (ids from manage_folder list-groups).'),
        search: z.string().min(1).max(128).optional()
          .describe('Free-text search over descriptions and tags. Whole-word AND; a trailing * makes a token a prefix ("cyber*").'),
        sort: z.enum(SORTS).optional().describe('Ordering (default newest). Only "newest" emits a nextBeforeDate cursor.'),
        hideFiled: z.boolean().optional()
          .describe('Skip creations already filed into a folder (history/uploaded/likes/sdk/mcp lenses only).'),
        random: z.boolean().optional()
          .describe('Return ONE uniformly-random creation from the filtered set instead of a page (not available on trash).'),
        usedRef: z.string().length(32).optional()
          .describe('Only creations built FROM this creation (reference slots and lineage, clone families included).'),
        ratioFilter: z.array(z.enum(RATIOS)).min(1).max(3).optional()
          .describe('Aspect-ratio buckets to keep: any of "square", "landscape", "portrait".'),
        from: z.string().optional()
          .describe('Only creations made at or after this date or instant (ISO 8601, e.g. "2026-10-01" = from the start of that day, UTC).'),
        to: z.string().optional()
          .describe('Only creations made at or before this date or instant (ISO 8601; a day alone, e.g. "2026-10-20", includes that whole day, UTC).'),
        likeFilter: z.enum(LIKE_FILTERS).optional()
          .describe('"liked" = only the creations this account liked; "unliked" = only the others.'),
        mediaKind: z.enum(MEDIA_KINDS).optional()
          .describe('"image" (GIFs count as images), "video" or "audio" (MP3 uploads). Not "audio" with random=true.'),
        blockNsfw: z.boolean().optional()
          .describe('Hide NSFW creations on this call even when the account shows them.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args, extra) => guard(async () => {
      const from = args.from ? dateBound(args.from, false) : undefined;
      const to = args.to ? dateBound(args.to, true) : undefined;
      if (from === null || to === null) {
        return fail(new Error('from / to must be ISO 8601 dates, e.g. "2026-10-01" or "2026-10-01T12:00:00Z".'));
      }
      const filters = {
        ...(args.folderId ? { folderId: args.folderId } : {}),
        ...(args.trashed !== undefined ? { trashed: args.trashed } : {}),
        ...(args.activity ? { activity: args.activity } : {}),
        ...(args.smart ? { smart: args.smart } : {}),
        ...(args.sharedFolderId ? { sharedFolderId: args.sharedFolderId } : {}),
        ...(args.groupId ? { groupId: args.groupId } : {}),
        ...(args.search ? { search: args.search } : {}),
        ...(args.sort ? { sort: args.sort } : {}),
        ...(args.hideFiled !== undefined ? { hideFiled: args.hideFiled } : {}),
        ...(args.usedRef ? { usedRef: args.usedRef } : {}),
        ...(args.ratioFilter?.length ? { ratioFilter: args.ratioFilter.join(',') } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(args.likeFilter ? { likeFilter: args.likeFilter } : {}),
        ...(args.mediaKind ? { mediaKind: args.mediaKind } : {}),
        ...(args.blockNsfw ? { blockNsfw: true } : {}),
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
