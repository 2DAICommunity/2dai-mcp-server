import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { guard, ok, previewBlock, downloadUrlFor, DOWNLOAD_AUTH_NOTE } from '../result.js';
import { resolveWritePath } from '../paths.js';

export const registerDownloadCreation: RegisterTool = (server, ctx) => {
  // No filesystem of the caller's (hosted transport): the full asset is reachable
  // only through `downloadUrl`, and the tool says so up front rather than letting
  // an agent believe a file landed on the user's disk when it would be ours.
  const hasFs = ctx.config.fileAccess !== 'none';
  server.registerTool(
    'download_creation',
    {
      title: 'Download a creation',
      description: hasFs
        ? 'Fetch a creation\'s media. With savePath the FULL-RESOLUTION asset is written to disk (the ' +
          'right extension is appended automatically) and the path is returned. Without savePath a ' +
          'downscaled preview image is returned inline so the model can look at it — full bytes never ' +
          'go through the context window. Write paths must stay inside the working directory unless ' +
          'TWODAI_FILE_ACCESS=any.'
        : 'Fetch a creation\'s media. This server has no filesystem: the reply carries a downscaled ' +
          'preview image inline (images only) plus `downloadUrl`, the full-resolution file on the 2DAI ' +
          'API — GET it with the same Authorization: Bearer key you use for this server (public ' +
          'creations need no header). Videos have no preview: use the URL. savePath is refused here.',
      inputSchema: {
        creationId: z.string().length(32).optional()
          .describe('The creation to download (preferred).'),
        cdnId: z.string().min(8).max(64).optional()
          .describe('Direct CDN asset id — alternative when no creationId is at hand.'),
        savePath: z.string().optional()
          .describe(hasFs
            ? 'Where to write the file, relative to the working directory. Extension is added for you.'
            : 'Not available on this server (no filesystem) — omit it and use downloadUrl.'),
        watermark: z.boolean().optional()
          .describe('Overlay the 2DAI watermark on the downloaded bytes (default true). The account may need Holder tier or above to turn it off — server ignores the flag for below-gate accounts and stamps anyway. Applies to images and video frames alike.'),
      },
      annotations: { readOnlyHint: !hasFs, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args, extra) => guard(async () => {
      if (!args.creationId && !args.cdnId) {
        throw new Error('Provide either "creationId" or "cdnId".');
      }
      // A creationId is not a cdnId — resolve it through the API first so the
      // CDN call always receives an actual asset id.
      let cdnId = args.cdnId;
      let isAudio = false;
      if (args.creationId) {
        const creation = await ctx.client.creations.get(args.creationId, extra.signal);
        cdnId = creation.cdnId;
        if (!cdnId) throw new Error(`Creation ${args.creationId} has no media to download.`);
        isAudio = creation.mediaKind === 'audio';
      }
      // Default watermark: true — matches the web default. Agents ask for
      // `watermark: false` when the user wants clean bytes; the API still
      // stamps if the account's tier doesn't have `canDisableWatermark`.
      // An audio file has nothing to stamp, so the sentinel is never sent for it.
      const withWatermark = args.watermark !== false && !isAudio;

      if (args.savePath) {
        const target = await resolveWritePath(args.savePath, ctx.config);
        const finalPath = await ctx.client.cdn.download(cdnId!, {
          savePath: target,
          signal: extra.signal,
          ...(withWatermark ? { watermark: true } : {}),
        });
        return ok(`Saved to ${finalPath}.`, { path: finalPath, cdnId, watermark: withWatermark });
      }

      const rc = { ...ctx, signal: extra.signal };
      const preview = await previewBlock(rc, cdnId);
      if (!hasFs) {
        const downloadUrl = downloadUrlFor(ctx.config, cdnId!, withWatermark);
        const result = ok(
          (preview
            ? 'Preview attached (downscaled). '
            : 'No inline preview for this asset (video, or previews disabled). ') +
          `Full-resolution file: ${downloadUrl} — ${DOWNLOAD_AUTH_NOTE}`,
          { cdnId, downloadUrl, watermark: withWatermark, auth: 'Authorization: Bearer <2DAI API key>' },
        );
        if (preview) result.content.push(preview);
        return result;
      }
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
