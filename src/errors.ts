import {
  ApiError, AuthError, ScopeError, InsufficientCreditError, SpendLimitError,
  TierError, NsfwRejectedError, QueueLimitError, NotFoundError, RateLimitError,
  ValidationError, GenerationFailedError, TimeoutError,
} from '2dai-cloud-sdk';

/** Turns an SDK error into one sentence the model can both relay and act on.
 *  Every tool returns these as `isError: true` results rather than throwing —
 *  an exception escaping a handler tears down the stdio connection and the host
 *  reports "server crashed" instead of showing the reason. */
export function describeError(err: unknown): string {
  if (err instanceof InsufficientCreditError) {
    const short = typeof err.deficitUsd === 'number' ? ` (short $${err.deficitUsd.toFixed(2)})` : '';
    return `Out of credit${short}. Top up at https://2dai.io → Dashboard → Credit.`;
  }
  if (err instanceof SpendLimitError) {
    const spent = typeof err.spentUsd === 'number' ? err.spentUsd.toFixed(2) : '?';
    const limit = typeof err.spendLimitUsd === 'number' ? err.spendLimitUsd.toFixed(2) : '?';
    return `This API key's spend cap is reached ($${spent} of $${limit}). Raise it in Dashboard → Integrations → API keys.`;
  }
  if (err instanceof ScopeError) {
    if (err.requiredScope === 'finance') {
      return 'Wallet data needs the opt-in "finance" scope, which this API key does not carry. ' +
        'Enable it on the key (or create a finance-scoped key) at 2dai.io → Dashboard → Integrations → API keys, then retry.';
    }
    return `This API key lacks the scope this action needs${err.message ? ` (${err.message})` : ''}. Issue a key with the right scopes in Dashboard → Integrations.`;
  }
  if (err instanceof AuthError) {
    return 'The API key was rejected. Check TWODAI_API_KEY in your MCP client config — it may be revoked or mistyped.';
  }
  if (err instanceof NsfwRejectedError) {
    return 'Blocked by content moderation. Rephrase the prompt, or enable NSFW on the account if the request is legitimate.';
  }
  if (err instanceof TierError) {
    return `Your tier does not include this option${err.message ? ` (${err.message})` : ''}. See Dashboard → Tiers.`;
  }
  if (err instanceof QueueLimitError) {
    return 'Too many generations already running on this account. Wait for one to finish, or poll with check_generation.';
  }
  if (err instanceof RateLimitError) {
    return 'Rate limited. Wait a few seconds before retrying.';
  }
  if (err instanceof NotFoundError) {
    return 'Not found — the creation, folder or queue id does not exist on this account (or was deleted).';
  }
  if (err instanceof GenerationFailedError) {
    return `The generation failed server-side${err.message ? `: ${err.message}` : ''}. Nothing was charged; try again.`;
  }
  if (err instanceof TimeoutError) {
    return 'Timed out waiting for the generation. It is probably still running — call check_generation with the queueId.';
  }
  if (err instanceof ValidationError) {
    if (err.code === 'DUPLICATE_IN_FOLDER') return 'That image is already in the target folder.';
    if (err.code === 'IDEMPOTENT_RETRY') {
      return 'This exact generation was just submitted — it was not charged twice. Use list_creations or check_generation to find the original.';
    }
    if (err.code === 'NOT_IN_TRASH') {
      return 'Permanent delete only works on a trashed creation — call organise_creation with action "trash" first.';
    }
    if (err.code === 'NSFW_NOT_PUBLISHABLE') {
      return 'This creation is NSFW-flagged and cannot be made public.';
    }
    if (err.code === 'UPLOADED_NOT_PUBLISHABLE') {
      return 'Raw uploads cannot be published — only the account\'s own AI generations can go public.';
    }
    if (err.code === 'CREATION_IN_TRASH') {
      return 'This creation is in the trash — restore it before publishing.';
    }
    if (err.code === 'FILE_TOO_LARGE') {
      // Preserve the crisp "your file was X, cap is Y" message the local
      // pre-check used to emit before the cap was bumped to 100 MB (the
      // Founder ceiling) — otherwise a lower-tier account gets a generic
      // "Invalid request" and the agent can only guess how much to shrink.
      const d = (err as any).details ?? {};
      const maxMb = typeof d.maxBytes === 'number' ? (d.maxBytes / 1024 / 1024).toFixed(0) : null;
      const actualMb = typeof d.actualBytes === 'number' ? (d.actualBytes / 1024 / 1024).toFixed(1) : null;
      if (maxMb && actualMb) {
        return `Upload rejected — file is ${actualMb} MB but this account caps uploads at ${maxMb} MB.`;
      }
      if (maxMb) {
        return `Upload rejected — this account caps uploads at ${maxMb} MB.`;
      }
      return 'Upload rejected — file exceeds this account\'s size cap.';
    }
    return `Invalid request${err.message ? `: ${err.message}` : ''}.`;
  }
  if (err instanceof ApiError) {
    return `2DAI API error${err.code ? ` [${err.code}]` : ''}${err.message ? `: ${err.message}` : ''}.`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
