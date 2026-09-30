# Privacy Architecture

Source: research doc §28–31, §45.2.

## The invariant

**Raw sensitive data must not leave the client.** This is the single
hard requirement the rest of this document exists to enforce.

## What never leaves the device

- Raw screenshot pixels of any region flagged sensitive by the local filter.
- Raw DOM values of fields typed/classified as password, financial,
  government-ID, or biometric.
- Any face region prior to blurring/masking.
- Local model weights/activations (stated for completeness of the boundary).

## What may leave the device

- A **structured description** — DOM tree fragment, element roles, bounding
  boxes, with sensitive text values replaced by type placeholders
  (`[EMAIL]`, `[PASSWORD]`) — **preferred by default** wherever DOM
  extraction is sufficient to describe a region (`[D]`, §17, §29).
- A sanitized (post-redaction) screenshot, **only** for canvas/non-DOM
  regions the local filter could not otherwise describe as structured
  metadata.

### Why structured metadata is the default, not sanitized pixels

Sending structured metadata instead of a sanitized image is strictly less
risky: no residual pixel information can leak through imperfect blur, because
there are no pixels to leak. This is design decision `[D]`, directly
motivated by the zero-inference-cost DOM argument in §17, and is novelty
claim #2 in `docs/MASTER_CONTEXT.md` — it inverts the implicit assumption in
most existing visual-PII work that the image itself must be sent.

## Enforcement point

The **client** is the enforcement point, not the server. The server is never
trusted to discard, ignore, or "promise not to log" anything it receives —
if raw sensitive data reaches the server, the boundary has already failed on
the client side. See `docs/THREAT_MODEL.md` for the full threat table.

## Relationship to other docs

- Detection of what counts as sensitive: `docs/PII_DETECTION.md`
- How redaction is actually applied: `docs/REDACTION_PIPELINE.md`
- What crosses the wire, exact shape: `docs/SANITIZED_CONTEXT_PROTOCOL.md`
- What happens when the privacy layer itself fails or is uncertain:
  `docs/FALLBACK_STRATEGY.md` — the rule is **fail closed** (do not send),
  never fail open.

## Explicitly out of scope for this MVP

- Cross-tab / cross-session privacy state tracking (real problem, out of
  scope for a hackathon MVP, per research doc §47).
- Extension supply-chain / self-integrity protection — a malicious update to
  the extension itself is a real threat, explicitly flagged as unsolved and
  out of scope, not silently ignored (`[F]`, §28 threat table).
