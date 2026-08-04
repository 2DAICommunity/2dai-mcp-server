import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { guard, ok } from '../result.js';

const ACTIONS = [
  'create', 'rename', 'delete',
  'set-favorite', 'set-poster', 'move-to-group',
  'create-group', 'rename-group', 'delete-group', 'list-groups',
] as const;

export const registerManageFolder: RegisterTool = (server, ctx) => {
  server.registerTool(
    'manage_folder',
    {
      title: 'Manage folders and sidebar groups',
      description:
        'Folder CRUD plus sidebar organisation on the account\'s cloud drive (needs the "manage" ' +
        'scope; "list-groups" only needs "read"). "create" needs a title (optionally a groupId to ' +
        'create it inside a group). "rename" updates title and/or description. "delete" removes the ' +
        'folder — its creations detach to the drive root by default, or go to trash with ' +
        'trashContents=true; never a permanent delete. "set-favorite" stars/unstars a folder ' +
        '(starred folders feed the "favorites" smart collection). "set-poster" pins a creation as ' +
        'the folder cover (null clears it). "move-to-group" files the folder under a sidebar group ' +
        '(null detaches). Groups are the collapsible sidebar sections: "create-group" / ' +
        '"rename-group" take a title, "delete-group" only detaches its folders, "list-groups" shows ' +
        'them all.',
      inputSchema: {
        action: z.enum(ACTIONS).describe('What to do.'),
        folderId: z.string().optional().describe('The folder to act on (from list_folders). Not used by the *-group actions.'),
        title: z.string().min(1).max(80).optional().describe('Title — required for create/create-group/rename-group, optional for rename.'),
        description: z.string().max(300).optional().describe('Folder description (create/rename).'),
        trashContents: z.boolean().optional().describe('delete only — send the folder\'s creations to trash instead of detaching them.'),
        favorite: z.boolean().optional().describe('set-favorite only — true to star the folder, false to unstar.'),
        posterCreationId: z.string().length(32).nullable().optional()
          .describe('set-poster only — the creation to pin as the folder cover, or null to clear it.'),
        groupId: z.string().nullable().optional()
          .describe('The sidebar group: target for move-to-group (null detaches), the group to rename/delete, or where "create" files the new folder.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (args, extra) => guard(async () => {
      if (args.action === 'list-groups') {
        const groups = await ctx.client.folders.groups.list(extra.signal);
        return ok(`${groups.length} sidebar group(s).`, {
          groups: groups.map((g) => ({
            groupId: g.groupId,
            title: g.title,
            sortIndex: g.sortIndex,
            collapsed: g.collapsed || undefined,
          })),
        });
      }
      if (args.action === 'create-group') {
        if (!args.title) throw new Error('create-group needs a "title".');
        const group = await ctx.client.folders.groups.create(args.title, extra.signal);
        return ok(`Group created. groupId ${group.groupId}.`, { groupId: group.groupId, title: group.title });
      }
      if (args.action === 'rename-group') {
        if (typeof args.groupId !== 'string') throw new Error('rename-group needs a "groupId" (from list-groups).');
        if (!args.title) throw new Error('rename-group needs a "title".');
        const group = await ctx.client.folders.groups.rename(args.groupId, args.title, extra.signal);
        return ok('Group renamed.', { groupId: group.groupId, title: group.title });
      }
      if (args.action === 'delete-group') {
        if (typeof args.groupId !== 'string') throw new Error('delete-group needs a "groupId" (from list-groups).');
        const res = await ctx.client.folders.groups.remove(args.groupId, extra.signal);
        return ok('Group deleted — its folders detached to the sidebar root; no folder or creation was deleted.', res);
      }

      if (args.action === 'create') {
        if (!args.title) throw new Error('create needs a "title".');
        const folder = await ctx.client.folders.create(
          {
            title: args.title,
            ...(args.description ? { description: args.description } : {}),
            ...(typeof args.groupId === 'string' ? { groupId: args.groupId } : {}),
          },
          extra.signal,
        );
        return ok(`Folder created. folderId ${folder.folderId}.`, { folderId: folder.folderId, title: folder.title });
      }

      if (!args.folderId) throw new Error(`${args.action} needs a "folderId" (from list_folders).`);
      if (args.action === 'rename') {
        if (!args.title && args.description === undefined) throw new Error('rename needs "title" and/or "description".');
        const folder = await ctx.client.folders.update(
          args.folderId,
          {
            ...(args.title ? { title: args.title } : {}),
            ...(args.description !== undefined ? { description: args.description } : {}),
          },
          extra.signal,
        );
        return ok(`Folder updated.`, { folderId: args.folderId, title: folder.title, description: folder.description });
      }
      if (args.action === 'set-favorite') {
        if (args.favorite === undefined) throw new Error('set-favorite needs "favorite": true to star, false to unstar.');
        const folder = await ctx.client.folders.update(args.folderId, { isFavorite: args.favorite }, extra.signal);
        return ok(
          args.favorite
            ? 'Folder starred — its creations now show in the "favorites" smart collection.'
            : 'Folder unstarred.',
          { folderId: args.folderId, isFavorite: folder.isFavorite === true },
        );
      }
      if (args.action === 'set-poster') {
        if (args.posterCreationId === undefined) {
          throw new Error('set-poster needs "posterCreationId" — a creation id to pin, or null to clear the cover.');
        }
        const folder = await ctx.client.folders.update(
          args.folderId,
          { posterCreationId: args.posterCreationId },
          extra.signal,
        );
        return ok(
          args.posterCreationId === null ? 'Folder cover cleared.' : 'Folder cover pinned.',
          { folderId: args.folderId, posterCreationId: folder.posterCreationId ?? null },
        );
      }
      if (args.action === 'move-to-group') {
        if (args.groupId === undefined) {
          throw new Error('move-to-group needs "groupId" — a group id from list-groups, or null to detach.');
        }
        const folder = await ctx.client.folders.update(args.folderId, { groupId: args.groupId }, extra.signal);
        return ok(
          args.groupId === null ? 'Folder detached from its group.' : `Folder moved into group ${args.groupId}.`,
          { folderId: args.folderId, groupId: folder.groupId ?? null },
        );
      }

      const res = await ctx.client.folders.delete(args.folderId, {
        ...(args.trashContents ? { trashContents: true } : {}),
        signal: extra.signal,
      });
      return ok(
        args.trashContents
          ? 'Folder deleted; its creations went to trash (restorable).'
          : 'Folder deleted; its creations moved to the drive root.',
        res,
      );
    }),
  );
};
