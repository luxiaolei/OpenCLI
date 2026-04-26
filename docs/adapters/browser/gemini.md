# Gemini

**Mode**: 🔐 Browser · **Domain**: `gemini.google.com`

## Commands

| Command | Description |
|---------|-------------|
| `opencli gemini new` | Start a new Gemini web chat |
| `opencli gemini ask <prompt>` | Send a prompt and return only the assistant reply |
| `opencli gemini image-capabilities` | Inspect visible Gemini Create image capabilities without generating images |
| `opencli gemini image <prompt>` | Generate images in Gemini and optionally save them locally |
| `opencli gemini deep-research <prompt>` | Start a Gemini Deep Research run and confirm it |
| `opencli gemini deep-research-result <query>` | Export Deep Research report URL from a Gemini conversation |

## Usage Examples

```bash
# Start a fresh chat
opencli gemini new

# Ask Gemini and return minimal plain-text output
opencli gemini ask "Reply with exactly: HELLO"

# Ask in a new chat and wait longer
opencli gemini ask "Summarize this design in 3 bullets" --new true --timeout 90

# Inspect visible Create image capabilities as structured JSON
opencli gemini image-capabilities

# Generate an icon image with prompt-level shorthands
opencli gemini image "Generate a tiny cyan moon icon" --rt 1:1 --st icon

# Only generate in Gemini and print the page link without downloading files
opencli gemini image "A watercolor sunset over a lake" --sd true

# Save generated images to a custom directory
opencli gemini image "A flat illustration of a robot" --op ~/tmp/gemini-images

# Start Gemini Deep Research and return the conversation URL once the run is confirmed
opencli gemini deep-research "Research Google's public description of Gemini Deep Research; return 2 bullets"

# Poll a Gemini Deep Research conversation for an export/result state
opencli gemini deep-research-result https://gemini.google.com/app/abc123 --timeout 30
```

## Options

### `ask`

| Option | Description |
|--------|-------------|
| `prompt` | Prompt to send (required positional argument) |
| `--timeout` | Max seconds to wait for a reply (default: `60`) |
| `--new` | Start a new chat before sending (default: `false`) |

### `image-capabilities`

No options. The command opens the Gemini page, inspects the currently visible Create image surface, may switch into the visible `Create image` mode or expand the upload menu for read-only inspection, and returns structured capability data.

Typical fields include:

- `page_url`, `page_title`
- `create_image_entry_visible`, `create_image_entry_labels`
- `create_image_mode_active`, `create_image_mode_labels`
- `template_cards`
- `upload_trigger_visible`, `upload_trigger_labels`
- `upload_menu_visible`, `upload_affordances`
- `tool_buttons`, `mode_buttons`
- `status`: `verified`, `blocked`, or `absent`

### `image`

| Option | Description |
|--------|-------------|
| `prompt` | Image prompt to send (required positional argument) |
| `--rt` | Prompt-level ratio shorthand (not a native Gemini UI control): `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3` |
| `--st` | Prompt-level style shorthand, e.g. `icon`, `anime`, `watercolor` (not a native Gemini template selector) |
| `--op` | Output directory for downloaded images (default: `~/tmp/gemini-images`) |
| `--sd` | Skip download and only print the Gemini page link |

### `deep-research`

| Option | Description |
|--------|-------------|
| `prompt` | Deep Research prompt to send (required positional argument) |
| `--timeout` | Max seconds to wait for submit/confirm before returning a conservative failure state (default: `30`) |
| `--tool` | Optional override for the visible tool label (default labels include `Deep Research`, `Deep research`, and `深度研究`) |
| `--confirm` | Optional override for the visible confirmation button label (default labels include `Start research` variants and localized equivalents) |

### `deep-research-result`

| Option | Description |
|--------|-------------|
| `query` | Conversation title or Gemini conversation URL; empty defaults to the latest conversation |
| `--match` | Title match mode: `contains` or `exact` (default: `contains`) |
| `--timeout` | Max seconds to wait for a Docs/export URL or pending/export-not-ready classification (default: `120`) |

## Behavior

- `ask` uses plain minimal output and returns only the assistant response text prefixed with `💬`.
- `image-capabilities` defaults to JSON so arrays like template cards and upload affordances stay structured.
- `image-capabilities` is capability-first: it reports only UI elements that are actually visible.
- `image-capabilities` does **not** claim model, quality, seed, image count, upscale, or edit/reference semantics unless Gemini makes them explicitly visible in the inspected UI.
- `image` uses plain output and prints `status / file / link` instead of a table.
- `image` always starts from a fresh Gemini chat before sending the prompt.
- `image --rt` / `--st` currently augment the prompt text; they do **not** click Gemini-native ratio or style controls.
- When `--sd` is enabled, `image` keeps the generation in Gemini and only prints the conversation link.
- `deep-research` starts from a fresh Gemini chat, selects the visible Deep Research tool, sends the prompt, clicks the visible research confirmation, and returns `started` with the Gemini conversation URL when the run is confirmed.
- `deep-research-result` classifies the visible result/export state. If a report is still running or the Docs export is not ready, it returns a pending/export-not-ready message instead of pretending completion. This response can be polled by an outer notifier for asynchronous Deep Research reminders.
- If the Gemini UI drifts, first compare `deep-research` tool selection against the raw Browser Bridge page state: a visible button in `browser state` but `tool-not-found` from the adapter indicates selector drift, not login failure.

## Prerequisites

- Chrome is running
- You are already logged into `gemini.google.com`
- [Browser Bridge extension](/guide/browser-bridge) is installed

## Caveats

- This adapter drives the Gemini consumer web UI, not a public API.
- It depends on the current browser session and may fail if Gemini shows login, consent, challenge, quota, or other gating UI.
- DOM or product changes on Gemini can break composer detection, create-image capability inspection, upload-menu discovery, or image export behavior.
