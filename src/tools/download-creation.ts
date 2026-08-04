import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { guard, ok, previewBlock } from '../result.js';
import { resolveWritePath } from '../paths.js';

export const registerDownloadCreation: RegisterTool = (server, ctx) => {
  server.registerTool(
    'download_creation',
    {
      title: 'Download a creation',
      description:
        'Fetch a creation\'s media. With savePath the FULL-RESOLUTION asset is written to disk (the ' +
        'right extension is appended automatically) and the path is returned. Without savePath a ' +
        'downscaled preview image is returned inline so the model can look at it — full bytes never ' +
        'go through the context window. Write paths must stay inside the working directory unless ' +
        'TWODAI_ALLOW_ANY_PATH=1.',
      inputSchema: {
        creationId: z.string().length(32).optional()
          .describe('The creation to download (preferred).'),
        cdnId: z.string().min(8).max(64).optional()
          .describe('Direct CDN asset id — alternative when no creationId is at hand.'),
        savePath: z.string().optional()
          .describe('Where to write the file, relative to the working directory. Extension is added for you.'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args, extra) => guard(async () => {
      if (!args.creationId && !args.cdnId) {
        throw new Error('Provide either "creationId" or "cdnId".');
      }
      // A creationId is not a cdnId — resolve it through the API first so the
      // CDN call always receives an actual asset id.
      let cdnId = args.cdnId;
      if (args.creationId) {
        const creation = await ctx.client.creations.get(args.creationId, extra.signal);
        cdnId = creation.cdnId;
        if (!cdnId) throw new Error(`Creation ${args.creationId} has no media to download.`);
      }

      if (args.savePath) {
        const target = await resolveWritePath(args.savePath, ctx.config);
        const finalPath = await ctx.client.cdn.download(cdnId!, { savePath: target, signal: extra.signal });
        return ok(`Saved to ${finalPath}.`, { path: finalPath, cdnId });
      }

      const rc = { ...ctx, signal: extra.signal };
      const preview = await previewBlock(rc, cdnId);
      if (!preview) {
        return ok(
          'No inline preview available for this asset (video, or previews disabled) — ' +
          'pass savePath to write the full file to disk.',
          { cdnId },
        );
      }
      const result = ok(`Preview attached (downscaled). Pass savePath to save the full-resolution file.`, { cdnId });
      result.content.push(preview);
      return result;
    }),
  );
};
