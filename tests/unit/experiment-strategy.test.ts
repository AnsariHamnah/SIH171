import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runStrategy, createStrategyConfig, ExperimentStrategy, VisionExecutionMode } from '../../extension/src/shared/experiment-strategy';
import { extractDOMElements, ExtractedElement } from '../../extension/src/shared/dom-extraction';
import { detectLayer3, detectLayer3Async, ModelState } from '../../extension/src/shared/layer3-visual-detector';
import { evaluateVisionGate } from '../../extension/src/shared/vision-gate';

function setupDOM(html: string) {
  document.body.innerHTML = html;
}

describe('Phase 14 - Experiment Strategy Runner', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('Strategy configuration', () => {
    it('should create config for dom_only with heuristic_fallback', () => {
      const config = createStrategyConfig('dom_only', 'heuristic_fallback');
      expect(config.strategy).toBe('dom_only');
      expect(config.visionExecutionMode).toBe('heuristic_fallback');
    });

    it('should create config for unconditional_vision with local_model_wasm', () => {
      const config = createStrategyConfig('unconditional_vision', 'local_model_wasm');
      expect(config.strategy).toBe('unconditional_vision');
      expect(config.visionExecutionMode).toBe('local_model_wasm');
    });

    it('should create config for dom_gated_vision with local_model_wasm', () => {
      const config = createStrategyConfig('dom_gated_vision', 'local_model_wasm');
      expect(config.strategy).toBe('dom_gated_vision');
      expect(config.visionExecutionMode).toBe('local_model_wasm');
    });
  });

  describe('DOM-only strategy', () => {
    it('should never invoke vision for DOM-only page', async () => {
      setupDOM(`
        <form>
          <input type="email" id="email" value="test@example.com" />
          <input type="password" id="password" value="secret123" />
          <button type="submit">Login</button>
        </form>
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('dom_only', 'heuristic_fallback');
      const result = await runStrategy(elements, config);

      expect(result.strategy).toBe('dom_only');
      expect(result.visionExecutionMode).toBe('heuristic_fallback');
      expect(result.visionGateInfo?.visionInvoked).toBe(false);
      expect(result.visionGateInfo?.visionSkipped).toBe(true);
      expect(result.visionGateInfo?.decision.reason).toBe('dom_only_strategy');
      expect(result.layer3Result.detections.length).toBe(0);
      expect(result.modelInferenceResult).toBeUndefined();
    });

    it('should run Layer 1 and Layer 2 detections', async () => {
      setupDOM(`
        <form>
          <input type="email" id="email" value="test@example.com" />
          <input type="password" id="password" value="secret123" />
        </form>
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('dom_only', 'heuristic_fallback');
      const result = await runStrategy(elements, config);

      expect(result.layer1Result.detections.length).toBeGreaterThan(0);
      expect(result.layer2Result.detections.length).toBeGreaterThanOrEqual(0);
      const emailDetection = result.detections.find(d => d.type === 'email');
      const passwordDetection = result.detections.find(d => d.type === 'password');
      expect(emailDetection).toBeDefined();
      expect(passwordDetection).toBeDefined();
    });

    it('should produce valid sanitized context', async () => {
      setupDOM(`
        <form>
          <input type="email" id="email" value="test@example.com" />
          <input type="password" id="password" value="secret123" />
        </form>
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('dom_only', 'heuristic_fallback');
      const result = await runStrategy(elements, config);

      expect(result.sanitizedContext).toBeDefined();
      expect(result.structuredContext).toBeDefined();
      expect(result.structuredContext.page.url_origin).toBe('http://localhost');
    });
  });

  describe('Unconditional vision strategy', () => {
    it('should always invoke vision regardless of gate decision', async () => {
      setupDOM(`
        <form>
          <input type="email" id="email" value="test@example.com" />
          <input type="password" id="password" value="secret123" />
        </form>
      `);

      const elements = extractDOMElements();
      const gateDecision = evaluateVisionGate(elements);
      expect(gateDecision.shouldRunVision).toBe(false);

      const config = createStrategyConfig('unconditional_vision', 'heuristic_fallback');
      const result = await runStrategy(elements, config);

      expect(result.strategy).toBe('unconditional_vision');
      expect(result.visionExecutionMode).toBe('heuristic_fallback');
      expect(result.visionGateInfo?.visionInvoked).toBe(true);
      expect(result.visionGateInfo?.visionSkipped).toBe(false);
      expect(result.visionGateInfo?.decision.shouldRunVision).toBe(false);
    });

    it('should invoke vision when visual content present', async () => {
      setupDOM(`
        <img id="photo" src="photo.png" alt="A photo" />
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('unconditional_vision', 'heuristic_fallback');
      const result = await runStrategy(elements, config);

      expect(result.visionGateInfo?.visionInvoked).toBe(true);
      expect(result.visionGateInfo?.visionSkipped).toBe(false);
    });

    it('should include modelInferenceResult for heuristic mode', async () => {
      setupDOM(`
        <form>
          <input type="email" id="email" value="test@example.com" />
        </form>
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('unconditional_vision', 'heuristic_fallback');
      const result = await runStrategy(elements, config);

      expect(result.modelInferenceResult).toBeDefined();
      expect(result.modelInferenceResult?.success).toBe(true);
      expect(result.modelInferenceResult?.modelState).toBe(ModelState.READY);
    });
  });

  describe('DOM-gated vision strategy', () => {
    it('should skip vision when gate says no visual content', async () => {
      setupDOM(`
        <form>
          <input type="email" id="email" value="test@example.com" />
          <input type="password" id="password" value="secret123" />
        </form>
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('dom_gated_vision', 'heuristic_fallback');
      const result = await runStrategy(elements, config);

      expect(result.strategy).toBe('dom_gated_vision');
      expect(result.visionGateInfo?.visionInvoked).toBe(false);
      expect(result.visionGateInfo?.visionSkipped).toBe(true);
      expect(result.visionGateInfo?.decision.reason).toBe('no_visual_content_requiring_inspection');
      expect(result.layer3Result.detections.length).toBe(0);
      expect(result.modelInferenceResult).toBeUndefined();
    });

    it('should invoke vision when gate detects visual content', async () => {
      setupDOM(`
        <img id="photo" src="photo.png" alt="A photo" />
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('dom_gated_vision', 'heuristic_fallback');
      const result = await runStrategy(elements, config);

      expect(result.visionGateInfo?.visionInvoked).toBe(true);
      expect(result.visionGateInfo?.visionSkipped).toBe(false);
      expect(result.visionGateInfo?.decision.reason).toBe('visual_content_present');
    });

    it('should invoke vision when gate detects face keywords', async () => {
      setupDOM(`
        <img id="avatar" src="avatar.png" alt="User profile face photo" />
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('dom_gated_vision', 'heuristic_fallback');
      const result = await runStrategy(elements, config);

      expect(result.visionGateInfo?.visionInvoked).toBe(true);
      expect(result.visionGateInfo?.visionSkipped).toBe(false);
      expect(result.visionGateInfo?.decision.reason).toBe('visual_content_with_pii_indicators');
    });

    it('should invoke vision for upload controls', async () => {
      setupDOM(`
        <input type="file" id="file-upload" accept="image/*" />
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('dom_gated_vision', 'heuristic_fallback');
      const result = await runStrategy(elements, config);

      expect(result.visionGateInfo?.visionInvoked).toBe(true);
      expect(result.visionGateInfo?.visionSkipped).toBe(false);
      expect(result.visionGateInfo?.decision.reason).toBe('document_upload_control_present');
    });

    it('should NOT invoke vision for non-media upload controls', async () => {
      setupDOM(`
        <input type="file" id="doc-upload" accept=".pdf,.doc" />
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('dom_gated_vision', 'heuristic_fallback');
      const result = await runStrategy(elements, config);

      expect(result.visionGateInfo?.visionInvoked).toBe(false);
      expect(result.visionGateInfo?.visionSkipped).toBe(true);
      expect(result.visionGateInfo?.decision.reason).toBe('no_visual_content_requiring_inspection');
    });
  });

  describe('Vision execution mode separation', () => {
    it('heuristic_fallback should use synchronous detectLayer3', async () => {
      setupDOM(`
        <svg id="face" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="45" fill="#ffdbac"/>
          <circle cx="35" cy="40" r="5" fill="#333"/>
          <circle cx="65" cy="40" r="5" fill="#333"/>
        </svg>
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('unconditional_vision', 'heuristic_fallback');
      const result = await runStrategy(elements, config);

      expect(result.visionExecutionMode).toBe('heuristic_fallback');
      expect(result.layer3Result.detections.length).toBeGreaterThanOrEqual(0);
    });

    it('local_model_wasm mode should be distinguished from heuristic', async () => {
      setupDOM(`
        <form>
          <input type="email" id="email" value="test@example.com" />
        </form>
      `);

      const elements = extractDOMElements();
      
      const configHeuristic = createStrategyConfig('unconditional_vision', 'heuristic_fallback');
      const configWasm = createStrategyConfig('unconditional_vision', 'local_model_wasm');
      
      expect(configHeuristic.visionExecutionMode).toBe('heuristic_fallback');
      expect(configWasm.visionExecutionMode).toBe('local_model_wasm');
      expect(configHeuristic.visionExecutionMode).not.toBe(configWasm.visionExecutionMode);
    });
  });

  describe('Gate instrumentation accuracy', () => {
    it('should report correct visionInvoked for dom_only', async () => {
      setupDOM(`
        <img id="photo" src="photo.png" />
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('dom_only', 'heuristic_fallback');
      const result = await runStrategy(elements, config);

      expect(result.visionGateInfo?.visionInvoked).toBe(false);
      expect(result.visionGateInfo?.visionSkipped).toBe(true);
    });

    it('should report correct visionInvoked for unconditional_vision', async () => {
      setupDOM(`
        <form>
          <input type="email" id="email" value="test@example.com" />
        </form>
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('unconditional_vision', 'heuristic_fallback');
      const result = await runStrategy(elements, config);

      expect(result.visionGateInfo?.visionInvoked).toBe(true);
      expect(result.visionGateInfo?.visionSkipped).toBe(false);
    });

    it('should report correct visionInvoked for dom_gated_vision when gate skips', async () => {
      setupDOM(`
        <form>
          <input type="email" id="email" value="test@example.com" />
        </form>
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('dom_gated_vision', 'heuristic_fallback');
      const result = await runStrategy(elements, config);

      expect(result.visionGateInfo?.visionInvoked).toBe(false);
      expect(result.visionGateInfo?.visionSkipped).toBe(true);
    });

    it('should report correct visionInvoked for dom_gated_vision when gate runs', async () => {
      setupDOM(`
        <img id="photo" src="photo.png" />
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('dom_gated_vision', 'heuristic_fallback');
      const result = await runStrategy(elements, config);

      expect(result.visionGateInfo?.visionInvoked).toBe(true);
      expect(result.visionGateInfo?.visionSkipped).toBe(false);
    });

    it('should include gate decision details in visionGateInfo', async () => {
      setupDOM(`
        <img id="face-photo" src="face.png" alt="profile face" />
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('dom_gated_vision', 'heuristic_fallback');
      const result = await runStrategy(elements, config);

      expect(result.visionGateInfo?.decision).toBeDefined();
      expect(result.visionGateInfo?.decision.signals.length).toBeGreaterThan(0);
      expect(result.visionGateInfo?.decision.visualRegionsCount).toBe(1);
      expect(result.visionGateInfo?.decision.timestamp).toBeGreaterThan(0);
    });
  });

  describe('Heuristic vs local model separation', () => {
    it('heuristic mode should not call async model path', async () => {
      const detectLayer3Spy = vi.spyOn(await import('../../extension/src/shared/layer3-visual-detector'), 'detectLayer3');
      const detectLayer3AsyncSpy = vi.spyOn(await import('../../extension/src/shared/layer3-visual-detector'), 'detectLayer3Async');

      setupDOM(`
        <svg id="face" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="45" fill="#ffdbac"/>
          <circle cx="35" cy="40" r="5" fill="#333"/>
          <circle cx="65" cy="40" r="5" fill="#333"/>
        </svg>
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('unconditional_vision', 'heuristic_fallback');
      await runStrategy(elements, config);

      expect(detectLayer3Spy).toHaveBeenCalled();
      expect(detectLayer3AsyncSpy).not.toHaveBeenCalled();
    });

    it('local_model_wasm mode should be configured to call async path', () => {
      const config = createStrategyConfig('unconditional_vision', 'local_model_wasm');
      expect(config.visionExecutionMode).toBe('local_model_wasm');
    });
  });

  describe('Strategy labels correctness', () => {
    it('should label dom_only strategy correctly in result', async () => {
      setupDOM(`<input type="email" id="email" />`);
      const elements = extractDOMElements();
      const result = await runStrategy(elements, createStrategyConfig('dom_only', 'heuristic_fallback'));
      expect(result.strategy).toBe('dom_only');
    });

    it('should label unconditional_vision strategy correctly in result', async () => {
      setupDOM(`<input type="email" id="email" />`);
      const elements = extractDOMElements();
      const result = await runStrategy(elements, createStrategyConfig('unconditional_vision', 'heuristic_fallback'));
      expect(result.strategy).toBe('unconditional_vision');
    });

    it('should label dom_gated_vision strategy correctly in result', async () => {
      setupDOM(`<input type="email" id="email" />`);
      const elements = extractDOMElements();
      const result = await runStrategy(elements, createStrategyConfig('dom_gated_vision', 'heuristic_fallback'));
      expect(result.strategy).toBe('dom_gated_vision');
    });

    it('should include visionExecutionMode in result', async () => {
      setupDOM(`<input type="email" id="email" />`);
      const elements = extractDOMElements();
      const result = await runStrategy(elements, createStrategyConfig('unconditional_vision', 'local_model_wasm'));
      expect(result.visionExecutionMode).toBe('local_model_wasm');
    });
  });

  describe('Model inference result tracking', () => {
    it('should not include modelInferenceResult for dom_only', async () => {
      setupDOM(`<input type="email" id="email" />`);
      const elements = extractDOMElements();
      const result = await runStrategy(elements, createStrategyConfig('dom_only', 'heuristic_fallback'));
      expect(result.modelInferenceResult).toBeUndefined();
    });

    it('should include modelInferenceResult for unconditional_vision heuristic', async () => {
      setupDOM(`<input type="email" id="email" />`);
      const elements = extractDOMElements();
      const result = await runStrategy(elements, createStrategyConfig('unconditional_vision', 'heuristic_fallback'));
      expect(result.modelInferenceResult).toBeDefined();
      expect(result.modelInferenceResult?.success).toBe(true);
    });

    it('should include modelInferenceResult for dom_gated_vision when vision runs', async () => {
      setupDOM(`<img id="photo" src="photo.png" />`);
      const elements = extractDOMElements();
      const result = await runStrategy(elements, createStrategyConfig('dom_gated_vision', 'heuristic_fallback'));
      expect(result.modelInferenceResult).toBeDefined();
      expect(result.modelInferenceResult?.success).toBe(true);
    });

    it('should not include modelInferenceResult for dom_gated_vision when vision skipped', async () => {
      setupDOM(`<input type="email" id="email" />`);
      const elements = extractDOMElements();
      const result = await runStrategy(elements, createStrategyConfig('dom_gated_vision', 'heuristic_fallback'));
      expect(result.modelInferenceResult).toBeUndefined();
    });
  });
});