# Codex

Control the **OpenAI Codex Desktop App** headless or headfully via Chrome DevTools Protocol (CDP). Because Codex is built on Electron, OpenCLI can directly drive its internal UI, automate slash commands, and manipulate its AI agent threads.

## Prerequisites

1. You must have the official OpenAI Codex app installed.
2. Launch it via the terminal and expose a remote debugging port.
   - The port is **environment-specific**. `9222` is only a common example and may conflict with other Electron apps on some machines.
   - Use any free local port, for example `9333`:
   ```bash
   # macOS
   /Applications/Codex.app/Contents/MacOS/Codex --remote-debugging-port=9333
   ```

## Setup

```bash
# Point OpenCLI at the Codex instance you actually launched
export OPENCLI_CDP_ENDPOINT="http://127.0.0.1:9333"

# If OpenCLI attaches to the wrong Codex window/target, pin the main app target explicitly
export OPENCLI_CDP_TARGET="app://-/index.html?hostId=local"
```

If another machine uses a different debug port, just change `OPENCLI_CDP_ENDPOINT` to that port. The CLI should be treated as environment-aware here rather than assuming one universal port.

## First-run Computer Use checklist

If you want to use Codex Computer Use from the desktop app:

1. In the Codex sidebar, click the bottom-left `Settings` button.
2. In the account menu that opens, click `Settings`.
3. In the Settings sidebar, open `Computer use`.
4. If the plugin card is not installed, click `Install`. If it is already installed, use `Try in Chat`.
5. In macOS, open `System Settings -> Privacy & Security -> Screen Recording` and `Accessibility`, then enable `Codex.app`.
6. When Codex asks to use an app, choose `Always allow` if you want the approval to persist. Verify the app appears in `Settings -> Computer use -> Always-allowed apps`.

OpenCLI also exposes:

```bash
opencli codex guide
opencli codex settings computer-use
opencli codex computer-use
opencli codex computer-use "Open Safari and stop at the approval prompt."
opencli codex computer-use "Use Computer Use only. Do not run shell commands. Try to focus Safari and stop at the approval prompt." --approve once
```

If a Codex command returns empty output or a model read comes back unknown, return to the main Codex app/thread, confirm the steps above, and rerun the command.

## Commands

### Diagnostics
- `opencli codex status`: Checks connection and reads the current active window URL/title.
- `opencli codex guide`: Prints the first-run Computer Use / permissions checklist and exact click path.
- `opencli codex settings computer-use`: Opens Codex Settings and jumps to the `Computer use` section.
- `opencli codex computer-use`: Opens `Settings -> Computer use`, clicks `Try in Chat`, and attaches the Computer Use plugin to the current composer.
  - If you pass text, for example `opencli codex computer-use "Open Safari and stop at the approval prompt."`, it will also send the prompt immediately.
  - Add `--approve once` or `--approve always` to wait for a delayed in-app approval card and click it automatically.
  - `--approve-timeout <seconds>` lets you wait longer for slower approval cards; default is 30 seconds.
  - It now separates two common blockers: `Waiting for macOS permissions` vs `Waiting for approval`.
- `opencli codex dump`: Dumps the full UI DOM and Accessibility tree into `/tmp`.
- `opencli codex screenshot`: Captures DOM + snapshot artifacts of the current window.

### Agent Manipulation
- `opencli codex new`: Simulates `Cmd+N` to start a completely fresh and isolated Git Worktree thread context.
- `opencli codex send "message"`: Robustly finds the active Thread Composer and injects your text.
  - *Pro-tip*: You can trigger internal shortcuts, e.g., `opencli codex send "/review"`.
- `opencli codex ask "message"`: Send + wait + read in one shot.
- `opencli codex read`: Extracts the entire current thread history and AI reasoning logs.
- `opencli codex extract-diff`: Automatically scrapes any visual Patch chunks and Code Diffs.
- `opencli codex model`: Get the currently active AI model.
- `opencli codex history`: List recent conversation threads from the sidebar.
- `opencli codex export`: Export the current conversation as Markdown.
