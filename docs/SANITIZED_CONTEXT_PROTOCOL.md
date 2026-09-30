# Sanitized Context Protocol

Source: research doc §28–29, master implementation spec.

## What this defines

The exact shape of what the client sends the server. This is co-designed
with the server, not an afterthought bolted onto an off-the-shelf VLM API —
the PS itself requires the server to be "aware of the redaction scheme."

## Default transmission mode: structured metadata, not pixels

```json
{
  "page": {
    "url_origin": "...",
    "title": "...",
    "viewport": {}
  },
  "elements": [
    {
      "id": "element-17",
      "role": "button",
      "label": "Submit",
      "sensitive": false,
      "bbox": {}
    },
    {
      "id": "element-18",
      "role": "textbox",
      "label": "[EMAIL]",
      "sensitive": true,
      "bbox": {}
    }
  ]
}
```

`[D]` This is the default and preferred mode wherever DOM extraction is
sufficient to describe a region (§17, §29). Sanitized-screenshot transmission
is reserved for canvas/non-DOM regions the local filter could not otherwise
describe as structured metadata.

## Never transmitted (unless an explicit, documented experimental mode)

- Raw password
- Raw email
- Raw phone
- Raw credit card
- Raw government ID
- Raw face pixels

Any deviation from this list requires an explicit experimental-mode flag and
documentation of why — it is never a silent default.

## `url_origin`, not full URL

Only the origin is included by default, to avoid leaking query-string or
path-embedded sensitive data as a side channel. (`[D]`, consistent with the
"minimum sanitized context required" framing of the master spec — this is an
engineering inference, not itself evidence-backed, and should be revisited
if a demo scenario needs path-level context.)

## Relationship to other docs

- How elements get classified sensitive: `docs/PII_DETECTION.md`
- How the "sensitive" flag gets applied to visual regions:
  `docs/REDACTION_PIPELINE.md`
- What the server sends back: `docs/ACTION_PROTOCOL.md`
- The privacy invariant this protocol exists to enforce:
  `docs/PRIVACY_ARCHITECTURE.md`
