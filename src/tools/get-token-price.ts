import { ApiError } from '2dai-cloud-sdk';
import type { RegisterTool } from './types.js';
import { guard, ok, fail } from '../result.js';

function fmtAge(ms: number | null): string | undefined {
  if (ms === null) return undefined;
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s`;
  if (s < 5400) return `${Math.round(s / 60)}min`;
  return `${(s / 3600).toFixed(1)}h`;
}

export const registerGetTokenPrice: RegisterTool = (server, ctx) => {
  server.registerTool(
    'get_token_price',
    {
      title: 'Get the $2DAI token price',
      description:
        'The cached $2DAI/USD quote. Works with the ordinary "read" scope — no finance scope ' +
        'needed. The quote is served from a cache and never triggers a live refresh, so treat it as ' +
        'indicative: the staleness is included so you can judge how current it is. Costs nothing.',
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (extra) => guard(async () => {
      try {
        const price = await ctx.client.finance.tokenPrice(extra.signal);
        const age = fmtAge(price.staleMs);
        return ok(
          `$2DAI = $${price.usdPrice} (cached quote${age ? `, ${age} old` : ''}).`,
          { usdPrice: price.usdPrice, asOf: price.asOf, staleMs: price.staleMs },
        );
      } catch (err) {
        if (err instanceof ApiError && err.code === 'PRICE_UNAVAILABLE') {
          return fail(new Error('No cached $2DAI price quote is available right now — try again in a few minutes.'));
        }
        throw err;
      }
    }),
  );
};
