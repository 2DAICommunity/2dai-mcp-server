import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { guard, ok, fail } from '../result.js';
import { slimRow } from './rows.js';

/** Single-creation lookup. list_creations pages the library, but there was no
 *  cheap way to fetch ONE row by id — an agent had to page through a folder
 *  or trip the search. `get_creation` fills that gap and doubles as the
 *  opt-in path for the vision-derived description on NSFW-tier outputs
 *  (generation replies withhold the caption at rate ≥ 0.8; this tool always
 *  returns it, so the agent can pull it explicitly when it needs to). */
export const registerGetCreation: RegisterTool = (server, ctx) => {
  server.registerTool(
    'get_creation',
    {
      title: 'Get a creation by id',
      description:
        'Fetch one creation row by its id. Returns the same slim shape as list_creations rows — ' +
        'creationId, viewUrl, prompt (owner-only), description (vision-derived caption), toolKind, ' +
        'source, dimensions, folder, likes, nsfwFlagged, nsfwRate, username. Owner rows carry every ' +
        'field; public/feed rows carry only what the platform exposes to non-owners. Read-only, no ' +
        'credit spent. Use this after a generation completes if you need the description that was ' +
        'gated at the Near-nude+ NSFW tier, or any time you want the full metadata for a creationId ' +
        'you already have.',
      inputSchema: {
        creationId: z.string().length(32).describe('The creation to look up.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args, extra) => guard(async () => {
      const c = await ctx.client.creations.get(args.creationId, extra.signal);
      if (!c) return fail(new Error(`Creation ${args.creationId} not found or not visible to this key.`));
      return ok(
        `Creation ${c.creationId}${c.description ? ` — ${c.description.slice(0, 120)}` : ''}.`,
        { creation: slimRow(c) },
      );
    }),
  );
};
