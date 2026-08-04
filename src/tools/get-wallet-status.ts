import type { RegisterTool } from './types.js';
import { guard, ok } from '../result.js';

export const registerGetWalletStatus: RegisterTool = (server, ctx) => {
  server.registerTool(
    'get_wallet_status',
    {
      title: 'Get wallet and tier status',
      description:
        'Read-only wallet snapshot: $2DAI token balance, USD credit, and the account\'s effective ' +
        'tier with the four signals it is derived from (explicit assignment, staking watermark, ' +
        '24h hold watermark, live wallet value — the highest wins). Also flags any in-flight ' +
        'withdrawal, swap or staking lock. Needs the opt-in "finance" scope on the API key ' +
        '(enabled in the dashboard\'s key settings). No tool on this server can move money.',
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (extra) => guard(async () => {
      const [wallet, tier, tiers] = await Promise.all([
        ctx.client.finance.wallet(extra.signal),
        ctx.client.finance.tier(extra.signal),
        // The catalogue only needs "read" — a failure just drops the pretty name.
        ctx.client.finance.tiers(extra.signal).catch(() => undefined),
      ]);
      const tierName = tiers?.find((t) => t.key === tier.effective)?.name;
      const flags = [
        wallet.pendingWithdrawal ? 'withdrawal in flight' : '',
        wallet.pendingSwap ? 'swap in flight' : '',
        wallet.lockActive ? 'staking lock active' : '',
      ].filter(Boolean).join(', ');
      return ok(
        `${wallet.tokens.toLocaleString('en-US')} $2DAI · $${wallet.creditUsd.toFixed(2)} credit · ` +
        `tier ${tier.effective}${tierName ? ` (${tierName})` : ''}${flags ? ` · ${flags}` : ''}.`,
        {
          wallet,
          tier: { effective: tier.effective, legs: tier.legs },
        },
      );
    }),
  );
};
