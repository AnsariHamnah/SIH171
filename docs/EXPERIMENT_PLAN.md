# Experiment Plan

Source: research doc §36, §41, §45.1, synthesizing `docs/VISION_PIPELINE.md`,
`docs/DOM_PERCEPTION.md`, `docs/LATENCY_AND_RESOURCE_MODEL.md`,
`docs/PROMPT_INJECTION_DEFENSE.md`.

## Experiment 1 (flagship) — DOM-gated vs. unconditional vision invocation

- **Novelty claim #1** (`docs/MASTER_CONTEXT.md`): no journal-tier
  literature comparison of these two invocation strategies was found
  (`[F]`, §45.1) — this repo's own measurement is the contribution, not an
  assumed result.
- **Condition A:** vision model (block H) invoked unconditionally on every
  perception cycle, regardless of what DOM extraction could already
  explain.
- **Condition B:** vision model invoked only when DOM extraction
  (`docs/DOM_PERCEPTION.md`) cannot explain a region's sensitive/interactive
  state (current architectural default).
- **Independent variable:** invocation strategy (A vs. B).
- **Dependent variables:** end-to-end latency per page, PII recall per
  page, CPU/memory utilization per page (all per
  `docs/LATENCY_AND_RESOURCE_MODEL.md` dimensions).
- **Test corpus:** the synthetic dataset (`docs/SYNTHETIC_DATASET_PLAN.md`),
  stratified into DOM-sufficient pages (standard HTML forms) and
  DOM-insufficient pages (canvas-rendered content, custom-styled fields) so
  the comparison isn't dominated by one page type.
- **Reporting:** raw measured numbers, per-page and aggregated, with device
  used disclosed given the known device-variance finding (`[A]`, Row 1). A
  result where gating doesn't help, or helps less than expected, is
  reported as-is — not adjusted toward the expected direction.

## Experiment 2 — DOM-only vs. screenshot-only baseline

- Per `docs/DOM_PERCEPTION.md`'s `[E]` flag: the DOM-first design decision
  is not proven optimal by prior literature and requires its own
  benchmark.
- **Condition A:** perception restricted to DOM/accessibility extraction
  only (no vision model at all).
- **Condition B:** perception restricted to screenshot + vision model only
  (no DOM extraction).
- **Dependent variables:** visual context accuracy (against ground truth),
  PII recall, latency.
- **Purpose:** establishes the two single-strategy baselines that
  Experiment 1's hybrid (gated) approach is meant to beat on at least one
  axis (accuracy or latency) without regressing badly on the other.

## Experiment 3 — WASM vs. WebGPU runtime path

- **Condition A:** forced WASM execution.
- **Condition B:** WebGPU execution where feature-detected as available.
- **Dependent variables:** latency, resource utilization.
- **Purpose:** quantifies the WebGPU upgrade's actual benefit
  (`docs/VISION_PIPELINE.md` frames this as opportunistic, not required) and
  validates the fallback chain in `docs/FALLBACK_STRATEGY.md` actually
  degrades gracefully rather than just theoretically.

## Experiment 4 — Model candidate benchmarking

- Benchmarks the MobileViT/EfficientViT-class candidate (Must Have) and, as
  time allows, the SmolVLM/MiniCPM-V-class stretch candidate
  (`docs/VISION_PIPELINE.md`), both quantized to INT8 ONNX, on the
  synthetic dataset.
- **Dependent variables:** accuracy, latency, memory footprint.
- **On the stretch goal specifically:** per `docs/VISION_PIPELINE.md`, no
  browser-specific WebGPU deployment evidence exists for this model class
  (`[F]`) — a documented failure (model doesn't fit budget, doesn't run
  reliably via WebGPU, etc.) is recorded as a valid, reportable result, not
  suppressed for looking bad.

## Experiment 5 — Prompt-injection defense validation

- **Setup:** the self-crafted DOM-hidden-instruction test page from
  `docs/SYNTHETIC_DATASET_PLAN.md`, containing a hidden element instructing
  the reasoning step toward a sensitive action (e.g. submitting a payment
  form).
- **Measured outcome:** whether the hidden instruction (a) is stripped
  before reaching the reasoning step (`docs/PROMPT_INJECTION_DEFENSE.md`
  layer 1), and, if it is not, (b) whether the resulting action is
  correctly rejected by `docs/ACTION_VALIDATOR.md`. Both layers are tested
  independently — layer 1 disabled to specifically stress-test the
  validator as the last line of defense.
- **Reporting:** pass/fail per layer, not a single blended "injection
  resistant: yes/no" claim.

## Experiment 6 — Redaction leak audit

- Runs the output-validation check from `docs/REDACTION_PIPELINE.md`
  ("must not accidentally transmit the original image buffer") against
  every sanitized-context output produced during the other experiments, as
  a cross-cutting audit rather than a standalone test — checks for any raw
  pixel/value leak, with any single leak treated as a critical finding
  requiring a fix before the redaction-precision score in
  `docs/EVALUATION_PLAN.md` is reported.

## General experimental discipline

- Every experiment logs: device/hardware profile, browser + version,
  runtime path (WASM/WebGPU), dataset subset used, and raw per-run numbers
  — not just aggregates — so results are reproducible and auditable.
- No experiment's expected result is stated in this document as if already
  known; expected direction (where stated in prose elsewhere, e.g. "gating
  should reduce latency") is a hypothesis under test, not a predetermined
  conclusion.
- `[DESIGN ESTIMATE]` numbers used for planning (e.g. sizing the synthetic
  dataset, picking initial device targets) are never substituted for actual
  experimental output in a results write-up.

## Relationship to other docs

- What's being measured and why it matters for scoring:
  `docs/EVALUATION_PLAN.md`
- The budget/levers under test: `docs/LATENCY_AND_RESOURCE_MODEL.md`
- The data these experiments run against: `docs/SYNTHETIC_DATASET_PLAN.md`
- Where in the build sequence these experiments happen:
  `docs/IMPLEMENTATION_ROADMAP.md`
