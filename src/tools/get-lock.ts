import type { RegisterTool } from './types.js';
import { guard, ok } from '../result.js';

export const registerGetLock: RegisterTool = (server, ctx) => {
  server.registerTool(
    'get_lock',
    {
      title: 'Get staking lock status',
      description:
        'Read-only view of the account\'s staking lock: none, active (with time remaining), or ' +
        'expiring-soon (under 24 hours left). Needs the opt-in "finance" scope on the API key ' +
        '(enabled in the dashboard\'s key settings). Locks are managed in the dashboard, never here.',
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (extra) => guard(async () => {
      const res = await ctx.client.finance.lock(extra.signal);
      if (res.kind === 'none') {
        return ok('No staking lock on this account.', { kind: 'none' });
      }
      const days = Math.floor(res.remainingMs / 86_400_000);
      const hours = Math.floor((res.remainingMs % 86_400_000) / 3_600_000);
      const remaining = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
      return ok(
        res.kind === 'expiring-soon'
          ? `Staking lock expiring soon — about ${remaining} remaining.`
          : `Staking lock active — about ${remaining} remaining.`,
        { kind: res.kind, remainingMs: res.remainingMs, lock: res.lock },
      );
    }),
  );
};
