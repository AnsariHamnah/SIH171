# PII Detection

Source: research doc §17, §21–27, §42 technology matrix.

## Layered architecture (progressive activation — not all layers implemented at once)

| Layer | Method | Status for MVP |
|---|---|---|
| 1 | Deterministic DOM detection (`type`, `autocomplete`, ARIA) | Must Have — zero inference cost, `[B][TECH-DOC]` |
| 2 | Regex/string detection on DOM text | Must Have — covers common patterns (phone, email format) |
| 3 | Visual detection (face detection on video/image regions) | Must Have — mature, cheap CV task even in non-qualifying literature |
| 4 | OCR/NER (text-in-image, named entities) | **Do Not Build Yet** — gated on whether the demo scenario includes document/ID-photo uploads or canvas-rendered dashboards (`[D]`, §17, §25) |

Each detector returns a common structure (per master implementation spec):

```
{
  type,        // e.g. "email", "password", "face", "government_id"
  source,      // which layer/detector produced this
  confidence,
  region,      // DOM element ref or bounding box
  reason,
  severity
}
```

**Confidence must never be treated as proof of privacy.** A high-confidence
"not sensitive" result is not a license to skip redaction if any other
signal disagrees — see the over-redaction principle below.

## Layer 1 — DOM/typed-field detection (`[B][TECH-DOC]` + `[C]`)

Covers passwords, emails, credit-card fields, and phone fields at
effectively zero false-negative rate **for fields that declare their type
correctly**. Failure mode: mislabeled or custom-styled fields (a `<div>`
styled as a password box) — pushes detection to Layer 3/4.

## Layer 3 — Visual/face detection (`[D]`, §21–27)

Runs whenever the screen contains a video/image region (video calls, profile
photos, ID-card uploads). Named-entity-style visual PII (a name printed on a
photographed ID card) needs OCR + NER, not face detection — these are two
different pipelines and must not be conflated.

## Layer 4 — OCR/NER: explicitly deferred

Not needed for the MVP's primary target (standard web-app forms and
dashboards, where nearly everything sensitive is DOM text or a labeled
input). Becomes necessary only if the demo scenario includes
document/ID-photo upload flows or canvas-rendered dashboards. Listed as
"Should Have," gated on the final demo scenario (`docs/MASTER_CONTEXT.md`
open questions).

## Precision/recall trade-off — the central design principle

- **False-positive redaction** (a non-sensitive region blacked out, e.g. a
  product price misread as a phone number): cost is usability/accuracy loss,
  not a privacy incident.
- **False-negative redaction** (sensitive content leaves the device
  unredacted): cost is an actual privacy breach.

`[D]` Design principle: **tune every detector to prefer over-redaction
(higher recall, lower precision) rather than under-redaction**, explicitly
trading the 20%-weighted "redaction precision" evaluation score against a
much worse privacy failure mode. State this to judges as a deliberate,
evidence-aware trade-off, not an oversight (§27).

## Relationship to other docs

- What happens once something is flagged: `docs/REDACTION_PIPELINE.md`
- What gets measured and how: `docs/EVALUATION_PLAN.md`
- Test data with known ground truth: `docs/SYNTHETIC_DATASET_PLAN.md`
