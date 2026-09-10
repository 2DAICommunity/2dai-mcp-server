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

`auto` (the default) lets the server pick by tier, weighted towards `max`. Prefer an explicit preset once you know
what the shot is for. Reference tools (`face-ref`, `character-ref`, `style-transfer`, `smart-edit`) run on the same
ladder and cost more per preset than a plain image; `get_stats` shows the burn.

## 3. Video — the rules that matter

- **Durations** 5 / 6.5 / 7.5 s (7.5 is tier-gated). **Use 5 s.** Subjects stay coherent for roughly the first
  3–4 seconds of a clip; a 5 s request renders about 4.3 s at 18 fps. Prefer several 5-second shots over one long
  take and cut them together.
- **`ultra` at 5 s** is the recommended shot. `ultimate` only for a final master you will not re-render.
- **Frame rate** is 18 fps natively. `frameInterpolation: true` doubles it (36 fps) for twice the price — apply it on
  the shots you keep, not on tests.
- A video takes 1–3 minutes: `generate_video` usually returns a `queueId`; poll with `check_generation`.
  `cancel_generation` refunds a still-waiting job.
- The input is a still creation: an earlier generation, an `upload_image`, or a row from `list_creations`.

## 4. Prompts

- Up to **2,500 characters** for `prompt` and `negativePrompt`.
- TIXI (the platform's prompt enhancer) rewrites prompts by default. Keep the brief concrete: subject, action,
  framing, lens, light, palette, mood. Put hard constraints (text to render, exact colours, "no lettering") first.
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
