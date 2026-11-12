---
name: 2dai
description: Generate images and video on a 2DAI account through the 2dai-mcp-server tools — pick the right preset, budget credit, keep a character consistent across shots, assemble a short film, and avoid the mistakes agents make on their first session.
---

# 2DAI for agents

2DAI is a generation platform (images, image-to-video, references, style transfer) with a cloud drive. You reach it
through the `2dai-mcp-server` tools (25 tools) with an API key. Every generation spends the account's USD credit;
every result lands in the account's cloud drive as a *creation* with a 32-char id.

## 1. Session start (always)

1. `get_account` — credit, tier, key scopes and spend cap (and the key's own ceilings, when it has a policy),
   **the presets this account may submit**, the video lengths with their tier locks, the best pick open to the
   account (`recommendation`) and **the engine behind each channel** with what it takes (`platform.engines`: `summary`,
   `maxRefCreationIds`, sound, aspect ratio). Never probe presets or lengths by submitting: a locked one is refused
   at submit (403) and wastes a round-trip.
2. Budget: write down credit and the key cap. Costs are charged at submit and refunded on failure.
3. `list_creations` if the account already holds references (brand masters, character sheets).

## 2. Quality ladder — one set of ids for every tool

| Preset | Image | Video | Use it for |
|---|---|---|---|
| `fast` | quickest render | 0.2 MP, quickest render with sound | drafts, layout and scenario tests |
| `normal` | standard resolution | 0.4 MP | social drafts, moodboards |
| `high` | higher resolution than Normal | **recommended for video** — 0.4 MP at 20 steps, cleaner motion and sound | everyday clips |
| **`max`** | **recommended for images** — best detail / price balance | 0.7 MP, sharper frames, longer render | everyday images |
| `ultra` | more steps and a model upscale, for prints | 0.7 MP at 20 steps, slower | prints, large crops |
| `ultimate` | highest resolution, for final masters | 1 MP at 20 steps, longest wait | final masters only |

Presets open by tier (`get_account` resolves them — read them there; this is the reference at the time of writing):

| Tier | Image | Video | Video lengths |
|---|---|---|---|
| Guest | `fast`, `normal` | — | — |
| Explorer | + `high` | `fast` | 1, 5 s |
| Holder | + `max` | + `normal` | + 8 s |
| Believer | + `ultra` | + `high` | + 10 s |
| Supporter | + `ultimate` | `fast`, `normal`, `high` | + 12 s |
| Founder | every preset | + `max`, `ultra`, `ultimate` | + 15, 17, 20 s |

`auto` (the default) picks within the tier: images `normal` (Guest), `high` (Explorer), from Holder a weighted draw
over `max` / `ultra` / `ultimate` among the presets the tier opens; video `high` when the tier opens it, else the best
of `normal` / `fast`, never `ultra` / `ultimate`. `get_account` → `recommendation` names the best pick open to the
account. Prefer an explicit preset once you know what the shot is for. Reference tools (`character-ref`,
`style-transfer`, `smart-edit`) and the artistic-style tool follow the image column, priced like an image plus a
surcharge per reference; `get_stats` shows the burn.

**Images** keep up to **6** `refCreationIds` natively, render legible text and honour long literal prompts — write
the scene plainly, not as keyword lists. Every reference adds a surcharge. `negativePrompt` is applied at every preset.

**Channels.** `generate_image` and `generate_video` run on the default channel. `next` (`imageModel` / `videoModel`)
is kept for the next engine: the next channel closed on 2026-11-11 and is refused (`*_MODEL_UNAVAILABLE`, uncharged)
until an engine opens it. Leave both unset unless `get_account` shows a distinct engine on `next`.

## 3. Video — the rules that matter

- **Lengths** are exact seconds: `get_account` → `videoDurations` lists the lengths the account may submit (tier
  lock resolved, 5 s recommended and the default); any other length — the retired 6 / 7 s included — is refused with
  `INVALID_DURATION`, uncharged. The clip renders at the length asked at 24 fps; `durationSeconds` is measured on the
  file, a fraction of a second longer. A 1 s clip carries almost no sound.
- **Sound and references**: clips come **with sound**, from a first frame plus up to 6 `refCreationIds`
  (characters, props, places — each adds a surcharge), with an optional `aspectRatio` (`auto` keeps the first
  frame's ratio). An optional audio reference: `upload_audio` an MP3 (5 min max, from Explorer, like video) and pass
  it as `audioCreationId` with `audioUse: "music"` (soundtrack / sound design) or `"voice"` (a voice sample the
  speaking character follows) — it counts as one more reference.
- **`high` at 5 s** is the recommended shot where the tier opens it; `ultimate` only for a final master you will not
  re-render.
- **Video styles and TIXI**: every video style except `raw` (and `auto`) runs TIXI on the prompt and cannot switch
  it off (the style guidance only exists through that rewrite). `style: "raw"` = your prompt verbatim; add
  `enhance: true` to have TIXI write the full brief (shots, pictures, sound) from a short idea, and start the
  prompt with `tixi ` for a thinking pass (the word is dropped from what TIXI reads).
- **Writing a `raw` clip** — the shape TIXI follows: the first frame is the opening
  shot (describe the scene as it is at 0 s, then the changes in the order they happen, never the ending up front);
  about one shot per 1.7–2 s (1 s = 1 shot, 5 s = 2–3, 8 s = 4, 10 s = 5, 12 s = 6, 15 s = 8, 17 s = 10, 20 s = 12,
  at least 1.5 s each, one continuous shot under 3 s); one camera idea and about one action and one reaction per
  shot; one job per reference (identity, wardrobe, product, place, style); each subject anchored by its face, hair,
  garments and their colours, and the colour of the light named — that keeps them steady from shot to shot; each
  sound next to the action that makes it, spoken lines in quotes with their language, music as instruments, tempo
  and dynamics; on-screen text only when asked, in quotes.
- A clip renders for minutes, a long one several minutes: `generate_video` usually returns a `queueId`; poll with
  `check_generation` — pass `queueIds` (up to 25) to poll a whole batch of shots in one call. `cancel_generation`
  refunds a still-waiting job. Never submit again to retry: it would be charged twice.
- **Price** — video is priced on render time, which grows faster than the length (8 s ≈ 1.7–2.2×, 10 s ≈ 2.2–3.4×,
  20 s ≈ 6–12× the 5 s price, higher presets at the top of each range), +5 % per reference after the first frame,
  the audio reference included. `auto` draws the preset, so two "identical" calls can cost differently — pin the
  preset; every submit returns the resolved `quality` next to `costUsd`.
- The input is a still creation: an earlier generation, an `upload_image`, or a row from `list_creations`; an
  audio reference is an `upload_audio` row (`mediaKind: "audio"` in listings).

## 4. Prompts

- Prompt length follows the account's tier: **1,500 characters as a Guest, 8,000 at Supporter, 20,000 at Founder** — read the exact cap from `get_account` → `promptMaxChars` (and `promptMaxCharsNext` for the tier that raises it) and write to fit; a longer `prompt` is refused with `PROMPT_TOO_LONG` before any charge, a longer `negativePrompt` is truncated to the cap.
- Listing rows shorten `prompt` and `description` (ellipsis + `promptTruncated` flag); `get_creation` returns the
  full text — use it to re-read a prompt before replaying it with a variant.
- Every referenced creation is checked at submit: an id that is unknown, in the trash, deleted, or not visible to
  the account is refused with `CREATION_NOT_FOUND` and the ids, before any charge — restore or replace it.
- TIXI (the platform's prompt enhancer) is **off by default** on `generate_image`: your prompt reaches the model
  verbatim (plus the style's own lead-in). Pass `enhance: true` for scenes with several elements or
  interactions — TIXI restructures the brief (subject and action, positions relative to objects and enclosures,
  secondary elements, setting, style) and removes most scene-logic errors. Either way keep the brief concrete:
  subject, action, framing, light, palette, mood. Put hard constraints (text to render, exact colours,
  "no lettering") first. `character-ref`, wallpaper resize and the artistic-style tool always run TIXI.
- Text inside images renders legibly; spell it in quotes, keep numbers and lettering short and check them on the result.
- **Shape = `aspectRatio`, always passed.** The prompt never sets the shape and the default is a square `1:1`.
  Phone wallpaper, story, Reels, TikTok = `9:16`; tablet upright or poster = `3:4`; book cover or character sheet =
  `2:3`; photo print or X post = `3:2`; tablet sideways or classic monitor = `4:3`; desktop or laptop wallpaper,
  YouTube cover = `16:9`. "Widescreen" alone is landscape `16:9`; a phone is `9:16`. For a device set (iPhone +
  iPad + MacBook), one picture per device in its own ratio. A phone result must come back with `height > width`.

## 5. Recipe — a short film from a brief

1. **Character sheet**: 2–3 `generate_with_refs` (`character-ref`) images at the best image preset the tier opens
   (`ultimate` where it can) from the brief, with a plain background and consistent lighting. Keep the best as the
   master reference; do not mix rejected takes into it.
2. **Opening frames**: one still per clip with `character-ref` pointing at the master, iterated at `max` (or the
   best preset open), the keeper at the top preset. Same lens, same palette words in every prompt.
3. **Clips**: `generate_video` on each opening frame with the master (and the props or places that recur) as
   `refCreationIds`, the preset from `recommendation.video`, 5–10 s per clip, a scenario that follows the shot rule
   of § 3. The sound comes with the clip; one MP3 as audio reference keeps a soundtrack across clips.
4. **Review** each clip for identity drift; re-render a clip rather than extending it.
5. **Finish**: `download_creation` for the masters, then cut locally (ffmpeg).

Budget: price one clip first (`costUsd` on the reply), then multiply by the clip count; check `get_account` before
the loop.

## 6. Recipe — brand-consistent visuals

- Lock the look with `generate_in_artistic_style` (curated styles, `list_artistic_styles`) or `style-transfer`
  against one approved master image.
- Generate variations at `max`, promote the keeper to `ultimate`, file everything with `manage_folder` and
  `organise_creation`, publish with `publish_creation` only when the account owner asked for it.
- Compose from references: generate (or `upload_image`) the product, the model, the place and the logo as separate
  stills, then one `generate_image` with all of them as `refCreationIds` (up to 6) — describe each reference by what
  it shows, never by its position ("the woman with short silver hair wears the matte black headphones at the rooftop
  café"; never "the second reference") and spell any on-image text in quotes; it renders legibly.

## 7. Content rating — a flagged result is not an error

- Every output is rated by the platform's classifier: `nsfwLabel` SFW / Suggestive / Near-nude / Adult NSFW /
  Prohibited, `nsfwRate` 0..1. Suggestive (0.6) changes nothing.
- From Near-nude (0.8) up the reply carries `contentRestricted: true`: the creation **succeeded and was charged**,
  it is stored in the owner's drive but **masked** there until they reveal it, it **cannot be published**, and the
  vision caption is withheld from generation replies (`get_creation` returns it). Say so plainly and hand over the
  `viewUrl` for review — do not retry, do not call it a failure.
- A prompt the platform judges explicit makes the result explicit by design, even when the picture looks tame:
  the rating follows the request as much as the pixels.
- The only rejection is the platform ceiling (`NSFW_MAX_EXCEEDED` → readable `errorMessage`): the output is
  discarded, nothing is charged, and a reworded prompt is the way forward.

## 8. Do not

- Probe presets or durations by submitting — read them from `get_account`.
- Pass more than 6 `refCreationIds`, or `imageModel` / `videoModel: "next"` while `get_account` shows it closed —
  both are refused uncharged (`TOO_MANY_REFS`, `*_MODEL_UNAVAILABLE`), but they waste a round-trip.
- Request a clip length `get_account` does not list (6 / 7 s are retired).
- Use `4:3` or `3:2` for a phone picture (both are landscape), or `generate_wallpaper` for a phone wallpaper — its
  `standard` / `photo` / `widescreen` / `ultrawide` dimensions are landscape monitor formats.
- Generate finals at `ultimate` while iterating; iterate at `max` (images) or `fast` at 1 or 5 s (video tests).
- Assume every image costs the `fast` price ($0.06 today): reference tools at `ultra` / `ultimate` cost several times more.
- Store the API key anywhere but the MCP env; the key is what spends the credit.
