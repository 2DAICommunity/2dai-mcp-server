import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { guard, ok, viewUrlFor } from '../result.js';
import { resolveReadPath } from '../paths.js';

export const registerUploadImage: RegisterTool = (server, ctx) => {
  const hasFs = ctx.config.fileAccess !== 'none';
  server.registerTool(
    'upload_image',
    {
      title: 'Upload an image',
      description:
        'Upload a local image (or base64 bytes) to the 2DAI cloud drive so it can be used as a ' +
        'reference for generation ("use THIS image"). Free, but the file goes through the platform\'s ' +
        'moderation pass — NSFW beyond the account\'s ceiling is rejected. Max 100 MB (Founder tier) — ' +
        'lower tiers cap earlier, the server returns 413 with the account\'s actual max on excess. jpeg/png/webp. ' +
        (hasFs
          ? 'Paths must stay inside the working directory unless the server was started with TWODAI_FILE_ACCESS=any. '
          : 'This server has no filesystem: send the bytes as base64, a path is refused. ') +
        'An MP3 for a Gen8 Flash audio reference goes through upload_audio instead.',
      inputSchema: {
        path: z.string().optional().describe(hasFs
          ? 'Path to the image file, relative to the working directory.'
          : 'Not available on this server (no filesystem) — send base64 instead.'),
        base64: z.string().optional().describe('Raw base64 image bytes — alternative to path.'),
        filename: z.string().max(120).optional().describe('Filename to store (defaults to the source name).'),
        contentType: z.string().optional().describe('MIME type when sending base64 (e.g. image/png).'),
        targetFolderId: z.string().optional().describe('File the upload directly into this folder (must be a folder you can write to); omit to land at the drive root.'),
        croppedFromCreationId: z.string().optional().describe('Record this upload as a CROP edit of an existing creation you own — description and moderation verdict are inherited.'),
        erasedFromCreationId: z.string().optional().describe('Record this upload as an ERASE (alpha) edit of an existing creation you own. Mutually exclusive with croppedFromCreationId.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args, extra) => guard(async () => {
      if (!args.path && !args.base64) {
        throw new Error(hasFs ? 'Provide either "path" or "base64".' : 'Provide "base64" (this server has no filesystem).');
      }
      if (args.croppedFromCreationId && args.erasedFromCreationId) {
        throw new Error('croppedFromCreationId and erasedFromCreationId are mutually exclusive.');
      }
      const extras = {
        ...(args.filename ? { filename: args.filename } : {}),
        ...(args.contentType ? { contentType: args.contentType } : {}),
        ...(args.targetFolderId ? { targetFolderId: args.targetFolderId } : {}),
        ...(args.croppedFromCreationId ? { croppedFromCreationId: args.croppedFromCreationId } : {}),
        ...(args.erasedFromCreationId ? { erasedFromCreationId: args.erasedFromCreationId } : {}),
        signal: extra.signal,
      };
      const input = args.path
        ? { path: await resolveReadPath(args.path, ctx.config), ...extras }
        : { base64: args.base64!, ...extras };
      const creation = await ctx.client.uploads.image(input);
      return ok(
        `Uploaded${args.targetFolderId ? ` into folder ${args.targetFolderId}` : ''}. creationId ${creation.creationId} — ` +
        `pass it as a reference to generate_with_refs or as the inputCreationId of generate_video.`,
        {
          creationId: creation.creationId,
          viewUrl: viewUrlFor(creation.creationId),
          cdnId: creation.cdnId,
          width: creation.width,
          height: creation.height,
          folderId: (creation as any).folderId ?? undefined,
          nsfwFlagged: (creation as any).nsfwFlagged === true || undefined,
        },
      );
    }),
  );
};
