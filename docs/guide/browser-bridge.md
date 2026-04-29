# Browser Bridge Setup

> **⚠️ Important**: Browser commands reuse your Chrome login session. You must be logged into the target website in Chrome before running commands.

OpenCLI connects to your browser through a lightweight **Browser Bridge** Chrome Extension + micro-daemon (zero config, auto-start).

## Extension Installation

### Method 1: Download Pre-built Release (Recommended)

1. Go to the GitHub [Releases page](https://github.com/jackwener/opencli/releases) and download the latest `opencli-extension-v{version}.zip`.
2. Unzip the file and open `chrome://extensions`, enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the unzipped folder.

### Method 2: Load Unpacked Source (For Developers)

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select the `extension/` directory from the repository.

## Verification

That's it! The daemon auto-starts when you run any browser command. No tokens, no manual configuration.

```bash
opencli doctor            # Check extension + daemon connectivity
```

## Browser Harness backend (experimental)

OpenCLI can also use [Browser Harness](https://github.com/browser-use/browser-harness) as an extensionless Chrome DevTools backend. This is useful when you want to talk to Browser Use's daemon/socket layer directly instead of the OpenCLI Chrome extension.

```bash
# one-time Browser Harness setup (enables/validates Chrome remote debugging)
browser-harness --setup

# run any OpenCLI browser command through Browser Harness
OPENCLI_BROWSER_BACKEND=browser-harness opencli browser state
OPENCLI_BROWSER_BACKEND=browser-harness opencli browser eval 'document.title'
```

Configuration:

| Variable | Purpose |
| --- | --- |
| `OPENCLI_BROWSER_BACKEND=browser-harness` | Selects the Browser Harness backend. `harness` is also accepted. |
| `OPENCLI_BROWSER_HARNESS=1` | Alternate feature flag for the same backend. |
| `OPENCLI_BROWSER_HARNESS_NAME` / `BU_NAME` | Browser Harness daemon name. Defaults to `default`; socket is `/tmp/bu-<name>.sock` on POSIX. |
| `OPENCLI_BROWSER_HARNESS_SOCKET` | Explicit Unix socket path override. |
| `BH_TMP_DIR` | Browser Harness isolated temp directory; socket becomes `<BH_TMP_DIR>/bu.sock`. |
| `BU_CDP_WS` / `BU_CDP_URL` | Browser Harness CDP target overrides for remote or dedicated browsers. |
| `OPENCLI_BROWSER_HARNESS_AUTO_START=0` | Disable OpenCLI's best-effort `browser-harness -c pass` daemon auto-start. |
| `OPENCLI_BROWSER_HARNESS_COMMAND` | Custom Browser Harness command if `browser-harness` is not on `PATH`. |

When selected, Browser Harness auto-starts if possible, then OpenCLI speaks CDP over its local JSONL socket. `browser tab list`, `--tab`, `browser open`, `browser eval`, screenshots, cookies, console messages, native click/type/key, and network capture use the same OpenCLI command surface where the underlying CDP command is supported by Browser Harness.

## Tab Targeting

Browser commands run inside the shared `browser:default` workspace unless you explicitly choose another tab target.

```bash
opencli browser open https://www.baidu.com/
opencli browser tab list
opencli browser tab new https://www.baidu.com/
opencli browser eval --tab <targetId> 'document.title'
opencli browser tab select <targetId>
opencli browser get title
opencli browser tab close <targetId>
```

Key rules:

- `opencli browser open <url>` and `opencli browser tab new [url]` return a `targetId`.
- `opencli browser tab list` prints the `targetId` values of tabs that already exist.
- `--tab <targetId>` routes a single browser command to that specific tab.
- `tab new` creates a new tab but does not change the default browser target.
- `tab select <targetId>` makes that tab the default target for later untargeted `opencli browser ...` commands.
- `tab close <targetId>` removes the tab; if it was the current default target, the stored default is cleared.

## How It Works

```
┌─────────────┐     WebSocket      ┌──────────────┐     Chrome API     ┌─────────┐
│  opencli    │ ◄──────────────► │  micro-daemon │ ◄──────────────► │  Chrome  │
│  (Node.js)  │    localhost:19825  │  (auto-start) │    Extension       │ Browser  │
└─────────────┘                    └──────────────┘                    └─────────┘
```

The daemon manages the WebSocket connection between your CLI commands and the Chrome extension. The extension executes JavaScript in the context of web pages, with access to the logged-in session.

## Daemon Lifecycle

The daemon auto-starts on first browser command and stays alive persistently.

```bash
opencli daemon stop      # Graceful shutdown
```

The daemon is persistent — it stays alive until you explicitly stop it (`opencli daemon stop`) or uninstall the package.
