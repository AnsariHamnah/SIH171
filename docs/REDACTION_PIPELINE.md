# Redaction Pipeline

Source: research doc §21–27 (Rows 2–3, `[A]`), master implementation spec.

## Core decision: irreversible redaction only

`[A]` Rows 2–3 (§7a) document an active research tension between reversible
(password-conditioned, cryptographic-key-based, GAN-based) and irreversible
face de-identification. Reversible schemes exist because researchers want to
*recover* the original later — for a privacy-preserving agent, that
recoverability is a **liability**, not a feature. The server must never be
able to reconstruct the original face or field value.

`[D]` MVP decision: **irreversible redaction only** — Gaussian blur or
solid-fill bounding box over detected face/PII regions. Reversible/GAN-based
schemes are explicitly rejected even though they appear more sophisticated
in the literature (§26).

## Redaction primitives

- Solid fill (bounding box)
- Gaussian blur
- Pixelation — optional, only if solid fill/blur prove insufficient for a
  specific case; not committed to yet
- Text-value placeholder substitution (`[EMAIL]`, `[PASSWORD]`) for
  structured-metadata mode — this is not a visual redaction at all, it's the
  DOM-path equivalent (see `docs/SANITIZED_CONTEXT_PROTOCOL.md`)

## What still needs specification (open, not yet decided)

- Exact bounding-box coordinate system and padding conventions.
- Clipping behavior at element/viewport edges.
- Compositing order when multiple redaction regions overlap.

These are implementation details for Phase 4 (`docs/IMPLEMENTATION_ROADMAP.md`),
not architectural decisions — recorded here as open so Phase 4 doesn't have
to rediscover them.

## Output validation — the critical guarantee

**After redaction, the system must not accidentally transmit the original
image buffer.** Visual appearance of a redacted region is not sufficient
proof of safety — the pipeline must produce an explicit sanitized output
object (structured data, not "a canvas that looks blurred"), and that
object, not the original buffer, is what's eligible for transmission. This
is the concrete mechanism behind the "structured metadata preferred over
pixels" principle in `docs/PRIVACY_ARCHITECTURE.md`.

## Precision/recall asymmetry

Same principle as `docs/PII_DETECTION.md`: false-negative redaction (a
sensitive region left unredacted) is a privacy breach; false-positive
redaction (something non-sensitive gets blacked out) is a usability cost.
Detectors and the redaction pipeline are both tuned to prefer over-redaction
(§27).

## Relationship to other docs

- What triggers a redaction: `docs/PII_DETECTION.md`
- What the sanitized output actually looks like on the wire:
  `docs/SANITIZED_CONTEXT_PROTOCOL.md`
- How redaction precision gets measured: `docs/EVALUATION_PLAN.md`
