# ChatGPT Web

**Mode**: 🔐 Browser · **Domain**: `chatgpt.com`

## Commands

| Command | Description |
|---------|-------------|
| `opencli chatgpt image <prompt>` | Run the stable `/images` create chain and optionally download all visible generated results |
| `opencli chatgpt deep-research <prompt>` | Start a ChatGPT Deep Research thread and return a conservative visible UI state |
| `opencli chatgpt deep-research-status [query]` | Re-open a Deep Research thread and classify the currently visible UI state |
| `opencli chatgpt image-capabilities` | Inspect the currently visible `/images` workbench capabilities |
| `opencli chatgpt image-create <prompt>` | Prompt-only image creation flow for the ChatGPT `/images` workbench |
| `opencli chatgpt image-edit <prompt>` | Open a target ChatGPT image, submit an edit prompt, and by default download the visible edited results |
| `opencli chatgpt image-download` | Download one or all visible ChatGPT images from the current page or a specific conversation URL |

## Usage Examples

```bash
# Generate an image and save all visible results locally via the stable /images chain
opencli chatgpt image "a cyberpunk city at night"

# Only generate in ChatGPT and print the conversation link
opencli chatgpt image "a tiny watercolor fox" --sd true

# Start a Deep Research thread and return the thread URL + visible state
opencli chatgpt deep-research "Research the best browser automation tools for consumer apps"

# Inspect the latest/current Deep Research thread state
opencli chatgpt deep-research-status

# Inspect the currently visible ChatGPT Images workbench capabilities
opencli chatgpt image-capabilities

# Create an image from the ChatGPT /images workbench
opencli chatgpt image-create "A simple blue ceramic mug on a plain white background"

# Open the first visible image on /images, submit an edit prompt, and download the edited result(s)
opencli chatgpt image-edit "Change the background to a pale beige studio backdrop"

# Submit an edit prompt but skip the local download step
opencli chatgpt image-edit "Change the background to a pale beige studio backdrop" --sd true

# Download all visible images from a specific ChatGPT conversation URL
opencli chatgpt image-download --url https://chatgpt.com/c/abc123 --all true
```

## Options

### `image`

| Option | Description |
|--------|-------------|
| `prompt` | Image prompt to send (required positional argument) |
| `--op` | Output directory for downloaded images (default: `~/Pictures/chatgpt`) |
| `--timeout` | Max seconds to keep polling the generated thread for downloadable images before falling back to the ChatGPT link (default: `30`) |
| `--sd` | Skip download and only print the ChatGPT conversation link |

### `deep-research`

| Option | Description |
|--------|-------------|
| `prompt` | Prompt to send (required positional argument) |
| `--timeout` | Max seconds to wait for a stronger visible state before falling back to `submitted` / `pending` (default: `30`) |

### `deep-research-status`

| Option | Description |
|--------|-------------|
| `query` | Conversation URL, title query, or empty for latest/current |
| `--match` | Title match mode: `contains` or `exact` (default: `contains`) |

### `image-capabilities`

No options yet. The command only inspects what is visibly available on `/images` in the current logged-in browser session.

### `image-create`

| Option | Description |
|--------|-------------|
| `prompt` | Prompt to send to the ChatGPT `/images` workbench (required positional argument) |
| `--timeout` | Max seconds to wait for a visible result signal before falling back to `submitted` (default: `30`) |

### `image-edit`

| Option | Description |
|--------|-------------|
| `prompt` | Edit prompt to send for the selected ChatGPT image (required positional argument) |
| `--url` | Optional ChatGPT conversation URL to target a specific image-edit thread |
| `--image` | 1-based image index. On `/images` it selects the visible image entry; with `--url` it selects the lightbox image when available (default: `1`) |
| `--op` | Output directory for downloaded edited images (default: `~/Pictures/chatgpt`) |
| `--sd` | Skip the local download step and only return the edit thread state |
| `--timeout` | Max seconds to keep polling the edit thread for downloadable results before falling back to the ChatGPT thread state (default: `30`) |

### `image-download`

| Option | Description |
|--------|-------------|
| `--url` | Optional ChatGPT conversation URL containing the image to download |
| `--image` | 1-based visible image index to download (default: `1`) |
| `--all` | Download all visible images instead of only the selected index |
| `--op` | Output directory for downloaded images (default: `~/Pictures/chatgpt`) |
| `--timeout` | Seconds to wait for a visible image before failing (default: `30`) |

## Behavior

- These commands drive the **ChatGPT web UI**, not the macOS desktop app.
- `image` now uses the same `/images`-first create flow as `image-create`, then polls the resulting thread in short download checks until visible images can be saved or the timeout budget is exhausted. Unless `--sd true` is set, it downloads all visible results.
- `deep-research` is intentionally conservative: it opens `/deep-research`, injects the prompt, sends it, and returns only a **visible UI classification**.
- `deep-research-status` re-opens a thread by URL/title/latest fallback and classifies only what is visibly present in the UI.
- `image-capabilities` opens `/images` and reports only the currently visible workbench capabilities.
- `image-create` performs a capability-first preflight on `/images`, sends a prompt, and returns a conservative submission/result state.
- `image-edit` defaults to `/images`, opens the requested visible image entry, waits for the lightbox edit composer to become ready, sends the edit prompt, and then polls the resulting edit thread for downloadable images unless `--sd true` is set. Pre-existing visible source images are excluded from the auto-download pass so the command does not falsely re-save the original input images.
- `image-download` downloads one or all visible images from the current ChatGPT page or a specific conversation URL and saves them locally.
- For a stable GPT image 2.0 chain, prefer `image` for shorthand or `image-create` → `image-edit` → `image-download --url <page_url>` when you want explicit step control on web ChatGPT rather than the desktop app.
- For desktop-app commands such as `status`, `new`, `send`, `read`, `ask`, and `model`, see [ChatGPT App](../desktop/chatgpt-app.md).

## Deep Research UI States

The browser-backed Deep Research workflow only returns these visible UI states:

- `landing`
- `input_ready`
- `submitted`
- `pending`
- `retry_required`
- `unknown`

## Caveats

- This adapter depends on the current logged-in browser session and may fail if ChatGPT shows login, challenge, quota, feature-gating, or other blocking UI.
- DOM or product changes on ChatGPT can break composer detection, thread discovery, lightbox detection, image extraction, or capability inspection.
- `image-create` / `image-edit` intentionally expose only conservative states in the current MVP and do **not** promise advanced controls like model, quality, aspect ratio, seed, or masking.
- `image-edit --image <n>` on `/images` means the nth visible image entry, not a semantic match by prompt/title.

## Prerequisites

- Chrome is running
- You are already logged into `chatgpt.com`
- Your account can open `/images`
- Your account can open `/deep-research` for the research commands
- [Browser Bridge extension](/guide/browser-bridge) is installed
