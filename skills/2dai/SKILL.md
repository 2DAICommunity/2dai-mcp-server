---
name: 2dai
description: Generate images and video on a 2DAI account through the 2dai-mcp-server tools — pick the right preset, budget credit, keep a character consistent across shots, assemble a short film, and avoid the mistakes agents make on their first session.
---

# 2DAI for agents

2DAI is a generation platform (images, image-to-video, references, style transfer) with a cloud drive. You reach it
through the `2dai-mcp-server` tools (24 tools) with an API key. Every generation spends the account's USD credit;
every result lands in the account's cloud drive as a *creation* with a 32-char id.

## 1. Session start (always)

1. `get_account` — credit, tier, key scopes and spend cap, **the presets this account may submit**, the video
   durations with their tier locks, and the recommended presets. Never probe presets by submitting: a locked preset
   is refused at submit (403 `QUALITY_NOT_ALLOWED_FOR_TIER`) and wastes a round-trip.
2. Budget: write down credit and the key cap. Costs are charged at submit and refunded on failure.
3. `list_creations` if the account already holds references (brand masters, character sheets).

## 2. Quality ladder — one ladder for every tool

| Preset | Image | Video (per 5 s clip) | Use it for |
|---|---|---|---|
| `fast` | lowest res, fastest | 320p | drafts, layout tests |
| `normal` | standard | 480p | social drafts, moodboards |
| `high` | more steps, looser read of the prompt | 620p | variety when Max feels too literal |
| **`max`** | **recommended for images** — best detail / price balance | 720p | everyday images |
| `ultra` | higher res, slower, tier-gated | **recommended for video** — 800p, best coherence for the price | prints, large crops; every video shot |
| `ultimate` | highest resolution, slowest, tier-gated | 1080p, longest wait, tier-gated | final masters only |

`auto` (the default) lets the server pick by tier, weighted towards `max`; for video it draws `max` / `ultra` only and
never `ultimate` (that preset needs dedicated render capacity that is not always available — ask for it explicitly). Prefer an explicit
preset once you know what the shot is for. Reference tools (`face-ref`, `character-ref`, `style-transfer`, `smart-edit`) run on the same
ladder and cost more per preset than a plain image; `get_stats` shows the burn.

## 3. Video — the rules that matter

- **Durations** 5 / 6.5 / 7.5 s (7.5 is tier-gated) render shorter than their nominal value: 5 → ~4.3 s,
  6.5 → ~5.8 s, 7.5 → ~6.7 s at 18 fps (the model's native cadence). **Use 5 s.** Subject identity holds for
  roughly the first 2.5–3.5 s of a clip (the head melts, the figure leaves the frame, a set dissolves after that):
  write the cut at ~3 s, one action per shot, several 5-second shots rather than one long take.
- **Colour drift** under coloured light (a lavender still turning mint-green in motion) is limited by naming the
  light colour and the subject's colours in the motion prompt; there is no dedicated lever.
- **`ultra` at 5 s** is the recommended shot. `ultimate` only for a final master you will not re-render.
- **Frame rate** is 18 fps natively. `frameInterpolation: true` doubles it (36 fps) for twice the price — apply it on
  the shots you keep, not on tests.
- A video takes 1–3 minutes: `generate_video` usually returns a `queueId`; poll with `check_generation` —
  pass `queueIds` (up to 25) to poll a whole batch of shots in one call. `cancel_generation` refunds a
  still-waiting job.
- **Price** = tool base × preset × duration multiplier (1 / 1.3 / 1.5) × 2 with `frameInterpolation`. `auto`
  draws the preset, so two "identical" calls can cost differently — pin the preset; every submit returns the
  resolved `quality` next to `costUsd`.
- The input is a still creation: an earlier generation, an `upload_image`, or a row from `list_creations`.

## 4. Prompts

- Up to **2,500 characters** for `prompt` and `negativePrompt`.
- Listing rows shorten `prompt` and `description` (ellipsis + `promptTruncated` flag); `get_creation` returns the
  full text — use it to re-read a prompt before replaying it with a variant.
- Every referenced creation is checked at submit: an unknown id is refused with `CREATION_NOT_FOUND` and the
  missing ids, before any charge.
- TIXI (the platform's prompt enhancer) is **off by default** on `generate_image`: your prompt reaches the model
  verbatim (plus the style's own lead-in). Pass `enhance: true` for scenes with several elements or
  interactions — TIXI restructures the brief (subject and action, positions relative to objects and enclosures,
  secondary elements, setting, style) and removes most scene-logic errors. Either way keep the brief concrete:
  subject, action, framing, light, palette, mood. Put hard constraints (text to render, exact colours,
  "no lettering") first. Reference tools (`face-ref`, `character-ref`) and wallpaper resize always run TIXI.
- Text inside images is unreliable at every preset; keep numbers and lettering short and check them on the result.

## 5. Recipe — a short film from a brief

1. **Character sheet**: 2–3 `generate_with_refs` (`character-ref`) images at `ultimate` from the brief, with a plain
   background and consistent lighting. Keep the best as the master reference; do not mix rejected takes into it.
2. **Keyframes**: one still per shot with `character-ref` pointing at the master, at `max` (iterate) then `ultimate`
   for the keeper. Same lens, same palette words in every prompt.
3. **Shots**: `generate_video` on each keyframe, `ultra`, `duration: 5`, a motion prompt that names the camera move
   and one action. Order shots from wide to close.
4. **Review** each clip frame by frame for identity drift; re-render a shot rather than extending it.
5. **Finish**: `frameInterpolation` on the kept shots if the delivery needs 24 fps or more, `download_creation`
   for the masters, then cut locally (ffmpeg). Audio and dialogue are not generated yet.

Budget rule of thumb for an 8-shot film at `ultra` 5 s with `max` keyframes: about the price of ten plain images
per shot. Check `get_account` before the shot loop.

## 6. Recipe — brand-consistent visuals

- Lock the look with `generate_in_artistic_style` (curated styles, `list_artistic_styles`) or `style-transfer`
  against one approved master image.
- Generate variations at `max`, promote the keeper to `ultimate`, file everything with `manage_folder` and
  `organise_creation`, publish with `publish_creation` only when the account owner asked for it.

## 7. Do not

- Probe presets or durations by submitting — read them from `get_account`.
- Request 6.5 / 7.5 s clips for character shots.
- Generate finals at `ultimate` while iterating; iterate at `max` (images) or `normal` (video tests).
- Assume $0.03 per image: that is the `fast` preset. Reference tools at `ultra` / `ultimate` cost several times more.
- Store the API key anywhere but the MCP env; the key is what spends the credit.
