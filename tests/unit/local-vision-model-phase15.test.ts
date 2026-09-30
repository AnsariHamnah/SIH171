import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LocalVisionModel, ModelState, VisionBackend, BackendSelectionMode } from '../../extension/src/shared/local-vision-model';

describe('LocalVisionModel - Phase 15 WebGPU/WASM Backend Selection', () => {
  let originalNavigator: any;
  let originalWindow: any;

  beforeEach(() => {
    originalNavigator = globalThis.navigator;
    originalWindow = globalThis.window;
    
    // Mock navigator.gpu as unavailable by default (JSDOM environment)
    vi.stubGlobal('navigator', { 
      gpu: undefined 
    });
    vi.stubGlobal('window', { isSecureContext: true });
    
    // Reset singleton
    vi.resetModules();
  });

  afterEach(() => {
    vi.stubGlobal('navigator', originalNavigator);
    vi.stubGlobal('window', originalWindow);
    vi.restoreAllMocks();
  });

  describe('Backend selection modes', () => {
    it('should default to auto mode', () => {
      const model = new LocalVisionModel();
      expect(model.getRequestedBackendMode()).toBe('auto');
    });

    it('should accept explicit backend mode', () => {
      const modelWasm = new LocalVisionModel({ backendMode: 'wasm' });
      expect(modelWasm.getRequestedBackendMode()).toBe('wasm');

      const modelWebGPU = new LocalVisionModel({ backendMode: 'webgpu' });
      expect(modelWebGPU.getRequestedBackendMode()).toBe('webgpu');

      const modelAuto = new LocalVisionModel({ backendMode: 'auto' });
      expect(modelAuto.getRequestedBackendMode()).toBe('auto');
    });
  });

  describe('Node/JSDOM environment (WebGPU unavailable)', () => {
    it('should use WASM backend when WebGPU is unavailable in auto mode', async () => {
      const model = new LocalVisionModel({ backendMode: 'auto' });
      
      // In JSDOM, navigator.gpu is undefined, so WebGPU should be unavailable
      // The model initialization will fail because Transformers.js needs browser environment
      // but we can test the backend selection logic
      
      try {
        await model.initialize();
      } catch {
        // Expected to fail in JSDOM
      }
      
      // The active backend should be WASM since WebGPU is unavailable
      expect(model.getActiveBackend()).toBe('wasm');
      expect(model.isWasmFallback()).toBe(true);
      expect(model.getFallbackReason()).toBe('unsupported_browser');
    });

    it('should use WASM backend when explicitly requested', async () => {
      const model = new LocalVisionModel({ backendMode: 'wasm' });
      
      try {
        await model.initialize();
      } catch {
        // Expected to fail in JSDOM
      }
      
      expect(model.getActiveBackend()).toBe('wasm');
      expect(model.isWasmFallback()).toBe(false); // Not a fallback, explicitly requested
    });

    it('should attempt WebGPU but fall back to WASM when explicitly requested and unavailable', async () => {
      const model = new LocalVisionModel({ backendMode: 'webgpu' });
      
      try {
        await model.initialize();
      } catch {
        // Expected to fail in JSDOM
      }
      
      // Should fall back to WASM when WebGPU is unavailable
      expect(model.getActiveBackend()).toBe('wasm');
      expect(model.isWasmFallback()).toBe(true);
      expect(model.getFallbackReason()).toBe('unsupported_browser');
    });
  });

  describe('Model status reporting', () => {
    it('should report correct status fields', async () => {
      const model = new LocalVisionModel({ backendMode: 'auto' });
      
      try {
        await model.initialize();
      } catch {
        // Expected to fail in JSDOM
      }
      
      const status = model.getModelStatus();
      
      expect(status.backend).toBeDefined();
      expect(status.requestedBackend).toBe('auto');
      expect(status.modelLoaded).toBeDefined();
      expect(status.inferenceReady).toBeDefined();
      expect(status.webgpuAvailable).toBe(false); // JSDOM has no WebGPU
      expect(status.webgpuInitializationSuccess).toBe(false);
      expect(status.wasmFallback).toBe(true);
      expect(status.fallbackReason).toBe('unsupported_browser');
      expect(status.modelState).toBeDefined();
      expect(status.timestamp).toBeGreaterThan(0);
    });

    it('should include initialization time in status', async () => {
      const model = new LocalVisionModel({ backendMode: 'wasm' });
      
      try {
        await model.initialize();
      } catch {
        // Expected to fail in JSDOM
      }
      
      const initTime = model.getInitializationTimeMs();
      expect(typeof initTime).toBe('number');
      expect(initTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('No heuristic fallback in local-model mode', () => {
    it('should not silently switch to heuristic detector', async () => {
      const model = new LocalVisionModel({ backendMode: 'auto' });
      
      try {
        await model.initialize();
      } catch {
        // Expected to fail in JSDOM
      }
      
      // The model should be in FAILED state, not silently using heuristic
      expect(model.getState()).toBe(ModelState.FAILED);
      
      // Model info should still report the attempted backend
      const info = model.getModelInfo();
      expect(info.backend).toBe('wasm'); // Fallback to WASM
      expect(info.requestedBackend).toBe('auto');
    });

    it('should report explicit failure when both WebGPU and WASM fail', async () => {
      const model = new LocalVisionModel({ backendMode: 'webgpu' });
      
      try {
        await model.initialize();
      } catch (error) {
        // Should throw explicit error, not silently fall back to heuristic
        expect(error).toBeInstanceOf(Error);
      }
      
      // State should be FAILED
      expect(model.getState()).toBe(ModelState.FAILED);
    });
  });

  describe('Backend info in ModelInfo', () => {
    it('should report active backend in getModelInfo', async () => {
      const model = new LocalVisionModel({ backendMode: 'auto' });
      
      try {
        await model.initialize();
      } catch {
        // Expected to fail in JSDOM
      }
      
      const info = model.getModelInfo();
      expect(info.backend).toBe('wasm');
      expect(info.requestedBackend).toBe('auto');
      expect(info.runtime).toContain('Transformers.js');
      expect(info.runtime).toContain('ONNX Runtime Web');
    });
  });

  describe('Explicit backend mode behavior', () => {
    it('should distinguish between auto and explicit webgpu mode', () => {
      const modelAuto = new LocalVisionModel({ backendMode: 'auto' });
      const modelWebGPU = new LocalVisionModel({ backendMode: 'webgpu' });
      const modelWasm = new LocalVisionModel({ backendMode: 'wasm' });
      
      expect(modelAuto.getRequestedBackendMode()).toBe('auto');
      expect(modelWebGPU.getRequestedBackendMode()).toBe('webgpu');
      expect(modelWasm.getRequestedBackendMode()).toBe('wasm');
    });

    it('should report wasmFallback correctly for explicit modes', async () => {
      const modelAuto = new LocalVisionModel({ backendMode: 'auto' });
      const modelWebGPU = new LocalVisionModel({ backendMode: 'webgpu' });
      const modelWasm = new LocalVisionModel({ backendMode: 'wasm' });
      
      for (const model of [modelAuto, modelWebGPU, modelWasm]) {
        try {
          await model.initialize();
        } catch {
          // Expected to fail in JSDOM
        }
      }
      
      // All should fall back to WASM in JSDOM
      expect(modelAuto.isWasmFallback()).toBe(true);
      expect(modelWebGPU.isWasmFallback()).toBe(true);
      expect(modelWasm.isWasmFallback()).toBe(false); // Explicit WASM is not a fallback
    });
  });
});