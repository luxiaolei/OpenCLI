# ChatGPT (Browser)

**Mode**: 🔐 Browser · **Domain**: `chatgpt.com`

## Commands

| Command | Description |
|---------|-------------|
| `opencli chatgpt deep-research <prompt>` | Start a ChatGPT Deep Research thread and return a conservative visible UI state |
| `opencli chatgpt deep-research-status [query]` | Re-open a ChatGPT Deep Research thread and classify only the visible UI state |
| `opencli chatgpt image-capabilities` | Inspect the currently visible ChatGPT Images workbench capabilities for the logged-in browser session |

## Usage Examples

```bash
# Start a Deep Research thread and return the thread URL + visible state
opencli chatgpt deep-research "Research the best browser automation tools for consumer apps"

# Wait longer before returning the visible thread state
opencli chatgpt deep-research "Compare open-source browser automation stacks" --timeout 45

# Inspect the latest/current Deep Research thread state
opencli chatgpt deep-research-status

# Inspect a specific thread by URL
opencli chatgpt deep-research-status "https://chatgpt.com/c/abc123"

# Inspect a thread by title match
opencli chatgpt deep-research-status "Deep Research 概述" --match contains

# Inspect the currently visible ChatGPT Images workbench capabilities
opencli chatgpt image-capabilities
```

## Options

### `deep-research`

| Option | Description |
|--------|-------------|
| `prompt` | Prompt to send (required positional argument) |
| `--timeout` | Max seconds to wait for a visible thread/retry state (default: `30`) |

### `deep-research-status`

| Option | Description |
|--------|-------------|
| `query` | Conversation URL, title query, or empty for latest/current |
| `--match` | Title match mode: `contains` or `exact` (default: `contains`) |

### `image-capabilities`

No options yet. The command only inspects what is visibly available on `/images` in the current logged-in browser session.

#### `image-capabilities` out of scope

This command does **not** currently promise or infer:
- `model`
- `quality`
- `aspect-ratio`
- `size`
- `seed`
- `variant`
- `download`

## Behavior

- These commands drive the **ChatGPT web UI**, not the macOS desktop app.
- `deep-research` is intentionally conservative in Phase 1: it opens `/deep-research`, injects the prompt, sends it, and only returns a **visible UI classification**.
- `deep-research-status` re-opens a thread by URL/title/latest fallback and classifies only what is visibly present in the UI.
- `image-capabilities` opens `/images` and reports only the currently visible workbench capabilities (for example upload affordances, preset cards, task cards, and visible result-card actions).

## Phase-1 UI States

The browser-backed MVP only returns these states:

- `landing`
- `input_ready`
- `thread_created`
- `retry_required`
- `unknown`

## Explicitly Out of Scope (for now)

These browser commands do **not** currently promise:

- `running`
- `completed`
- `sources`
- `export`
- `result_url`
- `share_url`

## Prerequisites

- Chrome is running
- You are already logged into `chatgpt.com`
- Your account can open `/deep-research`
- Your account can open `/images`
- [Browser Bridge extension](/guide/browser-bridge) is installed

## Caveats

- This adapter depends on the current logged-in browser session and may fail if ChatGPT shows login, consent, quota, feature-gating, or other blocking UI.
- The landing hero text on `/deep-research` is not stable; the command does **not** rely on one fixed headline.
- The current Phase-1 implementation treats `深度研究，点击以重试` / `Deep Research, click to retry` as `retry_required` instead of pretending the run is actively progressing.
- DOM/product changes on ChatGPT can break composer detection, thread discovery, state classification, or image capability inspection.
- For desktop-app commands such as `status`, `new`, `send`, `read`, `ask`, and `model`, see [docs/adapters/desktop/chatgpt.md](../desktop/chatgpt.md).
