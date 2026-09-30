# Technology Decisions

This document records the reasoning for every technology choice made in Phase 2.
Each decision is explicitly justified with evidence tags per `docs/AGENTS.md` §2.

## 1. Chrome Manifest V3 Extension Architecture

**Decision**: Use Manifest V3 with service worker background, offscreen documents for capture/inference, and content scripts for DOM access.

**Reasoning**:
- `[B][TECH-DOC]`: Manifest V3 is the only supported extension architecture for Chrome Web Store as of 2024. Manifest V2 is deprecated.
- `[B][TECH-DOC]`: Service workers replace persistent background pages; required for background logic.
- `[B][TECH-DOC]`: Offscreen documents are required for APIs that need DOM access outside content scripts (e.g., `captureVisibleTab`, WebGPU/WebGL contexts, Transformers.js/ONNX Runtime Web model loading).
- `[D]`: Content scripts remain the only way to access the page's DOM and accessibility tree directly — this aligns with the architecture's client-side enforcement boundary (blocks B–C in `docs/SYSTEM_ARCHITECTURE.md`).
- `[C]`: Firefox WebExtensions support Manifest V3 with minor differences; best-effort compatibility is maintained by avoiding Chrome-only APIs where possible.

**Not chosen**: Manifest V2 (deprecated), user scripts (no offscreen/API access), native messaging host (adds deployment complexity, not needed for MVP).

## 2. Extension Build Tooling

**Decision**: Vite with `vite-plugin-static-copy` for manifest/assets, TypeScript with strict mode, ESLint + typescript-eslint.

**Reasoning**:
- `[B][TECH-DOC]`: Vite provides fast ES module-based dev server and production bundling optimized for browser extensions (no webpack config complexity).
- `[D]`: Vite's native ESM support matches Manifest V3's module service workers (`"type": "module"` in `manifest.json`).
- `[B][TECH-DOC]`: `vite-plugin-static-copy` handles manifest.json, popup HTML, icons, and WASM file copying to `dist/` without custom plugins.
- `[D]`: TypeScript strict mode catches contract violations early — critical for the privacy/security invariants (`docs/PRIVACY_ARCHITECTURE.md`, `docs/ACTION_VALIDATOR.md`).
- `[D]`: ESLint with typescript-eslint enforces consistent code style and catches common bugs.

**Not chosen**: Webpack (higher config burden, slower HMR), esbuild directly (less extension-friendly asset handling), Parcel (less mature extension ecosystem).

## 3. Transformers.js / ONNX Runtime Web

**Decision**: Use `@xenova/transformers` (wrapping ONNX Runtime Web) as the primary on-device inference library.

**Reasoning**:
- `[B][TECH-DOC]`: Transformers.js is the officially maintained Hugging Face library for running Transformers models in-browser via ONNX Runtime Web.
- `[B][TECH-DOC]`: ONNX Runtime Web supports both WASM (universal, SIMD) and WebGPU (Chrome/Edge) execution providers — matches the fallback chain in `docs/FALLBACK_STRATEGY.md`.
- `[B][TECH-DOC]`: Transformers.js ships pre-quantized (INT8/UINT8) ONNX checkpoints for MobileViT, EfficientViT, and other small vision models — avoids custom quantization pipeline in MVP.
- `[B][TECH-DOC]`: Automatic model download/caching via CDN; no custom model hosting required for MVP.
- `[C]`: The library abstracts tokenizer/preprocessing/postprocessing, reducing boilerplate for vision tasks.

**Not chosen**: Raw ONNX Runtime Web (more boilerplate, no model zoo integration), TensorFlow.js (larger bundle, less vision model coverage for small ViTs), custom WASM compilation (not needed for MVP).

**Dependency added**: `@xenova/transformers@^2.17.2` in `extension/package.json`.

## 4. WASM Inference Path (Default)

**Decision**: WASM (with SIMD) is the default inference runtime; WebGPU is opportunistic.

**Reasoning**:
- `[B][TECH-DOC]`: WASM + SIMD is universally supported across Chrome, Firefox, Safari, Edge — no feature detection failure mode.
- `[A]` (Zhang et al. 2024, research doc §7a Row 1): In-browser inference measured **16.9× CPU slowdown** vs native; WASM is the baseline this multiplier was measured against.
- `[TECH-DOC]` (ONNX Runtime Web docs): WASM SIMD provides near-native CPU throughput for INT8 quantized models.
- `[D]`: Per `docs/VISION_PIPELINE.md` and `docs/FALLBACK_STRATEGY.md`, WASM is the default; WebGPU upgrades when `navigator.gpu` is available and initialization succeeds.
- `[D]`: The privacy invariant (`docs/PRIVACY_ARCHITECTURE.md`) requires that a runtime failure never falls back to raw data — WASM ensures the vision model *can* run on all target browsers.

**Not chosen**: WebGPU-only (excludes Firefox/Safari, fails on unsupported hardware), CPU-only JS fallback (too slow for ViT inference).

## 5. Future WebGPU Path (Opportunistic Upgrade)

**Decision**: Implement WebGPU as a feature-detected upgrade path; never a hard requirement.

**Reasoning**:
- `[B][TECH-DOC]`: WebGPU available in Chrome 113+, Edge 113+; Firefox behind flag, Safari in Technology Preview — assume partial for live-judged demo (`docs/VISION_PIPELINE.md`).
- `[B][TECH-DOC]`: ONNX Runtime Web's WebGPU execution provider provides GPU acceleration for INT8 models when available.
- `[D]`: Per `docs/FALLBACK_STRATEGY.md`, WebGPU → WASM fallback is a performance fallback only; both paths produce identical sanitized-context contracts.
- `[C]`: WebGPU initialization can fail (driver issues, context loss); the fallback chain must handle this gracefully without privacy regression.
- `[E]`: Actual latency improvement on target hardware must be measured (Experiment 3 in `docs/EXPERIMENT_PLAN.md`).

**Not chosen**: WebGPU-first with WASM fallback (reverses priority; WASM is more reliable), WebGL compute (deprecated path, less performant than WebGPU).

## 6. Server-Side Framework Choice

**Decision**: Fastify with Zod for schema validation, TypeScript, Vitest for testing.

**Reasoning**:
- `[B][TECH-DOC]`: Fastify is a fast, low-overhead Node.js framework with native TypeScript support and built-in schema validation via JSON Schema (Zod integrates seamlessly).
- `[D]`: The server only implements blocks I–K (`docs/SYSTEM_ARCHITECTURE.md`): receive sanitized context, run reasoning, return structured action. No complex middleware, auth, or database needed for MVP.
- `[D]`: Zod provides runtime validation of the sanitized context schema (`docs/SANITIZED_CONTEXT_PROTOCOL.md`) and action schema (`docs/ACTION_PROTOCOL.md`) — fails closed on invalid input.
- `[D]`: TypeScript strict mode ensures server/client type contracts stay in sync.
- `[D]`: Vitest provides fast, Vite-compatible testing with native ESM support.

**Not chosen**: Express (slower, no built-in validation), Hono (edge-focused, not needed), NestJS (over-engineered for single-endpoint MVP), plain http module (too low-level).

**Dependencies added**: `fastify@^4.28.0`, `zod@^3.23.0` in `server/package.json`.

## 7. Testing Strategy

**Decision**: Vitest for unit/integration tests across all packages; type-checking via `tsc --noEmit` in CI; no E2E framework yet.

**Reasoning**:
- `[D]`: Vitest works identically in Node (server, evaluation, tests) and Vite (extension) — single test runner, shared config patterns.
- `[D]`: Unit tests for shared types, PII detection logic, redaction pipeline, action validator can run in Node without browser.
- `[D]`: Type-checking (`tsc --noEmit`) catches contract drift between extension/server/evaluation packages.
- `[E]`: E2E testing (Playwright/Puppeteer) deferred to Phase 6+ when end-to-end pipeline exists — Phase 2 only scaffolds structure.
- `[D]`: Test files colocated in `tests/unit/` for shared logic; extension-specific tests will live in `extension/tests/` when needed.

**Dependencies added**: `vitest@^2.1.0` in `extension/`, `server/`, `evaluation/`, `tests/` devDependencies.

---

## Summary of Added Dependencies

| Package | Location | Purpose | Evidence |
|---------|----------|---------|----------|
| `@xenova/transformers` | `extension/` | On-device vision inference via ONNX Runtime Web | `[B][TECH-DOC]` |
| `vite`, `vite-plugin-static-copy` | `extension/` | Manifest V3 extension bundling | `[B][TECH-DOC]` |
| `typescript`, `eslint`, `typescript-eslint` | `extension/`, `server/`, `evaluation/`, `tests/` | Type safety, linting | `[D]` |
| `@types/chrome`, `@types/node` | `extension/`, `server/`, `evaluation/`, `tests/` | Type definitions | `[B][TECH-DOC]` |
| `fastify` | `server/` | Minimal HTTP server for reasoning endpoint | `[B][TECH-DOC]` |
| `zod` | `server/`, `evaluation/` | Runtime schema validation | `[D]` |
| `tsx` | `server/` | TypeScript execution for dev | `[D]` |
| `vitest` | `extension/`, `server/`, `evaluation/`, `tests/` | Unit/integration testing | `[D]` |

No other dependencies are added in Phase 2. Every dependency above is justified in this document per `AGENTS.md` §5.

---

## Phase 2 Status: IMPLEMENTED

### Repository Structure Created

```
SIH171/
├── docs/
│   ├── TECHNOLOGY_DECISIONS.md     ← NEW
│   └── (18 existing docs)
├── extension/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── manifest.json
│   └── src/
│       ├── background/index.ts
│       ├── content/index.ts
│       ├── offscreen/index.ts, offscreen.html
│       ├── popup/popup.html, popup.ts
│       ├── shared/types.ts
│       └── icons/ (placeholders)
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/index.ts
├── evaluation/
│   ├── package.json
│   └── tsconfig.json
├── tests/
│   ├── package.json
│   ├── tsconfig.json
│   └── unit/shared-types.test.ts
└── AGENTS.md (in docs/)
```

### Verification Steps Completed

1. **Extension builds**: `cd extension && npm install && npm run build` → produces `dist/` with background.js, content.js, offscreen.js, manifest.json, popup.html, wasm/ files
2. **Server type-checks**: `cd server && npm install && npm run typecheck` → passes
3. **Evaluation type-checks**: `cd evaluation && npm install && npm run typecheck` → passes
4. **Tests run**: `cd tests && npm install && npm run test` → 3 tests pass
5. **All packages use strict TypeScript** with no `any` leakage in created files

### Known Issues / Limitations

- Extension icons are empty placeholder files — real icons needed before Chrome Web Store submission
- Offscreen document only logs messages; actual capture/inference wiring is Phase 3+
- Server returns stub `wait` action; real reasoning is Phase 6+
- No E2E test infrastructure yet (deferred per roadmap)
- Firefox Manifest V3 compatibility not yet tested (best-effort only)

### Next Phase Requirements

Phase 3 requires:
- DOM/accessibility tree extraction implementation in `extension/src/content/`
- Layer 1 (typed-field) and Layer 2 (regex/string) PII detection in `extension/src/shared/`
- Common detector output structure per `docs/PII_DETECTION.md`

No perception/privacy/action logic implemented in Phase 2 — this phase only makes later phases possible to build without ad-hoc dependency choices.