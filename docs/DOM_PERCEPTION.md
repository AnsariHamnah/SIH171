# DOM Perception

Source: research doc §17 (DOM/accessibility tree, `[B][TECH-DOC]`), §18–20
(`[D]` primary-signal decision).

## Why DOM-first

The browser already exposes, at zero inference cost: full DOM text content,
ARIA roles/labels, input `type` attributes (`type="password"`,
`type="email"`, `type="tel"`), `autocomplete` hints, and computed layout
geometry (`getBoundingClientRect()`). A large fraction of "visual PII
detection" is therefore a solved, zero-ML problem for standard HTML forms —
a `type="password"` field can be masked with effectively 100% precision
without any vision model at all. Vision/OCR is needed only for
canvas-rendered content, images containing text, and screenshots displayed
within the page.

`[D]` Design decision (§18–20): treat DOM extraction as the **primary**
perception signal and the vision model as a **fallback/supplement** for what
DOM cannot explain. This is not proven optimal by a journal paper — it is a
design choice justified by the zero-cost precision argument above, and it
requires benchmarking against a screenshot-only baseline in our own
prototype (`[E]`, see `docs/EXPERIMENT_PLAN.md`).

## What is inspected

- `type` attribute (`password`, `email`, `tel`, etc.)
- `autocomplete` attribute (e.g. `cc-number`)
- `aria-label`
- `role`
- `name`
- Text content
- Visibility (`display`, `visibility`, opacity, off-screen position)
- Geometry (bounding box via `getBoundingClientRect()`)
- Disabled state
- Form relationship (which `<form>` an element belongs to)
- Semantic labels (associated `<label>` elements, `aria-labelledby`)

## What is collected

Structural and typed metadata for every visible, in-viewport (and
explicitly-flagged off-screen/hidden, for injection-filtering purposes —
see `docs/PROMPT_INJECTION_DEFENSE.md`) interactive and content element:
role, label, type, geometry, sensitivity classification.

## What is discarded

Raw text content of elements not relevant to the current task or privacy
classification (kept minimal — this is not a full-page scrape).

## What is sanitized

Any field classified sensitive (by type, autocomplete hint, or regex match —
see `docs/PII_DETECTION.md`) has its value replaced with a type placeholder
(`[EMAIL]`, `[PASSWORD]`) before it enters the sanitized context.

## What is never transmitted

Raw values of password/financial/government-ID/biometric-typed fields, under
any circumstance. See `docs/PRIVACY_ARCHITECTURE.md`.

## Known failure mode

Regex/typed-metadata detection cannot catch a mislabeled or custom-styled
field — a `<div>` styled to look like a password box declares no `type`
attribute and pushes detection back to the vision path (`[C]`, §21–27).

## DOM vs. vision vs. hybrid (engineering synthesis, `[C]`, §18–20)

| Approach | Grounding precision | Coverage | Privacy cost |
|---|---|---|---|
| DOM-only | Highest (exact selectors) | Fails on canvas/Flash-like/custom-rendered UIs | Cheapest — sensitive fields are typed metadata, not pixels |
| Screenshot-only | Lower (inferred from pixels) | Most general, works on any UI | Highest — sensitivity must be inferred from pixels |
| Hybrid (this project) | High where DOM applies | DOM gives cheap, precise redaction signals that gate what the vision model is even allowed to see | Moderate, structured-metadata-preferred |

No journal paper was found specifically on browser/GUI agents comparing
these approaches (`[F]`, §18–20) — this table is an engineering synthesis of
non-qualifying conference/preprint literature, not itself research evidence.
