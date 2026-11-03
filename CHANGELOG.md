# Changelog

## 2.2.0 (2026-11-03)

The default channels move to the Gen8 engines (server switch of 2026-11-03). No tool description or instruction writes an
engine version any more: get_account reads them from the server at call time, so the next switch needs no release.

Behaviour:

- `generate_video` passes `refCreationIds` and `aspectRatio` on every channel; the server keeps what the engine
  behind the channel takes. Up to 2.1.4 they were sent with `videoModel "next"` only, so a Gen8 default channel lost
  them without a word. Requires `2dai-cloud-sdk` 3.2.0. The tools still wait at most their own budget (45 s by
  default, `TWODAI_WAIT_BUDGET_MS`) and then return the `queueId` to collect with `check_generation`.
- `frameInterpolation` is gone from the `generate_video` schema: the Gen8 engines ignore it. Sessions that kept the
  old schema can still send it; it is dropped before the call.
- `videoModel` / `imageModel` keep `"default" | "next"`. `"next"` is the channel kept for the next engine.
- Errors relay the server's sentence: `VIDEO_MODEL_UNAVAILABLE` / `IMAGE_MODEL_UNAVAILABLE` (closed channel; the advice
  to "submit later" is gone), `INVALID_DURATION` (with the lengths the channel renders), `GENERATION_PAUSED` (503,
  short maintenance, nothing charged), `AUDIO_REF_NEXT_ONLY` (no longer advises `videoModel "next"`) and
  `TOO_MANY_REFS` (cap of the channel's engine).
- Generation replies add `aiModel` and, when the server sends it, `videoEngine` / `imageEngine`.
- `generate_video` and `generate_similar` state the clip length the server accepted (`duration`, when the submit
  answer carries it) and say so when it is shorter than the length asked or the source's: a re-run steps down to
  the longest length the tier and key allow instead of being refused.

get_account:

- Names the engine behind each channel from `modelLabels`, with what it takes (references, sound, ratio, audio), in
  the text and in `platform.engines`. `platform.model` is the label of the default channel; `platform.previews` is
  replaced by `platform.engines`; `platform.about` names the engine families the server reports.
- Says when `next` is closed, or serves the same engine as the default channel until it closes ("omit videoModel").
- `recommendation.image` / `recommendation.video` come from the presets: the platform's recommended preset when the
  tier opens it, else the best preset below it that is open (video: with the recommended unlocked length). The fixed
  "ultra at 5 seconds" advice is gone.
- Returns `modelLabels`, and names the key's own ceilings when it has a policy (`maxQuality`, `maxVideoQuality`,
  `maxVideoDurationSec`). `KEY_POLICY_QUALITY` / `KEY_POLICY_DURATION` errors quote the cap.

README and `skills/2dai/SKILL.md` rewritten for the Gen8 default channels: Gen8 preset ladder and tier tables,
exact lengths, sound and audio reference from Explorer, the film recipe on Gen8, `high` as the recommended video
preset; the Gen7 lengths, 18 / 36 fps, `frameInterpolation` and "Gen 7.2" are gone.

Server instructions: a CHANNELS paragraph (leave `next` unset unless get_account shows a distinct engine on it) and an
engine-neutral STACK paragraph that points to get_account.

Migration: reconnect the MCP in the host after the update (a running session keeps the old tool descriptions). Agents
that send `videoModel "next"` / `imageModel "next"` should drop it before 2026-11-17: after that day it answers
`VIDEO_MODEL_UNAVAILABLE` / `IMAGE_MODEL_UNAVAILABLE`, uncharged, until a new engine opens it.
