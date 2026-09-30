# Latency and Resource Model

Source: research doc §7a Row 1 (`[A]`), §36, §42, synthesizing
`docs/VISION_PIPELINE.md` and `docs/SYSTEM_ARCHITECTURE.md`.

## Why this document exists separately from the evaluation plan

`docs/EVALUATION_PLAN.md` defines *how latency and resource usage are
scored* against the SIH weighting (20% resource, 15% latency). This
document defines the *budget and the mechanism* — where time and memory are
expected to go in the pipeline, and what levers exist to control them. It
is a design/engineering document; every number in it is either sourced
directly from `[A]` evidence or explicitly marked `[DESIGN ESTIMATE]`.

## The one hard evidence point this budget is built around

`[A]` (Zhang et al. 2024, ACM TOSEM, research doc §7a Row 1): in-browser
inference measured **16.9× (CPU) / 30.6× (GPU) average slowdown** vs.
native inference, with device-to-device variance up to 28.4×/19.4×. This is
the reason the architecture treats any on-device ML invocation (block E2,
block H in `docs/SYSTEM_ARCHITECTURE.md`) as the dominant, variable cost in
the pipeline, and why DOM-first gating exists at all — not as an
unsubstantiated optimization, but as a direct response to a measured
multiplier.

## Pipeline stages and their expected cost profile

| Stage | Expected cost driver | Evidence status |
|---|---|---|
| DOM/accessibility extraction (blocks B–C) | Near-zero; native browser APIs | `[B][TECH-DOC]` |
| Layer 1–2 PII detection (typed-field + regex) | Near-zero; string/attribute checks | `[B][TECH-DOC]`+`[C]` |
| Layer 3 visual/face detection | Small, mature CV task, but still an ML invocation subject to the Row-1 multiplier | `[C]` |
| Redaction (mask/blur/placeholder) | Small, pixel-op or string-op scale | `[C]` |
| Local vision model (block H, when gated in) | **Dominant cost** — subject directly to the 16.9×/30.6× multiplier, and to model size | `[A]`+`[C]`, **must be measured**, see `docs/EXPERIMENT_PLAN.md` |
| Sanitized-context serialization + network transmission | Small for structured metadata; larger and more variable for sanitized-screenshot mode | `[C]` |
| Server reasoning | Outside the client resource budget by definition (`docs/SYSTEM_ARCHITECTURE.md` system boundaries) | N/A to this document |
| Action validation + execution | Near-zero; DOM lookups and comparisons | `[C]` |

`[DESIGN ESTIMATE]`: nothing in this table's "expected" column should be
quoted to judges as a millisecond or MB figure until
`docs/EXPERIMENT_PLAN.md` produces a measured number. This table describes
*where* cost is expected to concentrate, not *how much*.

## Runtime levers available to control cost

- **DOM-gating (block H conditionality)** — the primary lever; the entire
  point of the flagship experiment in `docs/EXPERIMENT_PLAN.md` is
  quantifying how much this lever actually saves.
- **Quantization** — INT8 as the mandatory MVP baseline for any on-device
  model above a few million parameters (`[TECH-DOC]`, `docs/VISION_PIPELINE.md`).
  INT4 is a stretch goal requiring its own runtime-support validation before
  being adopted, not assumed to work.
- **Runtime path** — WASM as the default (universal, near-native CPU
  throughput per `[TECH-DOC]`), WebGPU as an opportunistic upgrade when
  feature-detected, never a hard requirement (`docs/VISION_PIPELINE.md`,
  `docs/FALLBACK_STRATEGY.md`).
- **Model size class** — MobileViT/EfficientViT-class, 5–25M params, is the
  `[C]`-reasoned candidate range; this is a target range to validate
  experimentally, not a committed figure.
- **Transmission mode** — structured metadata by default avoids the
  bandwidth/serialization cost of sanitized screenshots entirely wherever
  DOM extraction suffices (`docs/SANITIZED_CONTEXT_PROTOCOL.md`).

## Resource dimensions to be measured (per `docs/EVALUATION_PLAN.md`)

- Wall-clock latency per pipeline stage and end-to-end (perception →
  sanitized context ready).
- Peak and sustained memory footprint of the loaded on-device model(s).
- CPU utilization during DOM-only operation vs. during vision invocation.
- GPU utilization on the WebGPU path where available.
- Network payload size, structured-metadata mode vs. sanitized-screenshot
  mode.

## What this document does not do

It does not report benchmark numbers — none exist yet. It does not assume
the DOM-gating lever "obviously" helps; that is exactly the hypothesis
`docs/EXPERIMENT_PLAN.md` exists to test, and a null or negative result
(gating adds overhead without saving enough to matter on some device class)
is an acceptable, reportable outcome, not a failure of this document.

## Relationship to other docs

- The evidence this budget is built on: `docs/VISION_PIPELINE.md`
- How measurements here feed the scored criteria: `docs/EVALUATION_PLAN.md`
- The actual benchmark protocol: `docs/EXPERIMENT_PLAN.md`
- What happens when a runtime path is unavailable: `docs/FALLBACK_STRATEGY.md`
