# Fallback Strategy

Source: research doc §42, synthesizing `docs/VISION_PIPELINE.md`,
`docs/PRIVACY_ARCHITECTURE.md`, `docs/SYSTEM_ARCHITECTURE.md`.

## The governing rule

**A failure anywhere in the privacy layer must result in "do not send,"
never in falling back to raw data transmission.** This rule, stated in
`docs/PRIVACY_ARCHITECTURE.md`, is the one fallback rule in this project
that has no degraded mode — every other fallback chain below exists
precisely so that a *capability* failure (no WebGPU, model won't load) is
absorbed without ever forcing a *privacy* failure.

## Runtime capability fallback chain (block H, local vision)

```
WebGPU (opportunistic, feature-detected)
   │  not available / fails to initialize
   ▼
WASM (default, universal per [TECH-DOC])
   │  model fails to load / inference errors / exceeds resource budget
   ▼
DOM-only perception (block H skipped entirely)
   │  DOM extraction itself cannot describe the region with confidence
   ▼
Safe failure: region treated as unknown/sensitive by default,
redacted or excluded from the sanitized context — never guessed at
```

- **WebGPU → WASM:** `[D]`/`[TECH-DOC]` — consistent with
  `docs/VISION_PIPELINE.md`'s "WASM default, WebGPU opportunistic" runtime
  decision. This step is a performance fallback, not a safety one; either
  path produces the same sanitized-context contract.
- **WASM → DOM-only:** if the local vision model cannot be loaded or run at
  all (unsupported device, memory pressure, load failure), the system does
  not attempt a degraded or partial vision pass. It falls back to whatever
  DOM extraction alone can describe for that region, consistent with the
  DOM-first principle (`docs/DOM_PERCEPTION.md`).
- **DOM-only → safe failure:** if DOM extraction *also* cannot describe a
  region with confidence (e.g. a canvas region with no vision model
  available to fall back on), the region is treated as unknown, and unknown
  is treated as sensitive by default. It is either fully redacted/excluded
  from the sanitized context or the affected interactive elements are
  excluded from the action space entirely — never passed through
  unredacted on the theory that "the detector didn't confirm anything is
  there."

## Why "unknown" resolves to "sensitive," not "safe"

Directly consistent with the over-redaction design principle in
`docs/PII_DETECTION.md`: a false-positive redaction costs usability, a
false-negative costs privacy. The fallback chain inherits this asymmetry —
every fallback step degrades capability, never the strictness of the
privacy default.

## Network/server fallback

If the server is unreachable or returns an unparseable response, no action
is executed — this is not a distinct fallback chain so much as a
restatement that `docs/ACTION_VALIDATOR.md` has nothing to validate and
therefore nothing executes. There is no "assume a safe default action";
absence of a valid, validated action means no action.

## Detection-layer fallback (within `docs/PII_DETECTION.md`)

Already specified per-layer in `docs/PII_DETECTION.md` and restated here
for completeness of the fallback picture: Layer 1 (typed-field) misses a
mislabeled field → falls through to Layer 3 (visual). If Layer 3 is itself
unavailable (see runtime chain above), the field is treated as unknown per
the rule above, not silently passed through as non-sensitive.

## What is explicitly not a fallback in this project

- There is no "ask the server to do the privacy filtering instead." The
  client is the enforcement point (`docs/PRIVACY_ARCHITECTURE.md`) and this
  is not something a fallback chain is allowed to route around.
- There is no "send raw pixels this one time because the structured path
  failed." Structured-metadata-preferred is a default with a documented
  exception (canvas/non-DOM regions, still sanitized) — it is not a
  fallback target itself in the failure sense.

## Status

`[D]` Chain specified here. `[E]` Actual graceful-degradation behavior
(what happens live when WebGPU is force-disabled, when the model fails to
load, etc.) is validated experimentally in Experiment 3
(`docs/EXPERIMENT_PLAN.md`) and exercised in the Phase 15 fallback-chain
implementation (`docs/IMPLEMENTATION_ROADMAP.md`).

## Relationship to other docs

- The invariant this chain protects: `docs/PRIVACY_ARCHITECTURE.md`
- The runtime options being chosen between: `docs/VISION_PIPELINE.md`
- The detection layers this interacts with: `docs/PII_DETECTION.md`
- Where this is tested: `docs/EXPERIMENT_PLAN.md`
