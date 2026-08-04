import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { guard, ok } from '../result.js';

export const registerPublishCreation: RegisterTool = (server, ctx) => {
  server.registerTool(
    'publish_creation',
    {
      title: 'Publish or unpublish a creation',
      description:
        'Flip ONE creation\'s public visibility (needs the "publish" scope). Publishing puts it on the ' +
        '2DAI public feed. Only the account\'s own AI generations can go public — raw uploads and ' +
        'NSFW-flagged creations are refused by the platform. Unpublish always works on a public row. ' +
        'Publish only when the user explicitly asked.',
      inputSchema: {
        action: z.enum(['publish', 'unpublish']).describe('What to do.'),
        creationId: z.string().length(32).describe('The creation to act on.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args, extra) => guard(async () => {
      if (args.action === 'publish') {
        const res = await ctx.client.creations.publish(args.creationId, extra.signal);
        return ok('Published — it is now on the public feed.', res as any);
      }
      const res = await ctx.client.creations.unpublish(args.creationId, extra.signal);
      return ok('Unpublished — it is private again.', res as any);
    }),
  );
};
