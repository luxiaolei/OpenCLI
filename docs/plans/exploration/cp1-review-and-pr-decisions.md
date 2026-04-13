# CP-1 Review and Branch / PR Decisions

Status: approved-for-execution
Date: 2026-04-11
Scope: unify CP-1 exploration findings into branch and PR decisions

## 1. CP-1 synthesis

### ChatGPT Deep Research
- Verified: `/deep-research` landing, input-ready, thread creation, retry-required button, thread share button, `Deep Research / 深度研究` naming.
- Blocked: stable `running`, `completed`, `sources`, `export`, `share_url` surface.
- Decision: Phase 1 must be conservative and should expose `deep-research` + `deep-research-status`, not a result/export contract.

### ChatGPT Pro image
- Verified: `/images` is a prompt + upload + preset-card workbench.
- Verified: uploads, style cards, task cards, result-card `open / edit / share`.
- Not verified: explicit model / quality / ratio / seed / n / variant / download controls.
- Decision: capability-first and UI-first; do not expose speculative image parameters.

### Grok web adapter
- Verified: user session is logged in.
- Verified: explicit `--web` flow hard-codes English `Submit`, while actual current UI uses Chinese `提交`.
- Verified: default `opencli grok ask` works in same environment.
- Decision: first coding task should be a small, isolated `--web` submit/readiness fix with better locale diagnostics.

### Gemini image
- Verified: current CLI is a working MVP.
- Verified: Gemini UI has native template cards and upload menu.
- Verified: current `--rt/--st` are prompt augmentation, not native UI control.
- Decision: add capability inspection / template-aware design before any advanced parameter promise.

### Async callback
- Verified at planning layer: ACK / UPDATE / RESULT / BLOCKED / FAILED / EXPIRED lifecycle is the right abstraction.
- Decision: keep this as docs/workflow layer, separate from provider adapter PRs.

## 2. Branch order decision

### Branch 1 — smallest confident patch
- Branch: `fix/grok-web-submit-readiness`
- PR: `fix(grok): improve web submit readiness and locale diagnostics`
- Why first:
  - root cause is already frozen with concrete evidence;
  - patch scope is small and reviewable;
  - restores an existing command path rather than inventing a new one.

### Branch 2 — first new capability
- Branch: `feat/chatgpt-deep-research-mvp`
- PR: `feat(chatgpt): add deep-research and deep-research-status commands`
- Why second:
  - highest product value;
  - contract is now conservative enough to implement honestly;
  - should stay separate from image work to keep the PR reviewable.

### Branch 3 — ChatGPT Pro image capability-first
- Branch: `feat/chatgpt-pro-image-capabilities`
- PR: `feat(chatgpt): add image capability inspection and command contract docs`

### Branch 4 — Gemini image capability inspection
- Branch: `feat/gemini-image-capabilities`
- PR: `feat(gemini): add image capability inspection and clarify UI-native vs prompt-level controls`

### Branch 5 — workflow docs
- Branch: `docs/research-workflow-checklist`
- PR: `docs(workflow): standardize async research callback lifecycle`

## 3. Contract decisions frozen at CP-1.5

### ChatGPT Deep Research Phase-1 contract
- `chatgpt deep-research <prompt>`
  - returns: `conversation_url`, `conversation_id`, `thread_title?`, `mode_label`, `ui_state`
- `chatgpt deep-research-status <conversation_url|query>`
  - returns only visible UI classification
- allowed `ui_state` values in Phase 1:
  - `landing`
  - `input_ready`
  - `submitted`
  - `pending`
  - `retry_required`
  - `unknown`
- explicitly out of scope in Phase 1:
  - `running`
  - `completed`
  - `sources`
  - `export`
  - `result_url`
  - `share_url`

### ChatGPT Pro image direction
- Prefer `chatgpt image-capabilities` or capability-doc-first approach before direct image command work.
- If later command work starts, design around:
  - `create`
  - `open`
  - `edit`
  - `share`
  - `list`
  - `preset/template`
- Explicitly do not promise yet:
  - `--model`
  - `--quality`
  - `--aspect-ratio`
  - `--size`
  - `--n`
  - `--seed`
  - `--variant`
  - `--download`

### Grok fix scope
- fix localized submit selector mismatch
- add `type=submit` fallback
- improve blocked diagnostics for locale / overlay / disabled state
- do not mix in model-menu automation or response-detection rewrite

### Gemini direction
- capability inspection first
- template-card mapping before advanced params
- clearly separate prompt-level flags vs UI-native controls

## 4. Immediate next actions
- Commit CP-1 review docs and frozen decisions
- Cut `fix/grok-web-submit-readiness`
- Implement smallest Grok web patch + tests + docs
- After Grok PR is reviewable, cut `feat/chatgpt-deep-research-mvp`
