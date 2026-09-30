import { detectWebGPUCapability, type WebGPUAvailability } from './webgpu-detection';

let executionProvidersRef: { current: string[] } | null = null;

async function getExecutionProvidersRef(): Promise<{ current: string[] }> {
  if (executionProvidersRef) {
    return executionProvidersRef;
  }
  try {
    const onnxBackend = await import('@xenova/transformers/src/backends/onnx.js');
    executionProvidersRef = { current: onnxBackend.executionProviders };
  } catch {
    executionProvidersRef = { current: ['wasm'] };
  }
  return executionProvidersRef;
}

export enum ModelState {
  NOT_INITIALIZED = 'MODEL_NOT_INITIALIZED',
  LOADING = 'MODEL_LOADING',
  READY = 'MODEL_READY',
  FAILED = 'MODEL_FAILED',
}

export type VisionBackend = 'webgpu' | 'wasm';

export type BackendSelectionMode = 'auto' | 'webgpu' | 'wasm';

export interface ModelConfig {
  modelId: string;
  confidenceThreshold: number;
  inputWidth: number;
  inputHeight: number;
  maxDetections: number;
  iouThreshold: number;
  backendMode?: BackendSelectionMode;
}

export interface RawDetection {
  bbox: [number, number, number, number];
  score: number;
  class: number;
}

export interface ModelInfo {
  name: string;
  task: string;
  format: string;
  runtime: string;
  backend: VisionBackend;
  requestedBackend: BackendSelectionMode;
  quantization: string;
  modelSize: string;
  license: string;
  source: string;
  bundled: boolean;
  localInference: boolean;
}

export interface ModelStatus {
  backend: VisionBackend;
  requestedBackend: BackendSelectionMode;
  modelLoaded: boolean;
  inferenceReady: boolean;
  webgpuAvailable: boolean;
  webgpuInitializationSuccess: boolean;
  wasmFallback: boolean;
  fallbackReason?: WebGPUAvailability;
  modelState: ModelState;
  initializationTimeMs?: number;
  timestamp: number;
}

const DEFAULT_CONFIG: ModelConfig = {
  modelId: 'Xenova/blazeface',
  confidenceThreshold: 0.7,
  inputWidth: 128,
  inputHeight: 128,
  maxDetections: 10,
  iouThreshold: 0.3,
  backendMode: 'auto',
};

let modelInstance: LocalVisionModel | null = null;

export class LocalVisionModel {
  private config: ModelConfig;
  private state: ModelState = ModelState.NOT_INITIALIZED;
  private detector: unknown = null;
  private initPromise: Promise<void> | null = null;
  private error: Error | null = null;
  private activeBackend: VisionBackend = 'wasm';
  private webgpuAvailable = false;
  private webgpuInitSuccess = false;
  private wasmFallback = false;
  private fallbackReason?: WebGPUAvailability;
  private initializationTimeMs?: number;

  constructor(config: Partial<ModelConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getState(): ModelState {
    return this.state;
  }

  getError(): Error | null {
    return this.error;
  }

  getActiveBackend(): VisionBackend {
    return this.activeBackend;
  }

  getRequestedBackendMode(): BackendSelectionMode {
    return this.config.backendMode ?? 'auto';
  }

  isWasmFallback(): boolean {
    return this.wasmFallback;
  }

  getFallbackReason(): WebGPUAvailability | undefined {
    return this.fallbackReason;
  }

  getInitializationTimeMs(): number | undefined {
    return this.initializationTimeMs;
  }

  async initialize(): Promise<void> {
    if (this.state === ModelState.READY) {
      return;
    }

    if (this.state === ModelState.LOADING && this.initPromise) {
      return this.initPromise;
    }

    this.state = ModelState.LOADING;
    this.error = null;
    const initStart = performance.now();

    this.initPromise = this._initialize();
    
    try {
      await this.initPromise;
      this.initializationTimeMs = performance.now() - initStart;
    } catch (err) {
      this.initializationTimeMs = performance.now() - initStart;
      this.state = ModelState.FAILED;
      this.error = err instanceof Error ? err : new Error(String(err));
      throw this.error;
    }
  }

  private async _initialize(): Promise<void> {
    const { pipeline, env } = await import('@xenova/transformers');
    
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    const backendMode = this.config.backendMode ?? 'auto';
    let executionProviders: string[] = [];
    let attemptedWebGPU = false;

    if (backendMode === 'webgpu' || backendMode === 'auto') {
      attemptedWebGPU = true;
      const capability = await detectWebGPUCapability({ fallbackToLowPower: true });
      this.webgpuAvailable = capability.available;

      if (capability.available) {
        this.webgpuInitSuccess = true;
        executionProviders = ['webgpu', 'wasm'];
        this.activeBackend = 'webgpu';
      } else {
        this.webgpuInitSuccess = false;
        this.fallbackReason = capability.reason;
        this.wasmFallback = true;
        executionProviders = ['wasm'];
        this.activeBackend = 'wasm';
      }
    } else {
      executionProviders = ['wasm'];
      this.activeBackend = 'wasm';
    }

    const epRef = await getExecutionProvidersRef();
    const originalEPs = [...epRef.current];
    
    try {
      epRef.current.length = 0;
      epRef.current.push(...executionProviders);

      this.detector = await pipeline('object-detection', this.config.modelId, {
        quantized: true,
      });

      this.state = ModelState.READY;
    } catch (err) {
      epRef.current.length = 0;
      epRef.current.push(...originalEPs);
      
      if (attemptedWebGPU && this.activeBackend === 'webgpu') {
        this.webgpuInitSuccess = false;
        this.fallbackReason = 'webgpu_runtime_init_failed' as WebGPUAvailability;
        this.wasmFallback = true;
        this.activeBackend = 'wasm';
        epRef.current.length = 0;
        epRef.current.push('wasm');
        
        this.detector = await pipeline('object-detection', this.config.modelId, {
          quantized: true,
        });
        this.state = ModelState.READY;
      } else {
        throw err;
      }
    }
  }

  async detect(imageData: ImageData | HTMLCanvasElement | HTMLImageElement | HTMLVideoElement): Promise<RawDetection[]> {
    if (this.state !== ModelState.READY) {
      throw new Error(`Model not ready. State: ${this.state}`);
    }

    if (!this.detector) {
      throw new Error('Detector not initialized');
    }

    const results = await (this.detector as (input: unknown) => Promise<unknown>)(imageData);
    
    const detections: RawDetection[] = [];
    
    if (Array.isArray(results)) {
      for (const result of results) {
        if (result && typeof result === 'object' && 'box' in result && 'score' in result) {
          const box = result.box as { xmin: number; ymin: number; xmax: number; ymax: number };
          const score = result.score as number;
          const label = result.label as string | undefined;
          
          if (score >= this.config.confidenceThreshold) {
            detections.push({
              bbox: [box.xmin, box.ymin, box.xmax - box.xmin, box.ymax - box.ymin],
              score,
              class: label === 'face' ? 1 : 0,
            });
          }
        }
      }
    }

    return this.applyNMS(detections);
  }

  private applyNMS(detections: RawDetection[]): RawDetection[] {
    if (detections.length === 0) return [];

    detections.sort((a, b) => b.score - a.score);

    const keep: RawDetection[] = [];
    
    for (const detection of detections) {
      let shouldKeep = true;
      
      for (const kept of keep) {
        const iou = this.computeIoU(detection.bbox, kept.bbox);
        if (iou > this.config.iouThreshold) {
          shouldKeep = false;
          break;
        }
      }
      
      if (shouldKeep) {
        keep.push(detection);
        if (keep.length >= this.config.maxDetections) break;
      }
    }

    return keep;
  }

  private computeIoU(box1: number[], box2: number[]): number {
    const [x1, y1, w1, h1] = box1;
    const [x2, y2, w2, h2] = box2;

    const xLeft = Math.max(x1, x2);
    const yTop = Math.max(y1, y2);
    const xRight = Math.min(x1 + w1, x2 + w2);
    const yBottom = Math.min(y1 + h1, y2 + h2);

    if (xRight < xLeft || yBottom < yTop) {
      return 0;
    }

    const intersectionArea = (xRight - xLeft) * (yBottom - yTop);
    const box1Area = w1 * h1;
    const box2Area = w2 * h2;
    const unionArea = box1Area + box2Area - intersectionArea;

    return intersectionArea / unionArea;
  }

  async dispose(): Promise<void> {
    this.detector = null;
    this.state = ModelState.NOT_INITIALIZED;
    this.initPromise = null;
    this.error = null;
    this.activeBackend = 'wasm';
    this.webgpuAvailable = false;
    this.webgpuInitSuccess = false;
    this.wasmFallback = false;
    this.fallbackReason = undefined;
    this.initializationTimeMs = undefined;
  }

  static getInstance(config?: Partial<ModelConfig>): LocalVisionModel {
    if (!modelInstance) {
      modelInstance = new LocalVisionModel(config);
    }
    return modelInstance;
  }

  static resetInstance(): void {
    if (modelInstance) {
      modelInstance.dispose();
      modelInstance = null;
    }
  }

  getModelInfo(): ModelInfo {
    return {
      name: 'BlazeFace',
      task: 'face-detection',
      format: 'ONNX',
      runtime: 'Transformers.js (ONNX Runtime Web)',
      backend: this.activeBackend,
      requestedBackend: this.config.backendMode ?? 'auto',
      quantization: 'INT8 (q8)',
      modelSize: '~3 MB',
      license: 'Apache-2.0',
      source: 'https://huggingface.co/Xenova/blazeface',
      bundled: false,
      localInference: true,
    };
  }

  getModelStatus(): ModelStatus {
    return {
      backend: this.activeBackend,
      requestedBackend: this.config.backendMode ?? 'auto',
      modelLoaded: this.state === ModelState.READY,
      inferenceReady: this.state === ModelState.READY,
      webgpuAvailable: this.webgpuAvailable,
      webgpuInitializationSuccess: this.webgpuInitSuccess,
      wasmFallback: this.wasmFallback,
      fallbackReason: this.fallbackReason,
      modelState: this.state,
      initializationTimeMs: this.initializationTimeMs,
      timestamp: Date.now(),
    };
  }

  getConfig(): ModelConfig {
    return { ...this.config };
  }
}

export function createLocalVisionModel(config?: Partial<ModelConfig>): LocalVisionModel {
  return new LocalVisionModel(config);
}