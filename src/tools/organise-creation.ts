import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { guard, ok } from '../result.js';

const ACTIONS = ['move', 'trash', 'restore', 'delete', 'like', 'unlike', 'batch-trash', 'batch-restore'] as const;

export const registerOrganiseCreation: RegisterTool = (server, ctx) => {
  server.registerTool(
    'organise_creation',
    {
      title: 'Move, trash, restore, delete or like creations',
      description:
        'Organise creations on the cloud drive (needs the "manage" scope). "move" needs a folderId ' +
        '(or "root" to ungroup). "trash" is reversible; "restore" undoes it. "like"/"unlike" SET the ' +
        'like state — idempotent, a repeat is harmless, and any public creation can be liked too. ' +
        '"batch-trash"/"batch-restore" act on up to 100 ids in one call (reversible, like their ' +
        'single-creation forms). "delete" is PERMANENT, stays one creation per call by design, and ' +
        'only works on a creation already in trash — trash it first, and only delete when the user ' +
        'explicitly asked for permanent removal.',
      inputSchema: {
        action: z.enum(ACTIONS).describe('What to do.'),
        creationId: z.string().length(32).optional().describe('The creation to act on (every action except batch-*).'),
        folderId: z.string().optional().describe('move only — target folder id, or "root" to detach.'),
        ids: z.array(z.string().length(32)).min(1).max(100).optional()
          .describe('batch-trash / batch-restore only — up to 100 creation ids.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (args, extra) => guard(async () => {
      if (args.action === 'batch-trash' || args.action === 'batch-restore') {
        if (!args.ids?.length) throw new Error(`${args.action} needs "ids" (1-100 creation ids).`);
        const verb = args.action === 'batch-trash' ? 'trash' : 'untrash';
        const res = await ctx.client.creations.batch(verb, args.ids, extra.signal);
        const skipped = res.skipped ? ` (${res.skipped} skipped — already in the requested state or not eligible)` : '';
        return ok(
          args.action === 'batch-trash'
            ? `Sent ${res.processed} of ${res.requested} to trash${skipped}. Reversible with batch-restore.`
            : `Restored ${res.processed} of ${res.requested} from trash${skipped}.`,
          res as unknown as Record<string, unknown>,
        );
      }

      const id = args.creationId;
      if (!id) throw new Error(`${args.action} needs a "creationId".`);
      if (args.action === 'like' || args.action === 'unlike') {
        const res = await ctx.client.creations.like(id, args.action === 'like', extra.signal);
        return ok(
          res.changed
            ? (res.liked ? `Liked — ${res.likeCount} like(s) now.` : `Unliked — ${res.likeCount} like(s) now.`)
            : (res.liked ? 'Already liked — nothing changed.' : 'Was not liked — nothing changed.'),
          res as unknown as Record<string, unknown>,
        );
      }
      if (args.action === 'move') {
        if (!args.folderId) throw new Error('move needs a "folderId" ("root" detaches to the drive root).');
        const target = args.folderId === 'root' ? 'root' : args.folderId;
        const res = await ctx.client.creations.move(id, target, extra.signal);
        return ok(args.folderId === 'root' ? 'Moved to the drive root.' : `Moved to folder ${args.folderId}.`, res as any);
      }
      if (args.action === 'trash') {
        const res = await ctx.client.creations.trash(id, extra.signal);
        return ok('Sent to trash (reversible with action "restore").', res as any);
      }
      if (args.action === 'restore') {
        const res = await ctx.client.creations.restore(id, extra.signal);
        return ok('Restored from trash.', res as any);
      }
      const res = await ctx.client.creations.delete(id, extra.signal);
      return ok('Permanently deleted, including the stored media.', res as any);
    }),
  );
};
