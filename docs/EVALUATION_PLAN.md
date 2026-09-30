# Evaluation Plan

Source: research doc §2, §46, §48, synthesizing `docs/PROBLEM_STATEMENT.md`,
`docs/PII_DETECTION.md`, `docs/REDACTION_PIPELINE.md`,
`docs/LATENCY_AND_RESOURCE_MODEL.md`.

## Fixed weights (restated here per project convention — do not reinterpret)

| Criterion | Weight |
|---|---|
| Visual context accuracy | 25% |
| PII precision/recall | 20% |
| Redaction precision | 20% |
| Client resource utilization | 20% |
| End-to-end latency | 15% |

## Per-criterion methodology

### Visual context accuracy — 25%

- **What it measures:** correctness of the perception layer's understanding
  of the screen state — DOM-derived and, when block H fires, vision-derived
  — against a hand-labeled ground truth for each synthetic test page
  (`docs/SYNTHETIC_DATASET_PLAN.md`).
- **Method:** for each test page, compare the system's structured
  perception output (element roles, labels, sensitivity flags) against the
  ground-truth annotation. Report as accuracy/F1 per element-role category,
  not a single blended number, so DOM-path and vision-path accuracy can be
  told apart.
- **`[E]`** — no accuracy figure exists yet; this is a to-be-measured
  criterion, not a design claim.

### PII precision/recall — 20%

- **What it measures:** how correctly Layers 1–3 (`docs/PII_DETECTION.md`)
  identify sensitive elements/regions against ground-truth PII labels in
  the synthetic dataset.
- **Method:** standard precision/recall/F1 per PII type (`email`,
  `password`, `phone`, `credit_card`, `government_id`, `face`), reported
  separately per detection layer so a Layer-1 (DOM-typed) result isn't
  conflated with a Layer-3 (visual) result.
- **Design principle carried over from `docs/PII_DETECTION.md`:** recall is
  weighted as the more important half of this score deliberately — a
  missed detection is a privacy breach, a false positive is a usability
  cost. This trade-off is disclosed to judges as intentional, not treated
  as a limitation to apologize for.

### Redaction precision — 20%

- **What it measures:** given a correctly-flagged sensitive region, did the
  redaction pipeline (`docs/REDACTION_PIPELINE.md`) actually and completely
  obscure it, with no residual raw pixel or raw value transmitted.
- **Method:** for every region the detector flagged sensitive, verify (a)
  the sanitized output object contains no raw value/pixel data for that
  region, and (b) redaction coverage of the flagged bounding box is
  complete, not partial. This is measured as a binary pass/fail per region,
  aggregated to a precision score, plus a hard-fail count for any leak
  found (a leak is reported explicitly, never averaged away in an aggregate
  number).

### Client resource utilization — 20%

- **What it measures:** CPU/memory/GPU load on the client during operation,
  per the dimensions listed in `docs/LATENCY_AND_RESOURCE_MODEL.md`.
- **Method:** instrumented runs across the synthetic dataset, DOM-only
  pages and vision-required pages measured separately, on at least one
  representative low/mid-spec device profile in addition to the
  development machine, given the device-variance finding (`[A]`,
  28.4×/19.4× variance) that makes single-device numbers potentially
  misleading.

### End-to-end latency — 15%

- **What it measures:** wall-clock time from screen-state change to
  executed action, broken down by pipeline stage
  (`docs/LATENCY_AND_RESOURCE_MODEL.md`).
- **Method:** measured separately for the DOM-only path and the
  vision-gated path, since the entire point of the flagship experiment
  (`docs/EXPERIMENT_PLAN.md`) is showing that gap.

## Aggregate scoring

Overall score = weighted sum of the five criteria above using the fixed
weights. No criterion is dropped, re-weighted, or substituted with a proxy
metric without being disclosed as a deviation from the stated evaluation
scheme (`docs/PROBLEM_STATEMENT.md`).

## Reporting discipline

- Every number reported under this plan must trace to an actual run logged
  under `docs/EXPERIMENT_PLAN.md`. `[DESIGN ESTIMATE]` figures are never
  substituted into a scored result.
- Where a criterion cannot yet be measured (e.g. block H not implemented
  yet), the plan reports that criterion as **not yet measured**, not as an
  assumed or interpolated score.
- The known thin-evidence-base limitation (`docs/MASTER_CONTEXT.md`) is
  presented alongside results, not omitted.

## Relationship to other docs

- Ground truth source: `docs/SYNTHETIC_DATASET_PLAN.md`
- How measurements are actually produced: `docs/EXPERIMENT_PLAN.md`
- The resource/latency budget being scored against:
  `docs/LATENCY_AND_RESOURCE_MODEL.md`
- The fixed weights' origin: `docs/PROBLEM_STATEMENT.md`
