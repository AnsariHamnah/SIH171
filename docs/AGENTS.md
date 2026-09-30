# AGENTS.md — Working Rules for This Repository

This file governs how anyone — human contributor or AI assistant — works in
this repository. It exists because two source documents shaped this project
(an implementation-instruction brief and a literature-review/evidence
document) and their claims must not get blurred together.

## 1. Source-of-truth hierarchy

1. **Official SIH 26171 problem statement.** Not fully present in this repo
   verbatim — see `docs/PROBLEM_STATEMENT.md`. Where it conflicts with
   anything below, it wins.
2. **`SIH_26171_RESEARCH_AND_EVIDENCE_DOCUMENT.md`** (repo root) — the
   literature review. Cited by section number and evidence tag throughout
   `docs/`.
3. **This repository's `docs/`** — the working synthesis. When a doc here
   states something, it must be traceable to (1) or (2), or explicitly
   labeled an engineering decision (`[D]`) or open question.
4. **Evanami / SIH 26003 material** is never a source for this project. If
   you find yourself reaching for it, stop.

## 2. Evidence discipline (non-negotiable)

Every factual or architectural claim in `docs/` must carry one of these tags
(defined fully in `docs/MASTER_CONTEXT.md`):

`[A]` verified journal evidence · `[B][TECH-DOC]` official platform docs ·
`[C]` engineering inference from evidence · `[D]` project design decision ·
`[E]` requires our own experiment/benchmark · `[F]` research gap.

- Do not invent research, benchmarks, model capabilities, APIs, or datasets.
- Do not upgrade a `[C]`/`[D]` claim to sound like `[A]` evidence.
- Do not present a `[DESIGN ESTIMATE]` latency number as measured data.
- If the research document and an assumption conflict, **stop and report the
  conflict** — do not silently resolve it by picking one.

## 3. Phase discipline

Build in the vertical-slice phase order in `docs/IMPLEMENTATION_ROADMAP.md`.
Do not skip ahead (e.g. do not jump from documentation to a demo UI). Each
phase should leave the repository runnable. Do not stop at a phase boundary
silently — state what phase was completed and what the next one requires,
and wait for explicit go-ahead before starting a new phase unless told
otherwise.

## 4. Status vocabulary

Use exactly one of: `IMPLEMENTED`, `PARTIALLY IMPLEMENTED`, `EXPERIMENTAL`,
`UNVERIFIED`, `BLOCKED`, `NOT IMPLEMENTED`. Never say "everything works"
unless it compiles, tests pass, and the relevant path has actually been run.

## 5. Engineering philosophy

- One agent, explicit modules (Perception, Privacy, Reasoning, Action
  Planning, Action Validation, Execution, Observation) — not a multi-agent
  framework (no LangGraph/CrewAI/AutoGen-style orchestration).
- Simple modules, explicit data flow, small functions, typed contracts. No
  abstraction, dependency, or design pattern without a stated reason.
- Every dependency gets a reason recorded before it's added (a
  `docs/TECHNOLOGY_DECISIONS.md` will be created in Phase 2 once real
  dependencies exist).
- Small, scoped commits (`feat(privacy): ...`, `test(security): ...`), never
  one enormous commit.

## 6. The non-negotiable security invariant

Raw sensitive data — passwords, emails, phone numbers, card numbers,
government IDs, unredacted face pixels — must never leave the client
intentionally. A privacy-detection failure must fail closed (**do not
send**), never fail open. Every server-returned action is validated
client-side against the live DOM before execution; model output is never
treated as authority on its own. See `docs/PRIVACY_ARCHITECTURE.md`,
`docs/ACTION_VALIDATOR.md`, and `docs/PROMPT_INJECTION_DEFENSE.md`.
