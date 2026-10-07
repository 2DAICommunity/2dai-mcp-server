import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { guard, ok, viewUrlFor } from '../result.js';
import { resolveReadPath } from '../paths.js';

export const registerUploadAudio: RegisterTool = (server, ctx) => {
  server.registerTool(
    'upload_audio',
    {
      title: 'Upload an audio file',
      description:
        'Upload a local MP3 (or base64 bytes) to the 2DAI cloud drive so it can be the AUDIO REFERENCE of a ' +
        'Gen8 Flash clip: pass the returned creationId as audioCreationId to generate_video with videoModel "next", ' +
        'with audioUse "music" (soundtrack / sound design) or "voice" (a voice sample the speaking character follows). ' +
        'MP3 only, 5 minutes max (400 AUDIO_TOO_LONG), Holder tier and up (403 AUDIO_NOT_ALLOWED). Free; no vision ' +
        'caption — the file name and length label it in the drive. Paths must stay inside the working directory ' +
        'unless the server was started with TWODAI_ALLOW_ANY_PATH=1.',
      inputSchema: {
        path: z.string().optional().describe('Path to the .mp3 file, relative to the working directory.'),
        base64: z.string().optional().describe('Raw base64 MP3 bytes — alternative to path.'),
        filename: z.string().max(120).optional().describe('Filename to store (defaults to the source name; it labels the audio in the drive).'),
        targetFolderId: z.string().optional().describe('File the upload directly into this folder (must be a folder you can write to); omit to land at the drive root.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args, extra) => guard(async () => {
      if (!args.path && !args.base64) {
        throw new Error('Provide either "path" or "base64".');
      }
      const extras = {
        contentType: 'audio/mpeg',
        ...(args.filename ? { filename: args.filename } : {}),
        ...(args.targetFolderId ? { targetFolderId: args.targetFolderId } : {}),
        signal: extra.signal,
      };
      const input = args.path
        ? { path: await resolveReadPath(args.path, ctx.config), ...extras }
        : { base64: args.base64!, ...extras };
      const creation = await ctx.client.uploads.audio(input);
      const secs = typeof creation.duration === 'number' ? Math.round(creation.duration * 10) / 10 : undefined;
      return ok(
        `Uploaded${args.targetFolderId ? ` into folder ${args.targetFolderId}` : ''}. creationId ${creation.creationId}` +
        `${secs ? ` (${secs} s)` : ''} — pass it as audioCreationId to generate_video with videoModel "next" ` +
        `(audioUse "music" or "voice"); it counts as one more reference for the price.`,
        {
          creationId: creation.creationId,
          viewUrl: viewUrlFor(creation.creationId),
          cdnId: creation.cdnId,
          durationSec: secs,
          label: creation.description,
          folderId: creation.folderId ?? undefined,
        },
      );
    }),
  );
};
