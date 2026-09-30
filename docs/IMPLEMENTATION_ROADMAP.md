# Implementation Roadmap

Source: synthesizes all preceding `docs/` files and the phase-discipline
rule in `AGENTS.md` §3 ("build in vertical-slice phase order, do not skip
ahead, each phase should leave the repository runnable").

## How to read this roadmap

Each phase is a vertical slice, not a layer. A phase is complete when its
deliverable is real, runnable, and status-labeled per `AGENTS.md` §4
(`IMPLEMENTED` / `PARTIALLY IMPLEMENTED` / `EXPERIMENTAL` / `UNVERIFIED` /
`BLOCKED` / `NOT IMPLEMENTED`) — not when the relevant doc merely describes
it. Per `AGENTS.md` §3, we stop at each phase boundary, state what was
completed and what the next phase requires, and wait for explicit
go-ahead before starting the next phase unless told otherwise.

## Phase 0–1 — Documentation and repository foundation

**Status: complete.** All 18 planning documents listed in the root
`README.md` now exist, including this one. No application code exists yet.

## Phase 2 — Technology decisions and repository scaffolding

- Create `extension/`, `server/`, `evaluation/`, `tests/` directories.
- Create `docs/TECHNOLOGY_DECISIONS.md`, recording, with a stated reason
  for each: extension architecture (Manifest V3), build tooling, the
  Transformers.js/ONNX Runtime Web dependency, and any server-side
  framework choice.
- No perception/privacy/action logic yet — this phase only makes later
  phases possible to build without ad-hoc dependency choices.

## Phase 3 — DOM/accessibility extraction + Layers 1–2 PII detection

- Implement DOM/accessibility-tree extraction per `docs/DOM_PERCEPTION.md`
  (type, autocomplete, ARIA, geometry, visibility, form relationships).
- Implement Layer 1 (typed-field) and Layer 2 (regex/string) detection per
  `docs/PII_DETECTION.md`. No ML, no vision model in this phase.
- Deliverable: given a live page, produce the common detector-output
  structure for every relevant element, zero-inference-cost only.

## Phase 4 — Redaction pipeline (structured/placeholder mode) + sanitized context assembly

- Implement placeholder substitution (`[EMAIL]`, `[PASSWORD]`, etc.) for
  DOM-text-mode redaction, per `docs/REDACTION_PIPELINE.md`.
- Resolve the open bounding-box/coordinate-system, clipping, and
  compositing-order questions flagged as deferred-to-Phase-4 in
  `docs/REDACTION_PIPELINE.md`.
- Assemble the sanitized structured-metadata context object per
  `docs/SANITIZED_CONTEXT_PROTOCOL.md` (text-only path; no screenshots yet).
- Deliverable: a redacted, structured-metadata context object producible
  end-to-end from a live DOM-only page.

## Phase 5 — Action schema + client-side action validator

- Implement the action schema from `docs/ACTION_PROTOCOL.md`.
- Implement the full validator check sequence from
  `docs/ACTION_VALIDATOR.md`, including the sensitive-pattern confirmation
  gate, run against a stub/mock action source initially (no real server
  yet) so the validator can be built and tested in isolation before
  anything is trusted to drive it.
- This phase is intentionally built **before** any real server exists —
  per `AGENTS.md` §6, nothing executes an unvalidated action, including
  during development.

## Phase 6 — Minimal server-side reasoning stub

- A minimal server (rule-based or a single real LLM/VLM call) that accepts
  the Phase 4 sanitized context and returns a schema-conformant action.
- Wire Phase 3 → 4 → 6 → 5 (validator) → execution together for DOM-only
  pages. This is the first genuinely end-to-end slice.
- Deliverable: the system can complete a simple task (e.g. fill and submit
  a non-sensitive form field) on a Category 1 synthetic page, fully
  validated, with no vision model involved.

## Phase 7 — Prompt-injection defense + first injection test page

- Implement `docs/PROMPT_INJECTION_DEFENSE.md` layers 1–2 (hidden-DOM
  stripping, structural data/instruction separation in the server prompt).
- Author the first Category 5 synthetic injection page
  (`docs/SYNTHETIC_DATASET_PLAN.md`) and run it through the Phase 6 pipeline
  to confirm the validator (built in Phase 5) actually rejects the induced
  action — this is Experiment 5 run for the first time, informally.

## Phase 8 — Synthetic dataset construction

- Build out the full dataset per `docs/SYNTHETIC_DATASET_PLAN.md`,
  Categories 1–6, with ground-truth annotation files.

## Phase 9 — Evaluation harness

- Automate PII precision/recall and redaction-precision scoring against
  Phase 8 ground truth, per `docs/EVALUATION_PLAN.md`.
- First real (not `[DESIGN ESTIMATE]`) numbers for two of the five
  weighted criteria become available here, DOM-only scope.

## Phase 10 — Latency/resource measurement harness (DOM-only baseline)

- Instrument the Phase 6 pipeline per `docs/LATENCY_AND_RESOURCE_MODEL.md`'s
  dimensions, establishing the DOM-only baseline before vision is added —
  this baseline is what the flagship experiment will later be compared
  against.

## Phase 11 — Layer 3 visual/face detection + visual redaction

- Implement face detection and image-region redaction (blur/solid-fill)
  per `docs/PII_DETECTION.md` Layer 3 and `docs/REDACTION_PIPELINE.md`.
- Still no general vision-understanding model (block H) yet — this is the
  narrower, mature-CV-task detector only.

## Phase 12 — Local vision model integration (block H, WASM path)

- Select, quantize (INT8), and integrate a MobileViT/EfficientViT-class
  model via Transformers.js/ONNX Runtime Web, WASM runtime, per
  `docs/VISION_PIPELINE.md`.
- Deliverable: block H can run, unconditionally invoked for now — gating
  logic is the next phase, kept separate so the raw model behavior can be
  validated on its own first.

## Phase 13 — DOM-gated vision invocation logic

- Implement the conditional-invocation logic (block H fires only when DOM
  extraction cannot explain a region) per `docs/VISION_PIPELINE.md` and
  `docs/SYSTEM_ARCHITECTURE.md`.

## Phase 14 — Flagship experiment: DOM-gated vs. unconditional vision

- Run Experiment 1 (`docs/EXPERIMENT_PLAN.md`) for real, across the full
  Phase 8 dataset, and Experiment 2 (DOM-only vs. screenshot-only
  baseline).
- Deliverable: a documented, measured result — reported as-is, including a
  null result if that's what the data shows.

## Phase 15 — WebGPU path + fallback chain

- Implement WebGPU opportunistic execution and the full fallback chain
  (`docs/FALLBACK_STRATEGY.md`).
- Run Experiment 3 (WASM vs. WebGPU) and validate graceful degradation by
  force-disabling each capability tier in turn.

## Phase 16 — Full evaluation run + stretch-goal VLM attempt

- Run all five `docs/EVALUATION_PLAN.md` criteria end-to-end across the
  full dataset, on the DOM-only and vision-gated paths.
- Attempt the SmolVLM/MiniCPM-V-class stretch goal (`docs/VISION_PIPELINE.md`
  Experiment 4); document the outcome either way, including failure.

## Phase 17 — Demo integration

- Build the visible debug panel and the end-to-end demo scenario described
  in `docs/MASTER_CONTEXT.md` ("Demo objective"): raw local state → privacy
  filter → sanitized context → server reasoning → action validator →
  execution, on a page that includes a hidden prompt-injection attempt that
  is visibly, correctly rejected live.
- Final packaging: confirm every claim made in the demo traces to a Phase
  9/10/14/16 measured result, not a `[DESIGN ESTIMATE]` or unmeasured
  design claim.

## Cross-cutting, ongoing across all phases

- `docs/AGENTS.md` evidence discipline applies to every commit: no new
  claim enters `docs/` without a tag.
- Small, scoped commits per `AGENTS.md` §5.
- Redaction-leak audit (Experiment 6) is re-run whenever the redaction
  pipeline changes, not just once.

## Relationship to other docs

Every phase above cites the document that specifies what it builds; this
roadmap only sequences them. See `docs/MASTER_CONTEXT.md` for the
architecture those phases assemble, and `AGENTS.md` for the process rules
governing how each phase is executed.
