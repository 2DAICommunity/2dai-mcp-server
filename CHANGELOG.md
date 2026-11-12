# Changelog

## 2.3.2 (2026-11-12)

`organise_creation` says plainly which actions are reversible. The title and the description now say that every
action except `delete` can be undone: `trash` deletes nothing, works like a desktop Trash, and `restore` brings the
creation back until the trash retention empties it. `delete` is the only permanent action. The `action` parameter lists
the reversible actions and the permanent one. Some permission checks read the old wording as a permanent deletion and
refused a plain `trash`. No schema or behaviour change.

## 2.3.1 (2026-11-11)

The next channel closed on 2026-11-11 (server switch): `videoModel "next"` / `imageModel "next"` answer
`VIDEO_MODEL_UNAVAILABLE` / `IMAGE_MODEL_UNAVAILABLE`, uncharged, until a new engine opens them; get_account already
reports it as closed. The default channels keep the Gen8.1 engines. No schema change. Requires `2dai-cloud-sdk` 3.3.1.

- get_account no longer describes a Gen7 engine in `platform.engines`: an engine this release does not know shows its
  bare label.
- Tool descriptions without the Gen7 clauses: `generate_video` (`refCreationIds`, `aspectRatio`, `audioCreationId`) and
  `generate_image` (`refCreationIds`).
- README and `skills/2dai/SKILL.md`: `next` is described as closed since 2026-11-11.

Reconnect the MCP in the host after the update (a running session keeps the old tool descriptions).

## 2.3.0 (2026-11-08)

New aspect ratio `"9:19.5"`, phone full screen: a picture or a clip that fills a modern phone screen edge to edge in
portrait (iPhone since the X, Galaxy S). Requires `2dai-cloud-sdk` 3.3.0.

- `generate_image`, `generate_with_refs` and `generate_in_artistic_style` accept `aspectRatio: "9:19.5"`;
  `generate_video` accepts it in its own list.
- The ratio guide and the server instructions now send a phone wallpaper or lock screen to `"9:19.5"`; stories, Reels
  and TikTok stay `"9:16"`. The quality still decides the resolution, so the price does not change.

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
