import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runStrategy, createStrategyConfig, ExperimentStrategy, VisionExecutionMode } from '../../extension/src/shared/experiment-strategy';
import { extractDOMElements } from '../../extension/src/shared/dom-extraction';
import { evaluateVisionGate } from '../../extension/src/shared/vision-gate';

// Increase timeout for model loading tests
const MODEL_TEST_TIMEOUT = 30000;

function setupDOM(html: string) {
  document.body.innerHTML = html;
}

describe('Phase 15 - Experiment Strategy with WebGPU/WASM Backends', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('VisionExecutionMode types', () => {
    it('should create config for local_model_auto', () => {
      const config = createStrategyConfig('unconditional_vision', 'local_model_auto');
      expect(config.strategy).toBe('unconditional_vision');
      expect(config.visionExecutionMode).toBe('local_model_auto');
    });

    it('should create config for local_model_webgpu', () => {
      const config = createStrategyConfig('unconditional_vision', 'local_model_webgpu');
      expect(config.strategy).toBe('unconditional_vision');
      expect(config.visionExecutionMode).toBe('local_model_webgpu');
    });

    it('should create config for local_model_wasm', () => {
      const config = createStrategyConfig('unconditional_vision', 'local_model_wasm');
      expect(config.strategy).toBe('unconditional_vision');
      expect(config.visionExecutionMode).toBe('local_model_wasm');
    });

    it('should distinguish all four execution modes', () => {
      const modes: VisionExecutionMode[] = [
        'heuristic_fallback',
        'local_model_wasm',
        'local_model_webgpu',
        'local_model_auto'
      ];
      
      const configs = modes.map(mode => createStrategyConfig('unconditional_vision', mode));
      
      const uniqueModes = new Set(configs.map(c => c.visionExecutionMode));
      expect(uniqueModes.size).toBe(4);
    });
  });

  describe('Backend info in strategy results', () => {
    it('should include backendInfo for local_model_auto mode', async () => {
      setupDOM(`
        <img id="photo" src="photo.png" alt="A photo" />
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('unconditional_vision', 'local_model_auto');
      
      // In JSDOM, the model will fail but we can check the backendInfo structure
      const result = await runStrategy(elements, config);
      
      expect(result.backendInfo).toBeDefined();
      expect(result.backendInfo?.requestedBackend).toBe('auto');
      expect(result.backendInfo?.activeBackend).toBeDefined();
      expect(typeof result.backendInfo?.webgpuAvailable).toBe('boolean');
      expect(typeof result.backendInfo?.wasmFallback).toBe('boolean');
      expect(typeof result.backendInfo?.webgpuInitializationSuccess).toBe('boolean');
    }, MODEL_TEST_TIMEOUT);

    it('should include backendInfo for local_model_webgpu mode', async () => {
      setupDOM(`
        <img id="photo" src="photo.png" alt="A photo" />
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('unconditional_vision', 'local_model_webgpu');
      const result = await runStrategy(elements, config);
      
      expect(result.backendInfo).toBeDefined();
      expect(result.backendInfo?.requestedBackend).toBe('webgpu');
    }, MODEL_TEST_TIMEOUT);

    it('should include backendInfo for local_model_wasm mode', async () => {
      setupDOM(`
        <img id="photo" src="photo.png" alt="A photo" />
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('unconditional_vision', 'local_model_wasm');
      const result = await runStrategy(elements, config);
      
      expect(result.backendInfo).toBeDefined();
      expect(result.backendInfo?.requestedBackend).toBe('wasm');
    }, MODEL_TEST_TIMEOUT);

    it('should not include backendInfo for heuristic_fallback mode', async () => {
      setupDOM(`
        <img id="photo" src="photo.png" alt="A photo" />
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('unconditional_vision', 'heuristic_fallback');
      const result = await runStrategy(elements, config);
      
      expect(result.backendInfo).toBeUndefined();
    }, MODEL_TEST_TIMEOUT);

    it('should not include backendInfo for dom_only strategy', async () => {
      setupDOM(`
        <img id="photo" src="photo.png" alt="A photo" />
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('dom_only', 'local_model_auto');
      const result = await runStrategy(elements, config);
      
      expect(result.backendInfo).toBeUndefined();
    }, MODEL_TEST_TIMEOUT);
  });

  describe('Phase 14 strategy behavior unchanged', () => {
    it('dom_only should never invoke vision', async () => {
      setupDOM(`
        <form>
          <input type="email" id="email" value="test@example.com" />
          <input type="password" id="password" value="secret123" />
        </form>
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('dom_only', 'local_model_auto');
      const result = await runStrategy(elements, config);

      expect(result.strategy).toBe('dom_only');
      expect(result.visionGateInfo?.visionInvoked).toBe(false);
      expect(result.visionGateInfo?.visionSkipped).toBe(true);
      expect(result.layer3Result.detections.length).toBe(0);
    }, MODEL_TEST_TIMEOUT);

    it('unconditional_vision should always invoke vision', async () => {
      setupDOM(`
        <form>
          <input type="email" id="email" value="test@example.com" />
        </form>
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('unconditional_vision', 'local_model_auto');
      const result = await runStrategy(elements, config);

      expect(result.visionGateInfo?.visionInvoked).toBe(true);
      expect(result.visionGateInfo?.visionSkipped).toBe(false);
    }, MODEL_TEST_TIMEOUT);

    it('dom_gated_vision should skip vision when gate says no visual content', async () => {
      setupDOM(`
        <form>
          <input type="email" id="email" value="test@example.com" />
        </form>
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('dom_gated_vision', 'local_model_auto');
      const result = await runStrategy(elements, config);

      expect(result.visionGateInfo?.visionInvoked).toBe(false);
      expect(result.visionGateInfo?.visionSkipped).toBe(true);
      expect(result.layer3Result.detections.length).toBe(0);
    }, MODEL_TEST_TIMEOUT);

    it('dom_gated_vision should invoke vision when gate detects visual content', async () => {
      setupDOM(`
        <img id="photo" src="photo.png" alt="A photo" />
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('dom_gated_vision', 'local_model_auto');
      const result = await runStrategy(elements, config);

      expect(result.visionGateInfo?.visionInvoked).toBe(true);
      expect(result.visionGateInfo?.visionSkipped).toBe(false);
    }, MODEL_TEST_TIMEOUT);
  });

  describe('Strategy labels correctness', () => {
    it('should label all strategies correctly', async () => {
      setupDOM(`<input type="email" id="email" />`);
      const elements = extractDOMElements();

      const strategies: ExperimentStrategy[] = ['dom_only', 'unconditional_vision', 'dom_gated_vision'];
      
      for (const strategy of strategies) {
        const result = await runStrategy(elements, createStrategyConfig(strategy, 'local_model_auto'));
        expect(result.strategy).toBe(strategy);
      }
    }, MODEL_TEST_TIMEOUT);

    it('should include visionExecutionMode in result', async () => {
      setupDOM(`<input type="email" id="email" />`);
      const elements = extractDOMElements();
      
      const modes: VisionExecutionMode[] = [
        'heuristic_fallback',
        'local_model_wasm',
        'local_model_webgpu',
        'local_model_auto'
      ];
      
      for (const mode of modes) {
        const result = await runStrategy(elements, createStrategyConfig('unconditional_vision', mode));
        expect(result.visionExecutionMode).toBe(mode);
      }
    }, MODEL_TEST_TIMEOUT);
  });

  describe('Backend fallback tracking', () => {
    it('should track WASM fallback in auto mode', async () => {
      setupDOM(`
        <img id="photo" src="photo.png" alt="A photo" />
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('unconditional_vision', 'local_model_auto');
      const result = await runStrategy(elements, config);
      
      // In JSDOM, WebGPU is unavailable so it should fall back to WASM
      expect(result.backendInfo?.wasmFallback).toBe(true);
      expect(result.backendInfo?.fallbackReason).toBeDefined();
    }, MODEL_TEST_TIMEOUT);

    it('should track explicit WebGPU request fallback', async () => {
      setupDOM(`
        <img id="photo" src="photo.png" alt="A photo" />
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('unconditional_vision', 'local_model_webgpu');
      const result = await runStrategy(elements, config);
      
      // In JSDOM, explicit WebGPU request should fall back to WASM
      expect(result.backendInfo?.wasmFallback).toBe(true);
      expect(result.backendInfo?.requestedBackend).toBe('webgpu');
    }, MODEL_TEST_TIMEOUT);

    it('should not track fallback for explicit WASM', async () => {
      setupDOM(`
        <img id="photo" src="photo.png" alt="A photo" />
      `);

      const elements = extractDOMElements();
      const config = createStrategyConfig('unconditional_vision', 'local_model_wasm');
      const result = await runStrategy(elements, config);
      
      // Explicit WASM should not be a fallback
      expect(result.backendInfo?.wasmFallback).toBe(false);
      expect(result.backendInfo?.requestedBackend).toBe('wasm');
    }, MODEL_TEST_TIMEOUT);
  });
});