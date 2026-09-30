# Problem Statement — SIH 26171

**Title:** On-device Visual Perception for Light-weight Browser Agents
**Organization:** ISRO · **Theme:** Smart Automation

## Status of this document

**The verbatim official PS text has not been supplied to this repository.**
Everything below is reconstructed from the research document's §2, which
quotes short phrases from the PS while restating it in system terms. Treat
this file as a working interpretation, not the authoritative text — confirm
against the official SIH portal before final submission. This is tracked as
an open question in `docs/MASTER_CONTEXT.md`.

## PS requirements, as quoted/paraphrased (research doc §2)

| PS requirement (quoted where available) | System translation |
|---|---|
| "Local ViT or equivalent reads the screen" | A lightweight vision model (or DOM-first heuristic) runs client-side to produce a screen-state representation |
| "Sanitize sensitive/PII data using DOM tags or any other method before any network request" | A local, pre-transmission privacy filter — a hard requirement, not best-effort |
| "Dynamically detect and redact... blurring faces, blacking out passwords, masking PII" | Multiple redaction primitives, not one universal method |
| "Only anonymized, unidentifiable data transmitted... server aware of redaction scheme" | The server must be designed jointly with the client's sanitization contract |
| "Server processes sanitized context, returns actionable commands... click/scroll/etc." | Structured action output |
| "Balance latency and accuracy" | An explicit, measured latency budget |

## Evaluation weights (fixed — restated in every planning doc so they can't drift)

| Criterion | Weight |
|---|---|
| Visual context accuracy | 25% |
| PII precision/recall | 20% |
| Redaction precision | 20% |
| Client resource utilization | 20% |
| End-to-end latency | 15% |

Reading: 65% of the score (visual accuracy + PII precision/recall + redaction
precision) is about what the agent sees and hides; only 35% is speed/resource.
This should drive MVP prioritization (research doc §2, §46).

## What this project explicitly is not

- Not a generic "AI controls your browser" agent — see `AGENTS.md` and
  `docs/MASTER_CONTEXT.md` for the privacy-first framing.
- Not related to Evanami / SIH 26003 in any way — different organization,
  different theme, different architecture, different team context.

## Constraints stated in the source material

- Must run local perception in-browser (implies WASM/WebGPU-class runtime).
- Must sanitize before any network request leaves the device — this is
  framed as a hard requirement in the PS, not a best-effort goal.
- Server must be "aware of the redaction scheme," i.e. the sanitized-context
  contract is co-designed with the server, not an afterthought bolted onto an
  off-the-shelf VLM API.

## Open questions specific to the PS text itself

- Exact wording and any additional constraints not captured in the research
  document's paraphrase (submission format, judging logistics, specific
  demo requirements) are unknown until the verbatim PS is available.
- Whether "Local ViT or equivalent" is prescriptive (a ViT is required) or
  descriptive (any equivalent lightweight local model qualifies) — the
  research document treats it as the latter and allows DOM-first heuristics
  to substitute where possible (§17–20); this reading should be confirmed
  against the official text.
