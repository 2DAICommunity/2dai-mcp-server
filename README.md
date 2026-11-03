# 2dai-mcp-server

[![npm](https://img.shields.io/npm/v/2dai-mcp-server)](https://www.npmjs.com/package/2dai-mcp-server)

MCP server for [2DAI](https://2dai.io) — lets Claude, Cursor, Cline, Windsurf and any other
MCP host generate images and video, upload references, browse the public feed, and organise
your cloud drive **on your own 2DAI account**.

- Runs locally over stdio via `npx` — nothing to install permanently.
- Authenticates with a 2DAI API key (create one at **2dai.io → Dashboard → Integrations → API keys**).
- Finished images come back as inline previews so the model can see what it made and iterate.

## New in 2.2 — Gen8 on the default channels

`generate_image` and `generate_video` run the Gen8 engines on their default channel; `get_account` names the engine
behind each channel and what it takes (`platform.engines`, today **Gen8.1**):

- **Images**: up to **6** `refCreationIds` kept natively, legible text in the picture, long literal prompts honoured.
- **Video**: clips **with sound**, from a first frame plus up to 6 `refCreationIds` (characters, props and places kept
  consistent), an optional `aspectRatio` and an optional **audio reference** (`upload_audio` an MP3, then pass its id
  as `audioCreationId`, `audioUse: "music"` for a soundtrack or `"voice"` for a voice sample). Lengths are exact
  seconds — 1, 5, 8, 10, 12, 15, 17 or 20, opened by tier; video opens at Explorer.
- Presets and lengths depend on the tier: `get_account` lists what the account may submit and the best pick open to
  it (`recommendation`), so read it instead of probing.

`next` (`imageModel` / `videoModel`) is kept for the next engine. Until <date> it serves the same engine as the
default channel; after that it answers `VIDEO_MODEL_UNAVAILABLE` / `IMAGE_MODEL_UNAVAILABLE`, uncharged, until an
engine opens it. Leave both parameters unset, and reconnect the server in your host after updating (a running session
keeps the old tool descriptions).

## New in 2.0 — reference tools on the Gen8 image engine

`generate_with_refs` and `generate_in_artistic_style` now render on the Gen8 image engine, which reads every
reference natively: `character-ref` takes 1–6 shots of one character (face photos lock the exact same face, the
prompt drives outfit, pose and scene), `style-transfer` 1–6 style sources, `smart-edit` the image to edit plus up to
5 support refs, the artistic style up to 6 subject images. The former `face-ref` tool was merged into
`character-ref` and is refused with `INVALID_TOOL`. Same preset ids and tier gates; prices follow the Gen8 image
ladder plus a surcharge per reference (the ticket's `costUsd` is the truth).

## Quick start

**Claude Code**

```bash
claude mcp add 2dai --env TWODAI_API_KEY=2dai_sk_... -- npx -y 2dai-mcp-server
```

**Claude Desktop / Cursor / Cline / Windsurf** (JSON config)

```json
{
  "mcpServers": {
    "2dai": {
      "command": "npx",
      "args": ["-y", "2dai-mcp-server"],
      "env": { "TWODAI_API_KEY": "2dai_sk_..." }
    }
  }
}
```

The key is read from the environment only — never pass it as a tool argument.

## Hosted alternative — `mcp.2dai.io:800`

Every host that speaks **remote MCP (Streamable HTTP)** can point at our hosted
server instead of running `npx` locally. No install, no Node runtime, no
process lifecycle — just a URL and a Bearer key.

**Endpoint** — `https://mcp.2dai.io:800/mcp`

**Auth** — `Authorization: Bearer 2dai_sk_...` on every request (same key you'd
put in `TWODAI_API_KEY` for the stdio flow).

**Claude Desktop / Cursor / Cline / Windsurf** (remote-MCP JSON shape — check
your host's docs, some hosts still spell the type `"remote"`):

```json
{
  "mcpServers": {
    "2dai": {
      "type": "streamable-http",
      "url": "https://mcp.2dai.io:800/mcp",
      "headers": { "Authorization": "Bearer 2dai_sk_..." }
    }
  }
}
```

**Claude Code**

```bash
claude mcp add --transport http 2dai https://mcp.2dai.io:800/mcp \
  --header "Authorization: Bearer 2dai_sk_..."
```

Both transports (stdio via `npx` and hosted via HTTP) expose the exact same
tools. Pick whichever fits: `npx` when you want zero third-party dependency and
full control of the process, hosted when you want zero install and a single URL.

**No filesystem on the hosted server.** The process runs in our container, so a
`savePath` would write to *our* disk and an upload `path` would read from it —
both are refused with a clear message (`TWODAI_FILE_ACCESS=none` is the hosted
default). Instead, `download_creation` returns an inline preview (images) plus
`downloadUrl`, the full-resolution file on the API: GET it with the same
`Authorization: Bearer` header you send to the server (public creations need
none). `upload_image` / `upload_audio` take `base64`. `GET /health` reports
`fileAccess: "none"`.

## Tools

| Tool | What it does | Scope | Spends credit |
|---|---|---|---|
| `get_account` | Account status: credit, tier, key label/scopes/spend cap | read | no |
| `generate_image` | Text-to-image (style/quality default to auto; `enhance: true` runs the TIXI prompt enhancer, off by default); up to 6 `refCreationIds` kept natively, legible text; `aspectRatio` sets the shape (phone = `9:16`, desktop = `16:9`, default `1:1`) | generate | **yes** |
| `generate_with_refs` | Image from references on the Gen8 image engine: `character-ref` (1–6 shots of one character, face photos lock the face), `style-transfer` (1–6 style sources), `smart-edit` (edit refs[0] per the prompt, up to 5 support refs) | generate | **yes** |
| `generate_video` | Animate a still creation into a short clip with sound (first frame + up to 6 references, optional ratio, optionally scored by an `upload_audio` reference); `enhance: true` lets TIXI write the brief on a `raw` style — every other style already runs TIXI | generate | **yes** |
| `generate_similar` | Re-run an existing creation ("more like this one") | generate | **yes** |
| `generate_in_artistic_style` | Artist Painter: paint the prompt (and up to 6 subject refs) as a new work in a curated artistic style (`artisticStyleId` from `list_artistic_styles`, or `auto`) | generate | **yes** |
| `generate_wallpaper` | Expand a creation into a landscape wallpaper dimension (`standard` 4:3, `photo` 3:2, `widescreen` 16:9, `ultrawide` 21:9; a phone wallpaper is a `9:16` `generate_image`); own engine, quality fixed at Ultra, price follows the dimension | generate | **yes** |
| `check_generation` | Poll a queued generation by queueId | read | no |
| `cancel_generation` | Cancel a still-waiting generation (charge refunded); explains itself when it is too late | generate | no |
| `upload_image` | Upload a local image / base64 as a reference (hosted: base64 only) | generate | no |
| `upload_audio` | Upload a local MP3 / base64 as the audio reference of a video clip (`audioCreationId` + `audioUse` on `generate_video`) | generate | no |
| `download_creation` | Save the full-resolution asset to disk, or return an inline preview (hosted: inline preview + `downloadUrl`) | read | no |
| `get_creation` | Fetch one creation row by id — same slim shape as `list_creations` rows. Opt-in path for the vision-derived caption when a generation reply gates it (NSFW ≥ Near-nude) | read | no |
| `list_creations` | Page, search, sort and filter the library (folders, folder groups, trash, activity lenses, smart collections, shared folders, random pick; likes, type, aspect ratio, dates, NSFW block). Rows include `nsfwFlagged`/`nsfwRate` so agents can apply their own safeguards | read | no |
| `browse_feed` | Page through the public feed (other creators' published work) | read | no |
| `list_folders` | Page through the account's folders | read | no |
| `list_artistic_styles` | The curated artistic styles available to `generate_in_artistic_style` | read | no |
| `manage_folder` | Folder CRUD + favorites, poster, and sidebar groups (create/rename/delete/move-to-group/list-groups) | manage | no |
| `organise_creation` | Move / trash / restore / like / unlike one creation; `batch-trash` / `batch-restore` up to 100; permanent delete stays one-at-a-time | manage | no |
| `publish_creation` | Publish / unpublish a creation on the public feed | publish | no |
| `get_stats` | One consolidated stats read: counters, streak, storage, 30/90-day generation volume + spend, top refs/styles/keywords | read | no |
| `get_wallet_status` | $2DAI balance, USD credit, effective tier + the four signals it derives from | finance | no |
| `get_lock` | Staking-lock status (none / active / expiring-soon) | finance | no |
| `get_wallet_history` | Transactions, balance chart, credit chart, or credit sources | finance | no |
| `get_token_price` | Cached $2DAI/USD quote with its staleness | read | no |

All wallet tools are **read-only** — no tool on this server can move money. The `finance`
scope is opt-in and never part of a key's defaults; enable it in the dashboard's key settings
when you want an agent to see wallet data.

## Least privilege

Scopes are set per key in the dashboard. A coding agent that only generates needs
`read + generate`; add `manage` for drive organisation, `publish` only if you want it
posting to the public feed, and `finance` only for wallet reads. You can also set a
per-key spend cap — the server reports actionable errors when a cap or scope blocks a call.

## Configuration (env)

| Variable | Default | Meaning |
|---|---|---|
| `TWODAI_API_KEY` | — (required) | Your 2DAI API key |
| `TWODAI_PREVIEWS` | `1` | Attach downscaled inline previews to finished generations |
| `TWODAI_PREVIEW_MAX_SIDE` | `512` | Longest edge of those previews, in px |
| `TWODAI_WAIT_BUDGET_MS` | `45000` | How long a generation call blocks before degrading to a queueId |
| `TWODAI_IDEMPOTENCY_WINDOW_MS` | `30000` | Window in which an identical re-submit is treated as a retry, not a new charge |
| `TWODAI_FILE_ACCESS` | `cwd` | What `path` / `savePath` may touch: `cwd` (confined to the working directory), `any` (no boundary), `none` (no filesystem — the hosted default; `any` is refused there). `TWODAI_ALLOW_ANY_PATH=1` still means `any` |
| `TWODAI_API_BASE` | production API | API origin override (for self-hosted testing) |
| `TWODAI_PUBLIC_API_BASE` | production API | Origin `downloadUrl` is built on (hosted / `none` mode) — the API address the caller can reach, not a private one |

## Notes for agents

- **Presets.** Image: `max` is the recommended everyday pick (best balance of detail and price); `ultimate` is the
  highest resolution for final masters; `fast` / `normal` are for drafts. Video: `high` at **5 seconds** is the
  recommended shot; `ultimate` is the highest resolution with the longest wait. Every preset above `normal` (image)
  or `fast` (video) is tier-gated — `get_account` lists what the connected account may submit and the best pick open
  to it (`recommendation`), so never probe presets.
- **Channels and engines.** `get_account` names the engine behind each image and video channel and what it takes
  (`platform.engines`); `next` (`imageModel` / `videoModel`) is the channel kept for the next engine — leave it unset
  unless `get_account` shows a distinct engine there. A closed channel is refused, uncharged.
- **Lengths.** A clip runs at the length asked, in exact seconds: `get_account` lists the lengths the account may
  submit (`videoDurations`, tier lock resolved); any other length is refused with `INVALID_DURATION`, uncharged.
- **Images** keep up to 6 `refCreationIds`
  natively, renders legible text and honours long literal prompts — describe the scene
  plainly rather than in keyword lists. Same quality ids, priced on render time, and every reference adds a
  surcharge. `get_account` reports the presets open to the account (`qualities`, `canUseImageNext` for the `next`
  channel); a submit below a gate is refused with the tier that opens it, uncharged.
- **Video** renders clips **with sound** at 24 fps from a first frame plus
  up to 6 `refCreationIds` (each adds a surcharge), with an optional `aspectRatio` (`auto` keeps the first frame's
  ratio) and an optional audio reference — an MP3 from `upload_audio` as `audioCreationId`, `audioUse: "music"`
  (soundtrack / sound design) or `"voice"` (a voice sample the speaking character follows); it counts as one more
  reference. Lengths and presets depend on the account: `get_account` lists what it may submit. Long clips render for several minutes:
  expect a `queueId` and collect it with `check_generation`.
- **Shots.** With `style: "raw"`, write the clip the way TIXI does: the first frame is
  the opening shot (describe it as it is at 0 s, then the changes in order), about one shot per 1.7–2 s (5 s = 2–3,
  8 s = 4, 10 s = 5, 20 s = 12; under 3 s one continuous shot), one camera idea and about one action per shot, each
  subject anchored by its face, hair, garments and colours, and each sound written next to the action that makes it.
- **Video styles and TIXI.** Every video style except `raw` (and `auto`) runs TIXI on the prompt: the style's
  guidance only exists through that rewrite, so it cannot be switched off. `style: "raw"` sends the prompt verbatim —
  pass `enhance: true` to have TIXI write the clip's brief (shots, pictures and, on an engine with sound, the
  sound) from a short idea; a prompt starting with `tixi ` adds a thinking pass (the word is dropped from what TIXI
  reads). No extra credit either way.
- **Price** — video is priced on render time, which grows faster than the length (8 s ≈ 1.7–2.2×, 10 s ≈ 2.2–3.4×,
  20 s ≈ 6–12× the 5 s price, higher presets at the top of each range), +5 % per reference after
  the first frame, the audio reference included. `auto` draws the
  preset within the account's tier, so pin it for a predictable cost; every submit returns the
  resolved `quality` next to `costUsd`.
- **Batches.** `check_generation` takes `queueIds` (up to 25) to poll a whole batch of shots in one call.
- **Prompts are never cut silently.** Listing rows shorten `prompt` / `description` with an ellipsis and a
  `promptTruncated` flag; `get_creation` returns the full text, so a prompt can be re-read and replayed.
- **References are checked at submit.** An `inputCreationId` / `refCreationIds` entry that is unknown, in the
  trash, deleted, or not visible to the account is refused with `CREATION_NOT_FOUND` and the ids, before any
  charge (restore it with `organise_creation`, or drop it).
- **Prompts** are capped per account tier (1,500 characters as a Guest, 8,000 at Supporter, 20,000 at Founder): `get_account` reports the exact cap as `promptMaxChars` and the tier that raises it as `promptMaxCharsNext`; a longer `prompt` is refused with `PROMPT_TOO_LONG` before any charge, a longer `negativePrompt` is truncated to the cap.
  TIXI enhancement is off by default on `generate_image` (`enhance: true` rewrites a short brief into a full prompt);
  `character-ref`, wallpaper resize and the artistic-style tool always run it.
- **Costs** are charged at submit against the account's USD credit and refunded on failure; `get_account`
  shows the headroom, `get_stats` the 30 / 90-day burn.
- **Content rating is not an error.** Every output carries `nsfwLabel` / `nsfwRate`. From Near-nude (0.8) the
  reply adds `contentRestricted: true`: the generation succeeded and was charged, the creation is kept but masked
  in the owner's drive, cannot be published, and its caption is withheld (`get_creation` returns it). Hand over
  the `viewUrl` for review instead of retrying. Only `NSFW_MAX_EXCEEDED` discards an output, uncharged.
- **Skill.** The package ships `skills/2dai/SKILL.md` — a platform guide for agents (quality ladder, costs,
  the film recipe, brand-consistency recipe, limits). Point your agent runtime at it, or read it once per session.

## The 2DAI stack

2DAI runs its own models, and unlike others, we don't resell model access. All our
models originate from the open-source community or our own R&D — we then
disassemble, modify, fine-tune and optimize them to align with our legacy and
**2DAI❤️ART** lines. They also run on our own private cloud network.

`get_account` names the engine behind each channel (`platform.engines`, `modelLabels`); the `next` channels are
kept for the next engine.

Every tool response carries the model version and stack summary (via
`get_account.platform`), so an agent can hand these facts back to a user who
asks "what powers you?" without extra plumbing.

## License

MIT

## Community & links

- **Website** — [www.2dai.io](https://www.2dai.io)
- **X** — [@2DAICommunity](https://x.com/2DAICommunity)
- **Telegram** — [t.me/Token2dAI](https://t.me/Token2dAI)
- **$2DAI on Base** — [chart on Dexscreener](https://dexscreener.com/base/0x2b5963f06eb366ecd7c669efde258860cc9b90d4) · stake for tiers & daily credit airdrops
- **SDK** — [2dai-cloud-sdk](https://www.npmjs.com/package/2dai-cloud-sdk) for scripts, servers and apps
- **GitHub** — [2DAICommunity](https://github.com/2DAICommunity)
