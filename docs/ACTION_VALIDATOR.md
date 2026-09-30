# Action Validator

Source: research doc §28–32 (Row 4, 94.4% injection-success finding),
synthesizing `docs/THREAT_MODEL.md`, `docs/ACTION_PROTOCOL.md`,
`docs/SYSTEM_ARCHITECTURE.md` block L.

## Why this component is non-negotiable

`[A]` Row 4 (JAMA Network Open, medical-domain agentic setting) found a
94.4% real-world prompt-injection success rate against commercial LLMs with
no structural defense. That finding is the direct motivation for this
document: **a server-returned action is never trusted, ever, regardless of
how the server was prompted or which model produced it.** The validator is
the last line of defense before anything happens in the user's actual
browser session, and it runs unconditionally — there is no "trusted server"
mode.

`[D]` Design decision: model output is data describing an intended action,
not authority to perform it. Authority is derived only from passing every
check below against the **live** DOM at execution time, not the DOM state
that existed when the sanitized context was captured.

## What the validator checks, in order

1. **Session/domain allow-list.** The action's implicit target domain
   (current tab origin) must match an allow-listed category of action for
   this session. Out-of-scope domain → reject.
2. **Action-type allow-list.** Only the MVP action set from
   `docs/ACTION_PROTOCOL.md` (`click`, `fill`, `scroll`, `focus`, `select`)
   is ever executed. An action type outside this set is rejected
   unconditionally, even if the schema would otherwise parse it — this is
   what stops a server from inventing `navigate` or `keypress` before those
   are deliberately added to the MVP set.
3. **Selector existence.** `target` must resolve to exactly one live element
   in the current DOM. Zero matches → reject. Multiple ambiguous matches →
   reject (do not guess which one was intended).
4. **Selector re-classification.** The resolved live element is re-checked
   against the same sensitivity classification used in
   `docs/PII_DETECTION.md`. If the DOM has changed since the sanitized
   context was captured (e.g. a field the server was told was `[EMAIL]` is
   now, on the live page, a password field), the action is rejected — the
   server's understanding of the page is stale by definition, and staleness
   near a sensitive field is treated as a validation failure, not a
   convenience issue.
5. **Visibility and interactability.** The resolved element must be
   visible, in-viewport or scrollable-into-view, and not `disabled`. An
   action against a hidden or disabled element is rejected — this doubles
   as a cheap check against a page trying to make the agent interact with
   an off-screen/attacker-planted element (see
   `docs/PROMPT_INJECTION_DEFENSE.md`).
6. **`reasoning_id` traceability.** Every action must carry a
   `reasoning_id` linking it back to the server reasoning step that
   produced it (`docs/ACTION_PROTOCOL.md`). An action with a missing or
   unrecognized `reasoning_id` is rejected — this is what makes the debug
   panel in the Phase 17 demo able to show "the server asked for this
   because of X" rather than an opaque action stream.
7. **Sensitive-pattern confirmation gate.** Actions targeting an element
   classified sensitive (payment fields, account-deletion controls,
   credential fields, or any element inside a form flagged high-severity by
   `docs/PII_DETECTION.md`) require an explicit user confirmation step
   before execution, regardless of how well-formed the action otherwise is.
   This is listed directly in `docs/THREAT_MODEL.md` as the concrete
   mitigation for the "compromised/malicious server" threat row.
8. **`value_ref` resolution.** For `fill`/`select` actions carrying a
   `value_ref`, the validator resolves the reference against **client-known
   data only**. If the reference does not resolve to something the client
   actually holds, the action is rejected — this is the enforcement point
   for the "server cannot leak what it never received" property claimed in
   `docs/ACTION_PROTOCOL.md`; the validator is what makes that claim true
   rather than aspirational.
9. **Rate/action budget.** A soft cap on actions executed per reasoning
   round and per session, to bound the blast radius of a single compromised
   or manipulated reasoning step. Exact numbers are a `[DESIGN ESTIMATE]`
   until an experiment sets them (`docs/EXPERIMENT_PLAN.md`) — do not
   present a specific figure to judges as measured.

## Fail-closed behavior

Any single check failing rejects the action. The validator never attempts
to "fix" a malformed or borderline action (e.g. auto-selecting the first of
several ambiguous selector matches) — a rejected action is surfaced to the
observation/feedback loop (`docs/SYSTEM_ARCHITECTURE.md` block N) as a
failure, not silently downgraded into a best-effort guess. This mirrors the
fail-closed rule in `docs/PRIVACY_ARCHITECTURE.md` and
`docs/FALLBACK_STRATEGY.md`: uncertainty resolves to inaction, never to
guessed action.

## What the validator deliberately does not do

- It does not attempt to infer server *intent* beyond the structured action
  it was given — no semantic "does this action make sense for the task"
  judgment. That would require re-introducing a model into the trust
  boundary, which defeats the purpose.
- It does not attempt to detect a compromised server via anomaly detection
  across a session. That is out of scope for this MVP (consistent with
  `docs/MASTER_CONTEXT.md` → "Do Not Do").

## Status

`[D]` Design specified here. `[E]` Implementation and its adversarial test
(a synthetic page whose hidden DOM instructs the reasoning step to target a
payment field) are required before this can be marked implemented — see
`docs/IMPLEMENTATION_ROADMAP.md` Phase 5 and Phase 7.

## Relationship to other docs

- What shape of action gets validated: `docs/ACTION_PROTOCOL.md`
- Why this exists at all: `docs/THREAT_MODEL.md`
- How the sensitive-pattern classification is produced:
  `docs/PII_DETECTION.md`
- The injection scenario this is tested against:
  `docs/PROMPT_INJECTION_DEFENSE.md`
- Where this sits in the pipeline: `docs/SYSTEM_ARCHITECTURE.md` (block L)
