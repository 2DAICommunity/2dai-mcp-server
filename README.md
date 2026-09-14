# 2dai-mcp-server

[![npm](https://img.shields.io/npm/v/2dai-mcp-server)](https://www.npmjs.com/package/2dai-mcp-server)

MCP server for [2DAI](https://2dai.io) — lets Claude, Cursor, Cline, Windsurf and any other
MCP host generate images and video, upload references, browse the public feed, and organise
your cloud drive **on your own 2DAI account**.

- Runs locally over stdio via `npx` — nothing to install permanently.
- Authenticates with a 2DAI API key (create one at **2dai.io → Dashboard → Integrations → API keys**).
- Finished images come back as inline previews so the model can see what it made and iterate.

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
tools and the exact same behavior. Pick whichever fits: `npx` when you want
zero third-party dependency and full control of the process, hosted when you
want zero install and a single URL.

## Tools

| Tool | What it does | Scope | Spends credit |
|---|---|---|---|
| `get_account` | Account status: credit, tier, key label/scopes/spend cap | read | no |
| `generate_image` | Text-to-image (style/quality default to auto; `enhance: true` runs the TIXI prompt enhancer, off by default) | generate | **yes** |
| `generate_with_refs` | Image from references: `face-ref`, `character-ref`, `style-transfer`, `smart-edit` (edit refs[0] per the prompt) | generate | **yes** |
| `generate_video` | Animate a still creation into a short clip | generate | **yes** |
| `generate_similar` | Re-run an existing creation ("more like this one") | generate | **yes** |
| `generate_in_artistic_style` | Artist Painter: paint the prompt (and up to 3 subject refs) as a new work in a curated artistic style (`artisticStyleId` from `list_artistic_styles`, or `auto`) | generate | **yes** |
| `generate_wallpaper` | Expand a creation into a wallpaper dimension (`standard`, `photo`, `widescreen`, `ultrawide`); quality fixed at Ultra, price follows the dimension | generate | **yes** |
| `check_generation` | Poll a queued generation by queueId | read | no |
| `cancel_generation` | Cancel a still-waiting generation (charge refunded); explains itself when it is too late | generate | no |
| `upload_image` | Upload a local image / base64 as a reference | generate | no |
| `download_creation` | Save the full-resolution asset to disk, or return an inline preview | read | no |
| `get_creation` | Fetch one creation row by id — same slim shape as `list_creations` rows. Opt-in path for the vision-derived caption when a generation reply gates it (NSFW ≥ Near-nude) | read | no |
| `list_creations` | Page, search, sort and filter the library (folders, folder groups, trash, activity lenses, smart collections, shared folders, random pick). Rows include `nsfwFlagged`/`nsfwRate` so agents can apply their own safeguards | read | no |
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
| `TWODAI_ALLOW_ANY_PATH` | `0` | Allow file reads/writes outside the working directory |
| `TWODAI_API_BASE` | production API | API origin override (for self-hosted testing) |

## Notes for agents

- **Presets.** Image: `max` is the recommended everyday pick (best balance of detail and price); `ultimate` is the
  highest resolution for final masters; `fast` / `normal` are for drafts. Video: `ultra` at **5 seconds** is the
  recommended shot (best coherence for the price); `ultimate` is 1080p with the longest wait. `ultra` and
  `ultimate` are tier-gated — `get_account` lists what the connected account may submit, so never probe presets.
- **Shots, not long takes.** Rendered length is shorter than the nominal value (5 → ~4.3 s, 6.5 → ~5.8 s,
  7.5 → ~6.7 s at 18 fps native; `frameInterpolation: true` doubles it to 36 fps for twice the price). Subject
  identity holds for roughly the first 2.5–3.5 s: write the cut at ~3 s, one action per shot, several 5-second
  shots rather than one long take.
- **Price** = tool base × preset × duration multiplier (1 / 1.3 / 1.5) × 2 with interpolation. `auto` draws the
  preset (video: `max` / `ultra` only, never `ultimate`), so pin it for a predictable cost; every submit returns the
  resolved `quality` next to `costUsd`.
- **Batches.** `check_generation` takes `queueIds` (up to 25) to poll a whole batch of shots in one call.
- **Prompts are never cut silently.** Listing rows shorten `prompt` / `description` with an ellipsis and a
  `promptTruncated` flag; `get_creation` returns the full text, so a prompt can be re-read and replayed.
- **References are checked at submit.** An unknown `inputCreationId` / `refCreationIds` is refused with
  `CREATION_NOT_FOUND` and the missing ids, before any charge.
- **Prompts** can be up to 2,500 characters (`prompt` and `negativePrompt`). TIXI enhancement is on by default and
  rewrites the prompt; pass `enhanced: false`-style options only where a tool exposes them.
- **Costs** are charged at submit against the account's USD credit and refunded on failure; `get_account`
  shows the headroom, `get_stats` the 30 / 90-day burn.
- **Skill.** The package ships `skills/2dai/SKILL.md` — a platform guide for agents (quality ladder, costs,
  the film recipe, brand-consistency recipe, limits). Point your agent runtime at it, or read it once per session.

## The 2DAI stack

We currently use our **Gen 7.2** model, and unlike others, we don't resell model
access. All our models originate from the open-source community or our own R&D
— we then disassemble, modify, fine-tune and optimize them to align with our
legacy and **2DAI❤️ART** lines. They also run on our own private cloud network.

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
