export type WebGPUAvailability = 
  | 'available'
  | 'unavailable'
  | 'insecure_context'
  | 'unsupported_browser'
  | 'adapter_request_failed'
  | 'device_init_failed'
  | 'webgpu_runtime_init_failed';

export interface WebGPUCapabilityResult {
  available: boolean;
  reason: WebGPUAvailability;
  adapterName?: string;
  adapterType?: GPUPowerPreference;
  timestamp: number;
}

export interface WebGPUInitResult {
  success: boolean;
  device?: GPUDevice;
  reason: WebGPUAvailability;
  adapterName?: string;
  adapterType?: GPUPowerPreference;
  timestamp: number;
}

async function checkWebGPUSupport(): Promise<WebGPUCapabilityResult> {
  const timestamp = Date.now();

  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return {
      available: false,
      reason: 'unsupported_browser',
      timestamp,
    };
  }

  if (!window.isSecureContext) {
    return {
      available: false,
      reason: 'insecure_context',
      timestamp,
    };
  }

  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    
    if (!adapter) {
      return {
        available: false,
        reason: 'adapter_request_failed',
        timestamp,
      };
    }

    const device = await adapter.requestDevice();
    
    if (!device) {
      return {
        available: false,
        reason: 'device_init_failed',
        adapterName: adapter.name || undefined,
        adapterType: 'high-performance',
        timestamp,
      };
    }

    return {
      available: true,
      reason: 'available',
      adapterName: adapter.name || undefined,
      adapterType: 'high-performance',
      timestamp,
    };
  } catch {
    return {
      available: false,
      reason: 'adapter_request_failed',
      timestamp,
    };
  }
}

async function checkWebGPUWithFallback(): Promise<WebGPUCapabilityResult> {
  const timestamp = Date.now();

  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return {
      available: false,
      reason: 'unsupported_browser',
      timestamp,
    };
  }

  if (!window.isSecureContext) {
    return {
      available: false,
      reason: 'insecure_context',
      timestamp,
    };
  }

  for (const powerPreference of ['high-performance', 'low-power'] as GPUPowerPreference[]) {
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference });
      
      if (!adapter) {
        continue;
      }

      const device = await adapter.requestDevice();
      
      if (!device) {
        continue;
      }

      return {
        available: true,
        reason: 'available',
        adapterName: adapter.name || undefined,
        adapterType: powerPreference,
        timestamp,
      };
    } catch {
      continue;
    }
  }

  return {
    available: false,
    reason: 'adapter_request_failed',
    timestamp,
  };
}

export async function detectWebGPUCapability(options?: { fallbackToLowPower?: boolean }): Promise<WebGPUCapabilityResult> {
  if (options?.fallbackToLowPower) {
    return checkWebGPUWithFallback();
  }
  return checkWebGPUSupport();
}

export async function initializeWebGPUDevice(options?: { powerPreference?: GPUPowerPreference }): Promise<WebGPUInitResult> {
  const timestamp = Date.now();

  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return {
      success: false,
      reason: 'unsupported_browser',
      timestamp,
    };
  }

  if (!window.isSecureContext) {
    return {
      success: false,
      reason: 'insecure_context',
      timestamp,
    };
  }

  const powerPreference = options?.powerPreference ?? 'high-performance';

  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference });
    
    if (!adapter) {
      return {
        success: false,
        reason: 'adapter_request_failed',
        timestamp,
      };
    }

    const device = await adapter.requestDevice();
    
    if (!device) {
      return {
        success: false,
        reason: 'device_init_failed',
        adapterName: adapter.name || undefined,
        adapterType: powerPreference,
        timestamp,
      };
    }

    return {
      success: true,
      device,
      reason: 'available',
      adapterName: adapter.name || undefined,
      adapterType: powerPreference,
      timestamp,
    };
  } catch {
    return {
      success: false,
      reason: 'adapter_request_failed',
      timestamp,
    };
  }
}

export function isWebGPUSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.gpu && window.isSecureContext;
}

export function getWebGPUAvailabilitySync(): WebGPUAvailability {
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return 'unsupported_browser';
  }
  if (!window.isSecureContext) {
    return 'insecure_context';
  }
  return 'available';
}