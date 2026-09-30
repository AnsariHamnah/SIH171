# Action Protocol

Source: research doc §18–20, §32.

## MVP actions

`click`, `fill`, `scroll`, `focus`, `select`

## Potential future actions (not MVP)

`navigate`, `keypress`, `hover`

## Schema

`[D]` Minimal schema, consistent with the DOM-selector-primary decision
below:

```json
{ "action": "click", "selector": "#submit-btn" }
{ "action": "fill", "selector": "#email", "value_ref": "[EMAIL_FIELD_1]" }
{ "action": "scroll", "direction": "down", "amount_px": 400 }
```

Every action carries:
- `action` — the action type
- `target` — selector or stable local element ID
- `parameters` — action-specific data
- `reasoning_id` — traceability back to the server reasoning step
- safety metadata, where required (e.g. for sensitive-pattern actions — see
  `docs/ACTION_VALIDATOR.md`)

## `value_ref`, not a raw value

For anything derived from a sanitized field, the server returns a
**reference** to client-known data (`value_ref`), never a literal value it
was never shown. This is a direct architectural consequence of the privacy
boundary (`docs/PRIVACY_ARCHITECTURE.md`), not a separate research claim —
the server cannot leak what it never received.

`[TECH-DOC]` JSON-schema-constrained decoding (well-documented, supported by
most current LLM/VLM serving stacks) should be used server-side to guarantee
the action always parses. Implementation choice, not a citation-requiring
claim.

## Selector strategy: DOM-selector primary, coordinates fallback only

`[D]` (research doc §18–20): coordinate-based actions (`click(x,y)`) are
simpler for the server to emit but brittle to layout shifts, and require the
server to receive precise pixel geometry — a privacy leak vector, since
geometry can itself be identifying in combination with content.
DOM-selector-based actions require the client to resolve the selector
locally, are more robust to minor layout change, and let the server operate
on structure, never on raw coordinates.

**Recommendation: DOM-selector actions as primary, coordinate fallback only
for canvas regions with no DOM selector available.**

## Relationship to other docs

- What actually checks these actions before execution:
  `docs/ACTION_VALIDATOR.md`
- Why the server can't be trusted to only emit safe actions:
  `docs/THREAT_MODEL.md`, `docs/PROMPT_INJECTION_DEFENSE.md`
