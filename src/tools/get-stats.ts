import { z } from 'zod';
import type { RegisterTool } from './types.js';
import { guard, ok } from '../result.js';

/** "1234567" → "1 234 567" — keeps big counters readable in the summary line. */
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');
}

function fmtGb(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  return gb >= 10 ? String(Math.round(gb)) : gb.toFixed(1);
}

function fmtAge(seconds: number | null): string | undefined {
  if (seconds === null) return undefined;
  if (seconds < 90) return `${Math.round(seconds)}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}min`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export const registerGetStats: RegisterTool = (server, ctx) => {
  server.registerTool(
    'get_stats',
    {
      title: 'Get account statistics',
      description:
        'One consolidated read of the account\'s activity: creation counts and streak, storage use, ' +
        'generation volume and spend over a 30 or 90 day window (split by day, tool and origin), ' +
        'plus the most-used references, styles and keywords. The first line is a ready-made summary; ' +
        'the JSON block has the detail. Numbers come from a server-side cache — its age is reported, ' +
        'and a stale cache refreshes itself in the background. Costs nothing.',
      inputSchema: {
        days: z.union([z.literal(30), z.literal(90)]).optional()
          .describe('Window for the generation numbers: 30 (default) or 90 days.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args, extra) => guard(async () => {
      const days = args.days ?? 30;
      const [overview, generations, top] = await Promise.all([
        ctx.client.stats.overview(extra.signal),
        ctx.client.stats.generations({ days, signal: extra.signal }),
        ctx.client.stats.top(extra.signal),
      ]);

      const c = overview.counters;
      const age = fmtAge(overview.cache.ageSeconds);
      const summary =
        `${fmtInt(c.totalCreations)} creations (${c.weekCreations} this week, streak ${overview.streak.days}d) · ` +
        `${fmtGb(overview.storage.usedBytes)}/${fmtGb(overview.storage.quotaBytes)} GB · ` +
        `${days}d: ${fmtInt(generations.totals.count)} gens, $${generations.totals.costUsd.toFixed(2)} · ` +
        `stats ${age ?? 'fresh'}${age ? ' old' : ''}${overview.cache.stale ? ' (refreshing)' : ''}`;

      return ok(summary, {
        overview: {
          storage: overview.storage,
          counters: overview.counters,
          streak: overview.streak,
          smartSummaries: overview.smartSummaries,
          toolsRecent: overview.toolsRecent,
          cache: overview.cache,
        },
        generations,
        top: {
          topRefs: top.topRefs.slice(0, 8),
          topStyles: top.topStyles.slice(0, 10),
          topKeywords: top.topKeywords.slice(0, 10),
        },
      });
    }),
  );
};
