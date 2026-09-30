# Threat Model

Source: research doc §28–31.

| Threat | Vector | Mitigation | Evidence |
|---|---|---|---|
| Malicious webpage | Hidden/invisible DOM text instructing the agent ("ignore previous instructions...") | Strip/ignore any DOM text in `display:none`, `visibility:hidden`, zero-opacity, or off-screen elements before it reaches the reasoning step; treat all page-authored text as untrusted data, never instructions | `[A]` Row 4 — 94.4% real-world injection success rate against commercial LLMs with no such filtering, in an agentic setting |
| Compromised/malicious server | Server returns an action outside the user's intended task (e.g. "submit payment") | Client-side action validator: allow-list of action types per session/domain, confirmation step for any action matching a sensitive pattern (payment forms, account deletion, credential fields) | `[A]` Row 4 motivates this directly |
| Network attacker | MITM on client↔server channel | TLS assumed baseline | `[D]`, not a research question |
| Accidental PII leakage | Local filter misses a field (false negative) | Defense in depth: DOM-typed filter + vision filter + a final hard rule — never send raw pixels of a typed-sensitive-input region, regardless of model confidence | `[D]`, §27 |
| Extension compromise / supply-chain | Malicious update to the extension itself | Out of scope for an SIH prototype — documented as a limitation, not a solved problem | `[F]` |

## Prompt injection (anchor evidence: `[A]` Row 4, context: Row 5)

The anchoring study (JAMA Network Open, Row 4) is medical-domain, but its
finding generalizes directly to this architecture: **any system where a
server-side LLM's output drives real-world actions is exposed to
instruction/data-boundary confusion**, and current commercial models do not
reliably solve this on their own (94.4% attack success rate in that study's
setting). For a browser agent that can click/fill/submit, this means:

1. Never concatenate text scraped from the page into the same prompt channel
   as system instructions without a structural separator/tag.
2. Treat every server-returned action as requiring client-side validation
   against the actual live DOM before execution — does the selector exist?
   does the action type match an allow-listed category for this domain?
   Never blind execution.

Full defense design: `docs/PROMPT_INJECTION_DEFENSE.md`,
`docs/ACTION_VALIDATOR.md`.

## What this threat model does not cover

Extension supply-chain integrity and cross-tab/cross-session state tracking
are named threats that are explicitly **not** mitigated in this MVP — see
`docs/MASTER_CONTEXT.md` → "Do Not Do." They are disclosed as limitations,
not silently dropped.
