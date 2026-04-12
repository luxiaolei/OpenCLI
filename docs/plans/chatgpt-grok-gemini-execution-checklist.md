# ChatGPT / Grok / Gemini Execution Checklist

Status: active
Owner: OpenCLI CLI Operator
Primary repo: luxiaolei/OpenCLI
Current branch: feat/chatgpt-deep-research
Last updated: 2026-04-11 (CP-1 complete)

## Objective
Deliver a shareable OpenCLI enhancement stream covering:
- ChatGPT Deep Research
- ChatGPT Pro image capability mapping and command planning
- Grok web adapter readiness / locale-safe submit fix
- Gemini advanced image capability mapping and future command design
- Unified async callback / result lifecycle for long-running research

## Phase 0 — Baseline confirmed
- [x] Fork created: `luxiaolei/OpenCLI`
- [x] Local repo prepared: `repos/OpenCLI-fork`
- [x] Working branch created: `feat/chatgpt-deep-research`
- [x] ChatGPT web session confirmed logged in as Pro
- [x] ChatGPT Deep Research page confirmed reachable
- [x] Grok web session confirmed logged in
- [x] Grok current blocker narrowed to web adapter clickability / locale selector issue
- [x] Gemini image command confirmed working in current environment

## Phase 1 — Exploration freeze (completed)
### 1. ChatGPT Deep Research flow map
- [x] Capture verified states: landing / input-ready / thread-created / retry-required
- [x] Confirm visible controls: files / apps / sites / thread share / retry button
- [x] Confirm formal naming boundary: only `Deep Research / 深度研究` is verified
- [x] Record blocked items: running / completed / export / sources not yet frozen

### 2. ChatGPT Pro image capability map
- [x] Inspect `/images` in logged-in Pro session
- [x] Confirm real UI primitives: prompt box / uploads / style cards / task cards
- [x] Confirm result-card actions: open / edit / share
- [x] Record absent/unverified controls: model / quality / ratio / seed / variant / download

### 3. Grok web adapter root-cause map
- [x] Reproduce submit-readiness failure in logged-in session
- [x] Identify primary blocker: explicit web flow hard-codes `Submit` while current UI uses `提交`
- [x] Confirm default `opencli grok ask` still works in same session
- [x] Freeze separate scope for overlay diagnostics / model menu / response detection

### 4. Gemini advanced image map
- [x] Inspect `Create image` UI in logged-in Gemini session
- [x] Confirm native style/template cards exist
- [x] Confirm upload menu exists
- [x] Record current gap: CLI `--rt/--st` are prompt augmentation, not UI-native controls
- [x] Record blocked items: explicit model / quality / advanced panel remain unverified

### 5. Async callback contract freeze
- [x] Lifecycle frozen at planning level: ACK / UPDATE / RESULT / BLOCKED / FAILED / EXPIRED
- [x] Core fields frozen at planning level: request_id / job_id / callback_session_key / artifact_path / provider_job_ref
- [x] Provider vs orchestration layer boundary clarified in exploration notes

## Phase 2 — Implementation tracks
### Track A: Grok web submit fix (smallest high-confidence patch)
Branch: `fix/grok-web-submit-readiness`
PR: `fix(grok): improve web submit readiness and locale diagnostics`
- [ ] Patch explicit web flow submit selector to handle localized labels and `type=submit`
- [ ] Improve blocked diagnostics for locale / overlay / disabled state
- [ ] Add focused tests for explicit web flow
- [ ] Update `docs/adapters/browser/grok.md`

### Track B: ChatGPT Deep Research MVP (conservative contract)
Branch: `feat/chatgpt-deep-research-mvp`
PR: `feat(chatgpt): add deep-research and deep-research-status commands`
- [ ] Add `clis/chatgpt/deep-research.ts`
- [ ] Add `clis/chatgpt/deep-research-status.ts`
- [ ] Add `clis/chatgpt/utils.ts`
- [ ] Extend `clis/chatgpt/ax.ts` only where helpers are clearly reusable
- [ ] Return conservative states only: `landing`, `input_ready`, `thread_created`, `retry_required`, `unknown`
- [ ] Do **not** promise `running/completed/export` in Phase 1
- [ ] Add tests and docs in the same PR

### Track C: ChatGPT Pro image capability-first work
Branch: `feat/chatgpt-pro-image-capabilities`
PR: `feat(chatgpt): add image capability inspection and command contract docs`
- [ ] Decide whether to implement `chatgpt image-capabilities` before `chatgpt image`
- [ ] Freeze UI-first command surface around create / open / edit / share / list
- [ ] Avoid premature params like `--model --quality --aspect-ratio --seed --variant`
- [ ] Update docs with verified Pro-only visible surface

### Track D: Gemini image capability enhancement
Branch: `feat/gemini-image-capabilities`
PR: `feat(gemini): add image capability inspection and clarify UI-native vs prompt-level controls`
- [ ] Add capability mapping or inspection support
- [ ] Separate prompt-level flags from UI-native controls in docs/design
- [ ] Consider template-card mapping before any advanced parameter surface

### Track E: Async callback workflow docs/helpers
Branch: `docs/research-workflow-checklist`
PR: `docs(workflow): standardize async research callback lifecycle`
- [ ] Document request / ack / update / result / blocked / failed / expired
- [ ] Document recovery anchors and expected polling/backoff behavior
- [ ] Keep orchestration logic separate from provider adapters

## Checkpoints
### CP-0 — Plan freeze
- [x] Checklist approved by user
- [x] Checklist persisted into repo docs
- [x] Kickoff docs update committed

### CP-1 — Exploration freeze
- [x] ChatGPT Deep Research flow documented
- [x] ChatGPT Pro image capability map documented
- [x] Grok root cause documented
- [x] Gemini advanced image map documented
- [x] CP-1 review / branch decision doc prepared

### CP-2 — Contract freeze
- [ ] ChatGPT deep-research command contract frozen in repo docs
- [ ] ChatGPT Pro image command direction frozen in repo docs
- [ ] Grok fix scope frozen in repo docs
- [ ] Gemini capability-first enhancement direction frozen in repo docs
- [ ] Async callback contract frozen in repo docs

### CP-3 — First implementation branch cut
- [ ] Create `fix/grok-web-submit-readiness`
- [ ] Ship smallest Grok web fix PR
- [ ] Create `feat/chatgpt-deep-research-mvp`
- [ ] Begin ChatGPT Deep Research MVP with tests/docs in parallel

### CP-4 — Reviewable PRs
- [ ] Grok web fix PR ready for review
- [ ] ChatGPT Deep Research MVP PR ready for review
- [ ] Planning/docs PRs updated as needed

## Notes
- Do not hard-code speculative names like `Pro Research` or `Extended Research` unless directly verified in UI.
- Treat ChatGPT Pro image work as capability-first, not parameter-first.
- Treat Grok as adapter-fix-first, research-feature-later.
- Treat Gemini as `image-capabilities` / template-mapping first, advanced params later.
- Commit at meaningful checkpoints; avoid giant unreviewable diffs.
