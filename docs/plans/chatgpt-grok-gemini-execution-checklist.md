# ChatGPT / Grok / Gemini Execution Checklist

Status: active
Owner: OpenCLI CLI Operator
Primary repo: luxiaolei/OpenCLI
Current branch: feat/chatgpt-deep-research
Last updated: 2026-04-11

## Objective
Deliver a shareable OpenCLI enhancement plan and implementation stream covering:
- ChatGPT Deep Research
- ChatGPT Pro image capabilities / advanced image workflow
- Grok web adapter readiness and submit-fix path
- Gemini advanced image capability mapping
- Unified async callback / result lifecycle for long-running research

## Phase 0 — Baseline confirmed
- [x] Fork created: `luxiaolei/OpenCLI`
- [x] Local repo prepared: `repos/OpenCLI-fork`
- [x] Working branch created: `feat/chatgpt-deep-research`
- [x] ChatGPT web session confirmed logged in as Pro
- [x] ChatGPT Deep Research page confirmed reachable
- [x] Grok web session confirmed logged in
- [x] Grok current blocker narrowed to adapter clickability / overlay / readiness issue
- [x] Gemini image command confirmed working in current environment

## Phase 1 — Exploration freeze (before coding)
### 1. ChatGPT Deep Research flow map
- [ ] Capture real Deep Research UI states: landing, input-ready, running, completed
- [ ] Confirm visible controls: sites, apps, source/report views, follow-up paths
- [ ] Confirm result surfaces: share/export/url/transcript fallbacks
- [ ] Confirm whether any formal naming beyond `Deep Research` actually exists

### 2. ChatGPT Pro image capability map
- [ ] Inspect `/images` in logged-in Pro session
- [ ] Enumerate visible controls: model, quality, ratio, style, reference image, edit/variation
- [ ] Distinguish real UI controls vs prompt-only shaping
- [ ] Freeze highest-tier capabilities actually visible to current account

### 3. Grok web adapter root-cause map
- [ ] Reproduce submit-readiness failure in logged-in session
- [ ] Identify blockers: consent overlay / selector mismatch / wait logic / model menu state
- [ ] Confirm whether `Imagine` and other consumer features are automatable
- [ ] Freeze fix scope for adapter patch

### 4. Gemini advanced image map
- [ ] Inspect `Create image` UI in logged-in Gemini session
- [ ] Confirm any explicit model/quality/advanced controls
- [ ] Distinguish default UI automation vs prompt augmentation
- [ ] Freeze enhancement options for later implementation

### 5. Async callback contract freeze
- [ ] Standardize lifecycle: ACK / UPDATE / RESULT / BLOCKED / FAILED / EXPIRED
- [ ] Standardize fields: request_id / job_id / callback_session_key / artifact_path / provider_job_ref
- [ ] Freeze provider vs orchestration layer boundary

## Phase 2 — Implementation tracks
### Track A: ChatGPT Deep Research MVP
Branch: `feat/chatgpt-deep-research-mvp`
PR: `feat(chatgpt): add deep-research and deep-research-result commands`
- [ ] Add `clis/chatgpt/deep-research.ts`
- [ ] Add `clis/chatgpt/deep-research-result.ts`
- [ ] Add `clis/chatgpt/utils.ts`
- [ ] Extend `clis/chatgpt/ax.ts` only where base helpers are truly reusable
- [ ] Add tests for start/result/status fallbacks
- [ ] Update docs and README entries

### Track B: ChatGPT Pro image capabilities and command design
Branch: `feat/chatgpt-pro-image-capabilities`
PR: `feat(chatgpt): add image capability inspection and workflow plan`
- [ ] Add a capability-inspection path or doc-driven inspection artifacts
- [ ] Decide whether command MVP should be `image-capabilities` first or direct `image`
- [ ] Document account-tier-visible controls

### Track C: Grok adapter submit fix
Branch: `fix/grok-web-submit-readiness`
PR: `fix(grok): improve web submit readiness and consent diagnostics`
- [ ] Patch readiness / clickability logic
- [ ] Add clearer blocked diagnostics
- [ ] Account for consent overlays and consumer-web edge cases
- [ ] Add tests/docs

### Track D: Gemini image capability enhancement
Branch: `feat/gemini-image-capabilities`
PR: `feat(gemini): improve image capability detection and advanced controls`
- [ ] Add capability mapping or UI inspection support
- [ ] Decide whether to expose explicit advanced controls later
- [ ] Add tests/docs if command surface changes

### Track E: Async callback documentation / workflow helpers
Branch: `docs/research-workflow-checklist`
PR: `docs(workflow): standardize async research callback lifecycle`
- [ ] Document request/ack/update/result/blocked/failed/expired
- [ ] Document recovery anchors and expected polling/backoff behavior
- [ ] Keep orchestration logic separate from provider adapters

## Checkpoints
### CP-0 — Plan freeze
- [x] Checklist approved by user
- [ ] Persist checklist into repo docs
- [ ] Commit kickoff docs update

### CP-1 — Exploration freeze
- [ ] ChatGPT Deep Research flow documented
- [ ] ChatGPT Pro image capability map documented
- [ ] Grok root cause documented
- [ ] Gemini advanced image map documented

### CP-2 — Contract freeze
- [ ] ChatGPT deep-research command contract frozen
- [ ] Result/status contract frozen
- [ ] Async callback contract frozen

### CP-3 — MVP coding start
- [ ] Phase-1 implementation branch cut
- [ ] ChatGPT Deep Research MVP underway
- [ ] Tests/docs updated in parallel

### CP-4 — Reviewable PR
- [ ] Commands working in verified session
- [ ] Tests passing
- [ ] Docs updated
- [ ] PR ready for review

## Notes
- Do not hard-code speculative names like `Pro Research` or `Extended Research` unless directly verified in UI.
- Treat ChatGPT Pro image work as separate from Deep Research MVP so PRs stay reviewable.
- Treat Grok as adapter-fix-first, research-feature-later.
- Commit at meaningful checkpoints; avoid giant unreviewable diffs.
