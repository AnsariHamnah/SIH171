# SIH 26171 — On-device Visual Perception for Light-weight Browser Agents

**Organization:** ISRO · **Theme:** Smart Automation · **Track:** Smart India Hackathon 2026

> **Status: Phase 0–1 complete. Documentation and repository foundation only — no application code has been written yet.**

## What this is

A browser-native agent that perceives a webpage locally (DOM-first, vision as a
gated fallback), detects and irreversibly redacts PII **before** anything leaves
the device, sends a server-side reasoning model a sanitized structured context
instead of raw pixels wherever possible, and executes the structured action it
returns only after a client-side validator checks it against the live page.

This is a **separate project** from Evanami (SIH 26003). Nothing here shares
architecture, code, or terminology with that project.

## Read this first

Start with [`docs/MASTER_CONTEXT.md`](docs/MASTER_CONTEXT.md) — it is the hub
document and links to everything else.

## Evaluation weights (do not reinterpret)

| Criterion | Weight |
|---|---|
| Visual context accuracy | 25% |
| PII precision/recall | 20% |
| Redaction precision | 20% |
| Client resource utilization | 20% |
| End-to-end latency | 15% |

## Source of truth

- `SIH_26171_RESEARCH_AND_EVIDENCE_DOCUMENT.md` (project root, supplied by the
  user) — literature review and evidence base. Every technical doc in `docs/`
  cites this file by section number (e.g. `§17`, `§29`) and by evidence tag
  (`[A]`–`[F]`, defined in `docs/MASTER_CONTEXT.md`).
- The official SIH 26171 problem-statement text, as paraphrased inside the
  research document's §2. The full verbatim PS document has not been supplied
  to this repository — see `docs/PROBLEM_STATEMENT.md` for what is and isn't
  known.

## Repository structure (current)

```
/
├── README.md
├── AGENTS.md
├── SIH_26171_RESEARCH_AND_EVIDENCE_DOCUMENT.md
└── docs/
    ├── MASTER_CONTEXT.md
    ├── PROBLEM_STATEMENT.md
    ├── SYSTEM_ARCHITECTURE.md
    ├── PRIVACY_ARCHITECTURE.md
    ├── THREAT_MODEL.md
    ├── PII_DETECTION.md
    ├── REDACTION_PIPELINE.md
    ├── DOM_PERCEPTION.md
    ├── VISION_PIPELINE.md
    ├── SANITIZED_CONTEXT_PROTOCOL.md
    ├── ACTION_PROTOCOL.md
    ├── ACTION_VALIDATOR.md
    ├── PROMPT_INJECTION_DEFENSE.md
    ├── LATENCY_AND_RESOURCE_MODEL.md
    ├── EVALUATION_PLAN.md
    ├── EXPERIMENT_PLAN.md
    ├── SYNTHETIC_DATASET_PLAN.md
    ├── FALLBACK_STRATEGY.md
    └── IMPLEMENTATION_ROADMAP.md
```

`extension/`, `server/`, `evaluation/`, `tests/` do not exist yet — they are
created in Phase 2 onward, per `docs/IMPLEMENTATION_ROADMAP.md`, once there is
real code to put in them.

## Do not build yet

OCR, reversible redaction, cross-tab privacy state tracking, extension
supply-chain protection, multi-agent orchestration. See
`docs/MASTER_CONTEXT.md` → "Do Not Do" for the full list and reasoning.
