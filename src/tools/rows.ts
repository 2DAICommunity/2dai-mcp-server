import type { Creation } from '2dai-cloud-sdk';
import { viewUrlFor } from '../result.js';

/** Slim creation row shared by the listing tools — agents page through
 *  libraries and feeds, so every field must earn its context-window cost.
 *  Falsy flags and empty counters are dropped (absent = false / zero); the
 *  full record stays one download_creation away.
 *
 *  `nsfwFlagged` / `nsfwRate` are surfaced on purpose: agents are expected to
 *  apply their own content safeguards on top of the platform's. */
const PROMPT_CUT = 120;
const DESCRIPTION_CUT = 160;

/** Cut a long text for a listing row — never silently: the cut ends with an
 *  ellipsis and the row carries a `…Truncated` flag, so an agent knows to
 *  call get_creation for the full text. */
function cut(text: string | undefined, max: number): { text?: string; truncated: boolean } {
  if (typeof text !== 'string') return { text: undefined, truncated: false };
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max - 1).trimEnd() + '…', truncated: true };
}

/** The same row with the untruncated prompt and description — what
 *  get_creation returns, so a prompt can be re-read and replayed verbatim. */
export function fullRow(c: Creation): Record<string, unknown> {
  return {
    ...slimRow(c),
    prompt: typeof c.prompt === 'string' ? c.prompt : undefined,
    description: typeof c.description === 'string' ? c.description : undefined,
    promptTruncated: undefined,
    descriptionTruncated: undefined,
  };
}

export function slimRow(c: Creation): Record<string, unknown> {
  const p = cut(c.prompt, PROMPT_CUT);
  const d = cut(c.description, DESCRIPTION_CUT);
  return {
    creationId: c.creationId,
    viewUrl: viewUrlFor(c.creationId),
    prompt: p.text,
    promptTruncated: p.truncated || undefined,
    description: d.text,
    descriptionTruncated: d.truncated || undefined,
    toolKind: c.toolKind,
    source: c.source,
    width: c.width,
    height: c.height,
    isUploaded: c.isUploaded || undefined,
    creationDate: c.creationDate,
    folderId: c.folderId ?? undefined,
    inTrash: c.inTrash || undefined,
    isPublicShared: c.isPublicShared || undefined,
    likes: c.likes || undefined,
    isLiked: c.isLiked || undefined,
    // Own rows are the norm — the flag only appears when it is FALSE (feed and
    // shared-folder rows), where it changes which actions are legal.
    isOwner: c.isOwner === false ? false : undefined,
    nsfwFlagged: c.nsfwFlagged || undefined,
    nsfwRate: typeof c.nsfwRate === 'number' ? c.nsfwRate : undefined,
    username: c.username,
  };
}
