import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { guard, ok } from '../result.js';

const KINDS = ['transactions', 'balance', 'credit', 'sources'] as const;

export const registerGetWalletHistory: RegisterTool = (server, ctx) => {
  server.registerTool(
    'get_wallet_history',
    {
      title: 'Get wallet history',
      description:
        'Read-only money history for the account. kind = "transactions" (deposits, withdrawals and ' +
        'swaps, newest first, paged), "balance" ($2DAI balance chart points over a window of days), ' +
        '"credit" (USD-credit chart points), or "sources" (where credit came from and went over a ' +
        'window: accrued, bonuses, swapped in, spent on generations). Needs the opt-in "finance" ' +
        'scope on the API key (enabled in the dashboard\'s key settings).',
      inputSchema: {
        kind: z.enum(KINDS).describe('Which history to read.'),
        limit: z.number().int().min(1).max(365).optional()
          .describe('transactions: rows per page (5-50, default 20). balance/credit: window in DAYS (7-365, default 90).'),
        page: z.number().int().min(0).optional().describe('transactions only — 0-based page.'),
        days: z.number().int().min(1).max(365).optional().describe('sources only — window in days (default 30).'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args, extra) => guard(async () => {
      if (args.kind === 'transactions') {
        const res = await ctx.client.finance.transactions({
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
          ...(args.page !== undefined ? { page: args.page } : {}),
          signal: extra.signal,
        });
        return ok(
          `${res.transactions.length} transaction(s) (page ${res.page})${res.hasMore ? ' — more available, ask for the next page' : ''}.`,
          res as unknown as Record<string, unknown>,
        );
      }
      if (args.kind === 'balance') {
        const res = await ctx.client.finance.balanceHistory({
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
          signal: extra.signal,
        });
        return ok(
          `$2DAI balance ${res.currentBalance.toLocaleString('en-US')} — ${res.points.length} history point(s) in the window.`,
          res as unknown as Record<string, unknown>,
        );
      }
      if (args.kind === 'credit') {
        const res = await ctx.client.finance.creditHistory({
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
          signal: extra.signal,
        });
        return ok(
          `Credit $${res.currentCredit.toFixed(2)} — ${res.points.length} history point(s) in the window.`,
          res as unknown as Record<string, unknown>,
        );
      }
      const res = await ctx.client.finance.creditSources({
        ...(args.days !== undefined ? { days: args.days } : {}),
        signal: extra.signal,
      });
      return ok(
        `Last ${res.days}d: +$${res.accruedUsd.toFixed(2)} accrued, +$${res.bonusesUsd.toFixed(2)} bonuses, ` +
        `+$${res.swappedUsd.toFixed(2)} swapped in, -$${res.spentUsd.toFixed(2)} spent on generations.`,
        res as unknown as Record<string, unknown>,
      );
    }),
  );
};
