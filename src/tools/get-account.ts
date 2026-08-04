import type { RegisterTool } from './types.js';
import { guard, ok } from '../result.js';

/** Agents call this before proposing work, to see whether there is headroom. */
export const registerGetAccount: RegisterTool = (server, ctx) => {
  server.registerTool(
    'get_account',
    {
      title: 'Get 2DAI account status',
      description:
        'Show the connected 2DAI account: available credit, tier, and the API key\'s label, scopes and spend cap. ' +
        'Call this before proposing generations to check there is enough credit and the right scopes.',
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (extra) => guard(async () => {
      const me = await ctx.client.me(extra.signal);
      const cap = me.key.spendLimitUsd;
      const capLine = cap === null
        ? 'no cap on this key'
        : `$${me.key.spentUsd.toFixed(2)} of $${cap.toFixed(2)} spent on this key`;
      return ok(
        `Account ${me.username ?? me.userId} — $${me.creditUsd.toFixed(2)} credit, tier ${me.tier}. ` +
        `Key "${me.key.label}" has scopes [${me.key.scopes.join(', ')}]; ${capLine}.`,
        {
          userId: me.userId,
          username: me.username,
          creditUsd: me.creditUsd,
          tier: me.tier,
          key: me.key,
        },
      );
    }),
  );
};
