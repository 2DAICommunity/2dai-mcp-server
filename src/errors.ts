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
    // The server names the first tier that opens the option and writes the sentence; nothing was charged.
    const opens = err.requiredTierName ? ` It opens at ${err.requiredTierName}.` : '';
    const said = err.message ?? '';
    const next = /nothing was charged/i.test(said) ? ' Pick an allowed option from get_account.' : ' Nothing was charged — pick an allowed option from get_account.';
    // Servers ≥ 2.9.0 say which family / channel refused (`details.family`, `details.channel`).
    const d = (err as { details?: { family?: unknown; channel?: unknown } }).details ?? {};
    const param = d.family === 'video' ? 'videoModel' : d.family === 'image' ? 'imageModel' : undefined;
    const channelHint = d.channel === 'next' && param ? ` The default channel may be open to this tier: omit ${param}.` : '';
    return `Your tier does not include this option${said ? ` — ${said}` : '.'}${/\bopens? at\b/.test(said) ? '' : opens}${next}${channelHint} See Dashboard → Tiers.`;
  }
  if (err instanceof QueueLimitError) {
    return 'Too many generations already running on this account. Wait for one to finish, or poll with check_generation.';
  }
  if (err instanceof RateLimitError) {
    return 'Rate limited. Wait a few seconds before retrying.';
  }
  if (err instanceof NotFoundError) {
    const missing = (err as any).details?.missingCreationIds;
    if (Array.isArray(missing) && missing.length > 0) {
      return `CREATION_NOT_FOUND: reference${missing.length > 1 ? 's' : ''} ${missing.join(', ')} cannot be used — unknown, in the trash, deleted, or not visible to this account. Nothing was charged; restore the creation (organise_creation "restore") or drop it from the references.`;
    }
    return 'Not found — the creation, folder or queue id does not exist on this account (or was deleted).';
  }
  if (err instanceof GenerationFailedError) {
    // Current servers send a readable outcome ("…You weren't charged…"); older ones send an
    // internal `CODE: detail` string or nothing.
    const outcomeMessage = (err as { errorMessage?: string }).errorMessage;
    if (outcomeMessage) return outcomeMessage;
    const msg = err.message ?? '';
    const readable = msg.length > 0 && !/^Generation \w+$/.test(msg) && !/^[A-Z][A-Z0-9_]{2,}(:|$)/.test(msg);
    if (readable) return msg;
    return `The generation failed server-side${msg && !/^Generation \w+$/.test(msg) ? `: ${msg}` : ''}. Nothing was charged; try again.`;
  }
  if (err instanceof TimeoutError) {
    return 'Timed out waiting for the generation. It is probably still running — call check_generation with the queueId.';
  }
  if (err instanceof ValidationError) {
    if (err.code === 'DUPLICATE_IN_FOLDER') return 'That image is already in the target folder.';
    if (err.code === 'IDEMPOTENT_RETRY') {
      return 'This exact generation was just submitted — it was not charged twice. Use list_creations or check_generation to find the original.';
    }
    if (err.code === 'PROMPT_TOO_LONG') {
      const d = (err as any).details ?? {};
      const max = typeof d.max === 'number' ? d.max : undefined;
      const next = d.next && typeof d.next.max === 'number' ? ` ${d.next.tier} raises it to ${d.next.max}.` : '';
      return `The prompt is longer than this account accepts${max ? ` (${max} characters on tier ${d.tier ?? '?'})` : ''}. Nothing was charged. Shorten the prompt (and negativePrompt) to fit.${next}`;
    }
    if (err.code === 'INVALID_PROMPT') {
      return 'The prompt was refused: it is empty or longer than this server accepts. Nothing was charged. Call get_account for recommendation.promptMaxChars and shorten the prompt (and negativePrompt) to fit.';
    }
    if (err.code === 'NOT_IN_TRASH') {
      return 'Permanent delete only works on a trashed creation — call organise_creation with action "trash" first.';
    }
    if (err.code === 'NSFW_NOT_PUBLISHABLE') {
      return 'This creation is content-rated (Near-nude or above) and cannot be made public. It stays in the owner\'s private drive, masked until they reveal it.';
    }
    if (err.code === 'UPLOADED_NOT_PUBLISHABLE') {
      return 'Raw uploads cannot be published — only the account\'s own AI generations can go public.';
    }
    if (err.code === 'CREATION_IN_TRASH') {
      return 'This creation is in the trash — restore it before publishing.';
    }
    if (err.code === 'INVALID_AUDIO_REF') {
      return 'INVALID_AUDIO_REF: audioCreationId must be an audio creation of this account — an MP3 stored with upload_audio, not an image or a clip. Nothing was charged.';
    }
    if (err.code === 'IMAGE_MODEL_UNAVAILABLE' || err.code === 'VIDEO_MODEL_UNAVAILABLE') {
      const kind = err.code === 'VIDEO_MODEL_UNAVAILABLE' ? 'video' : 'image';
      const said = serverSentence(err);
      return said ? `${err.code}: ${said} Nothing was charged.`
        : `${err.code}: that ${kind} channel is closed. Nothing was charged — submit again without ${kind}Model (get_account → platform.engines lists the open channels).`;
    }
    if (err.code === 'INVALID_DURATION') {
      const allowed = (err as any).details?.allowed;
      const list = Array.isArray(allowed) && allowed.length ? ` This channel renders ${allowed.join(', ')} s.` : '';
      return `INVALID_DURATION: that clip length is not offered on this channel.${list} Nothing was charged — pick an unlocked length from get_account → videoDurations.`;
    }
    if (err.code === 'TOO_MANY_REFS') {
      const d = (err as any).details ?? {};
      return `TOO_MANY_REFS: this tool takes at most ${d.max ?? '?'} references here (got ${d.got ?? '?'}). Nothing was charged — drop references to fit (get_account → platform.engines.<video|image>.<channel>.maxRefCreationIds gives the cap of each channel).`;
    }
    if (err.code === 'AUDIO_REF_NEXT_ONLY') {
      return `AUDIO_REF_NEXT_ONLY: ${serverSentence(err) ?? 'the engine behind this video channel renders no sound, so it takes no audio reference.'}` +
        ' Nothing was charged — drop audioCreationId, or use a channel whose engine renders sound (get_account → platform.engines).';
    }
    if (err.code === 'AUDIO_TOO_LONG') {
      const max = (err as any).details?.maxSeconds;
      return `AUDIO_TOO_LONG: the audio file is longer than this platform accepts${typeof max === 'number' ? ` (${max} s max)` : ''}. Trim it and upload again.`;
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
  if (err instanceof ApiError && err.code === 'GENERATION_PAUSED') {
    return `GENERATION_PAUSED: ${serverSentence(err) ?? 'generation is paused for a short maintenance.'} Nothing was charged or queued — try again in a few minutes, do not loop.`;
  }
  if (err instanceof ApiError && (err.code === 'KEY_POLICY_QUALITY' || err.code === 'KEY_POLICY_DURATION')) {
    const d = (err.details ?? {}) as { maxQuality?: unknown; maxVideoDurationSec?: unknown };
    const cap = err.code === 'KEY_POLICY_QUALITY'
      ? (typeof d.maxQuality === 'string' ? ` at ${d.maxQuality}` : '')
      : (typeof d.maxVideoDurationSec === 'number' ? ` at ${d.maxVideoDurationSec} s` : '');
    const what = err.code === 'KEY_POLICY_QUALITY' ? 'quality preset' : 'clip length';
    return `${err.code}: this API key's policy caps the ${what}${cap} (see get_account → key). Nothing was charged — submit at or under the cap, or use a key without that policy.`;
  }
  if (err instanceof ApiError && err.code === 'KEY_POLICY_CHANNEL') {
    const ch = (err as any).details?.channel;
    return `KEY_POLICY_CHANNEL: this API key's policy does not reach the "${ch ?? 'next'}" model channel (see get_account → key.modelChannels). Nothing was charged — submit on the default model, or use a key without a channel policy.`;
  }
  if (err instanceof ApiError) {
    return `2DAI API error${err.code ? ` [${err.code}]` : ''}${err.message ? `: ${err.message}` : ''}.`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/** The server's own sentence for a code (it says what to send instead), or undefined when the SDK only had its fallback. */
function serverSentence(err: ApiError): string | undefined {
  const m = (err.details as { message?: unknown } | undefined)?.message;
  return typeof m === 'string' && m.trim() ? m.trim() : undefined;
}
