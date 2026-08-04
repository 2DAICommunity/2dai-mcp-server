import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { guard, ok } from '../result.js';

const SORTS = ['index', 'date-desc', 'date-asc', 'name-asc', 'name-desc', 'update-desc'] as const;

export const registerListFolders: RegisterTool = (server, ctx) => {
  server.registerTool(
    'list_folders',
    {
      title: 'List folders',
      description:
        'Page through the account\'s folders (collections). Use the folderId with list_creations to see ' +
        'a folder\'s contents, or with organise_creation to move something into it. Costs nothing.',
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe('Rows per page (default 20, max 100).'),
        beforeDate: z.string().optional().describe('Pagination cursor — the nextBeforeDate from the previous page.'),
        sort: z.enum(SORTS).optional().describe('Ordering (default newest first). "index" is the user\'s manual sidebar order.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args, extra) => guard(async () => {
      const page = await ctx.client.folders.list({
        ...(args.limit !== undefined ? { limit: args.limit } : {}),
        ...(args.beforeDate ? { beforeDate: args.beforeDate } : {}),
        ...(args.sort ? { sort: args.sort } : {}),
        signal: extra.signal,
      });
      const rows = page.folders.map((f) => ({
        folderId: f.folderId,
        title: f.title,
        isShared: f.isShared || undefined,
        isPublicShared: f.isPublicShared || undefined,
        createdAt: f.createdAt,
      }));
      return ok(
        `${rows.length} folder(s)${page.nextBeforeDate ? ' — more available, pass nextBeforeDate to continue' : ''}.`,
        { folders: rows, nextBeforeDate: page.nextBeforeDate },
      );
    }),
  );
};
