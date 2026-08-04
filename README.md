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

## Tools

| Tool | What it does | Scope | Spends credit |
|---|---|---|---|
| `get_account` | Account status: credit, tier, key label/scopes/spend cap | read | no |
| `generate_image` | Text-to-image (style/quality default to auto) | generate | **yes** |
| `generate_with_refs` | Image from references: `face-ref`, `character-ref`, `style-transfer`, `smart-edit` (edit refs[0] per the prompt) | generate | **yes** |
| `generate_video` | Animate a still creation into a short clip | generate | **yes** |
| `generate_similar` | Re-run an existing creation ("more like this one") | generate | **yes** |
| `generate_wallpaper` | Expand a creation into a wallpaper dimension (`standard`, `photo`, `widescreen`, `ultrawide`); quality fixed at Ultra, price follows the dimension | generate | **yes** |
| `check_generation` | Poll a queued generation by queueId | read | no |
| `cancel_generation` | Cancel a still-waiting generation (charge refunded); explains itself when it is too late | generate | no |
| `upload_image` | Upload a local image / base64 as a reference | generate | no |
| `download_creation` | Save the full-resolution asset to disk, or return an inline preview | read | no |
| `list_creations` | Page, search, sort and filter the library (folders, trash, activity lenses, smart collections, shared folders, random pick). Rows include `nsfwFlagged`/`nsfwRate` so agents can apply their own safeguards | read | no |
| `browse_feed` | Page through the public feed (other creators' published work) | read | no |
| `list_folders` | Page through the account's folders | read | no |
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

- Generation **spends real credit**. Check `get_account` first when unsure, and never
  generate speculatively.
- Long generations return a `queueId` — collect with `check_generation`; re-submitting
  would be charged again.
- Rapid identical submits inside the idempotency window are deduplicated, never
  double-charged.
- `upload_image` / `download_creation` paths are confined to the working directory unless
  `TWODAI_ALLOW_ANY_PATH=1`.

## License

MIT
