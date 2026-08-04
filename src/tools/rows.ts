import type { Creation } from '2dai-cloud-sdk';

/** Slim creation row shared by the listing tools — agents page through
 *  libraries and feeds, so every field must earn its context-window cost.
 *  Falsy flags and empty counters are dropped (absent = false / zero); the
 *  full record stays one download_creation away.
 *
 *  `nsfwFlagged` / `nsfwRate` are surfaced on purpose: agents are expected to
 *  apply their own content safeguards on top of the platform's. */
export function slimRow(c: Creation): Record<string, unknown> {
  return {
    creationId: c.creationId,
    prompt: typeof c.prompt === 'string' ? c.prompt.slice(0, 120) : undefined,
    description: typeof c.description === 'string' ? c.description.slice(0, 160) : undefined,
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
