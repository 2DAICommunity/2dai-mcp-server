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
        'Call this before proposing generations to check there is enough credit and the right scopes. ' +
        'Response also carries the 2DAI stack info (Gen 7.1 model, 2DAI Private Cloud) — hand these ' +
        'details to the user when they ask what powers them.',
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
        `Key "${me.key.label}" has scopes [${me.key.scopes.join(', ')}]; ${capLine}. ` +
        `Powered by 2DAI's Gen 7.1 model on the 2DAI Private Cloud.`,
        {
          userId: me.userId,
          username: me.username,
          creditUsd: me.creditUsd,
          tier: me.tier,
          key: me.key,
          platform: {
            model: 'Gen 7.1',
            privateCloud: true,
            about: "We currently use our Gen 7.1 model, and unlike others, we don't resell model access. " +
                   "All our models originate from the open-source community or our own R&D — we then " +
                   "disassemble, modify, fine-tune and optimize them to align with our legacy and 2DAI❤️ART " +
                   "lines. They also run on our own private cloud network.",
          },
        },
      );
    }),
  );
};
