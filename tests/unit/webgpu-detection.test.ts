import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  detectWebGPUCapability, 
  initializeWebGPUDevice, 
  isWebGPUSupported, 
  getWebGPUAvailabilitySync,
  type WebGPUAvailability 
} from '../../extension/src/shared/webgpu-detection';

describe('WebGPU Capability Detection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('isWebGPUSupported', () => {
    it('should return false when navigator is undefined', () => {
      vi.stubGlobal('navigator', {});
      delete (globalThis as any).navigator.gpu;
      
      expect(isWebGPUSupported()).toBe(false);
    });

    it('should return false when navigator.gpu is undefined', () => {
      vi.stubGlobal('navigator', { gpu: undefined });
      vi.stubGlobal('window', { isSecureContext: true });
      
      expect(isWebGPUSupported()).toBe(false);
    });

    it('should return false when window.isSecureContext is false', () => {
      vi.stubGlobal('navigator', { gpu: {} });
      vi.stubGlobal('window', { isSecureContext: false });
      
      expect(isWebGPUSupported()).toBe(false);
    });

    it('should return true when both navigator.gpu and isSecureContext are present', () => {
      vi.stubGlobal('navigator', { gpu: {} });
      vi.stubGlobal('window', { isSecureContext: true });
      
      expect(isWebGPUSupported()).toBe(true);
    });
  });

  describe('getWebGPUAvailabilitySync', () => {
    it('should return unsupported_browser when navigator.gpu is missing', () => {
      vi.stubGlobal('navigator', {});
      delete (globalThis as any).navigator.gpu;
      vi.stubGlobal('window', { isSecureContext: true });
      
      expect(getWebGPUAvailabilitySync()).toBe('unsupported_browser');
    });

    it('should return insecure_context when not in secure context', () => {
      vi.stubGlobal('navigator', { gpu: {} });
      vi.stubGlobal('window', { isSecureContext: false });
      
      expect(getWebGPUAvailabilitySync()).toBe('insecure_context');
    });

    it('should return available when both conditions are met', () => {
      vi.stubGlobal('navigator', { gpu: {} });
      vi.stubGlobal('window', { isSecureContext: true });
      
      expect(getWebGPUAvailabilitySync()).toBe('available');
    });
  });

  describe('detectWebGPUCapability', () => {
    it('should return unavailable when navigator.gpu is missing', async () => {
      vi.stubGlobal('navigator', {});
      delete (globalThis as any).navigator.gpu;
      vi.stubGlobal('window', { isSecureContext: true });
      
      const result = await detectWebGPUCapability();
      
      expect(result.available).toBe(false);
      expect(result.reason).toBe('unsupported_browser');
    });

    it('should return unavailable when not in secure context', async () => {
      vi.stubGlobal('navigator', { gpu: {} });
      vi.stubGlobal('window', { isSecureContext: false });
      
      const result = await detectWebGPUCapability();
      
      expect(result.available).toBe(false);
      expect(result.reason).toBe('insecure_context');
    });

    it('should return available when adapter and device are available', async () => {
      const mockAdapter = { name: 'Test Adapter', requestDevice: vi.fn().mockResolvedValue({}) };
      vi.stubGlobal('navigator', { 
        gpu: { 
          requestAdapter: vi.fn().mockResolvedValue(mockAdapter) 
        } 
      });
      vi.stubGlobal('window', { isSecureContext: true });
      
      const result = await detectWebGPUCapability();
      
      expect(result.available).toBe(true);
      expect(result.reason).toBe('available');
      expect(result.adapterName).toBe('Test Adapter');
    });

    it('should return adapter_request_failed when requestAdapter returns null', async () => {
      vi.stubGlobal('navigator', { 
        gpu: { 
          requestAdapter: vi.fn().mockResolvedValue(null) 
        } 
      });
      vi.stubGlobal('window', { isSecureContext: true });
      
      const result = await detectWebGPUCapability();
      
      expect(result.available).toBe(false);
      expect(result.reason).toBe('adapter_request_failed');
    });

    it('should return device_init_failed when requestDevice returns null', async () => {
      const mockAdapter = { name: 'Test Adapter', requestDevice: vi.fn().mockResolvedValue(null) };
      vi.stubGlobal('navigator', { 
        gpu: { 
          requestAdapter: vi.fn().mockResolvedValue(mockAdapter) 
        } 
      });
      vi.stubGlobal('window', { isSecureContext: true });
      
      const result = await detectWebGPUCapability();
      
      expect(result.available).toBe(false);
      expect(result.reason).toBe('device_init_failed');
      expect(result.adapterName).toBe('Test Adapter');
    });

    it('should return adapter_request_failed when requestAdapter throws', async () => {
      vi.stubGlobal('navigator', { 
        gpu: { 
          requestAdapter: vi.fn().mockRejectedValue(new Error('GPU error')) 
        } 
      });
      vi.stubGlobal('window', { isSecureContext: true });
      
      const result = await detectWebGPUCapability();
      
      expect(result.available).toBe(false);
      expect(result.reason).toBe('adapter_request_failed');
    });

    it('should try low-power fallback when fallbackToLowPower is true', async () => {
      const highPerfAdapter = { name: 'High Perf', requestDevice: vi.fn().mockResolvedValue(null) };
      const lowPowerAdapter = { name: 'Low Power', requestDevice: vi.fn().mockResolvedValue({}) };
      
      let callCount = 0;
      vi.stubGlobal('navigator', { 
        gpu: { 
          requestAdapter: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve(highPerfAdapter);
            return Promise.resolve(lowPowerAdapter);
          }) 
        } 
      });
      vi.stubGlobal('window', { isSecureContext: true });
      
      const result = await detectWebGPUCapability({ fallbackToLowPower: true });
      
      expect(result.available).toBe(true);
      expect(result.reason).toBe('available');
      expect(result.adapterName).toBe('Low Power');
    });
  });

  describe('initializeWebGPUDevice', () => {
    it('should return failure when navigator.gpu is missing', async () => {
      vi.stubGlobal('navigator', {});
      delete (globalThis as any).navigator.gpu;
      vi.stubGlobal('window', { isSecureContext: true });
      
      const result = await initializeWebGPUDevice();
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('unsupported_browser');
    });

    it('should return failure when not in secure context', async () => {
      vi.stubGlobal('navigator', { gpu: {} });
      vi.stubGlobal('window', { isSecureContext: false });
      
      const result = await initializeWebGPUDevice();
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('insecure_context');
    });

    it('should return success with device when adapter and device are available', async () => {
      const mockDevice = { name: 'Test Device' };
      const mockAdapter = { name: 'Test Adapter', requestDevice: vi.fn().mockResolvedValue(mockDevice) };
      vi.stubGlobal('navigator', { 
        gpu: { 
          requestAdapter: vi.fn().mockResolvedValue(mockAdapter) 
        } 
      });
      vi.stubGlobal('window', { isSecureContext: true });
      
      const result = await initializeWebGPUDevice();
      
      expect(result.success).toBe(true);
      expect(result.reason).toBe('available');
      expect(result.device).toBe(mockDevice);
      expect(result.adapterName).toBe('Test Adapter');
    });

    it('should use specified powerPreference', async () => {
      const mockAdapter = { name: 'Test Adapter', requestDevice: vi.fn().mockResolvedValue({}) };
      const requestAdapterSpy = vi.fn().mockResolvedValue(mockAdapter);
      vi.stubGlobal('navigator', { gpu: { requestAdapter: requestAdapterSpy } });
      vi.stubGlobal('window', { isSecureContext: true });
      
      await initializeWebGPUDevice({ powerPreference: 'low-power' });
      
      expect(requestAdapterSpy).toHaveBeenCalledWith({ powerPreference: 'low-power' });
    });
  });
});