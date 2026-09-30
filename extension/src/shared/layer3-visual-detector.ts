import type { ExtractedElement } from './dom-extraction';
import type { PIIDetection } from './types';
import { LocalVisionModel, ModelState, type ModelConfig, type RawDetection, type VisionBackend, type BackendSelectionMode } from './local-vision-model';

export interface VisualDetectionResult {
  detections: PIIDetection[];
}

export interface VisualRegion {
  element: Element;
  boundingBox: { x: number; y: number; width: number; height: number };
  type: 'image' | 'canvas' | 'video' | 'svg';
}

export interface FaceDetectionConfig {
  confidenceThreshold: number;
  minFaceSize: number;
  maxFaceSize: number;
}

const DEFAULT_CONFIG: FaceDetectionConfig = {
  confidenceThreshold: 0.7,
  minFaceSize: 20,
  maxFaceSize: 1000,
};

let visionModel: LocalVisionModel | null = null;
let modelConfig: ModelConfig | null = null;

function createVisualDetection(
  type: PIIDetection['type'],
  region: VisualRegion,
  confidence: number,
  reason: string,
  severity: PIIDetection['severity'] = 'high'
): PIIDetection {
  const selector = generateSelector(region.element);
  return {
    type,
    source: 'layer3_visual',
    confidence,
    location: {
      selector,
      boundingBox: region.boundingBox,
    },
    reason,
    severity,
  };
}

function generateSelector(element: Element): string {
  if (element.id) {
    return `#${element.id}`;
  }
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body) {
    let part = current.tagName.toLowerCase();
    if (current.id) {
      part += `#${current.id}`;
      parts.unshift(part);
      break;
    }
    const parent: Element | null = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((el: Element) => el.tagName === current!.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        part += `:nth-of-type(${index})`;
      }
    }
    parts.unshift(part);
    current = parent;
  }
  return parts.join(' > ');
}

function getVisualRegions(extractedElements: ExtractedElement[]): VisualRegion[] {
  const regions: VisualRegion[] = [];
  
  for (const element of extractedElements) {
    if (!element.isVisible) continue;
    
    const tagName = element.tagName.toLowerCase();
    const boundingBox = element.boundingBox;
    
    if (boundingBox.width === 0 || boundingBox.height === 0) continue;
    
    let type: VisualRegion['type'] | null = null;
    
    if (tagName === 'img') {
      type = 'image';
    } else if (tagName === 'canvas') {
      type = 'canvas';
    } else if (tagName === 'video') {
      type = 'video';
    } else if (tagName === 'svg' || (element.attributes['xmlns'] && element.attributes['xmlns'].includes('svg'))) {
      type = 'svg';
    }
    
    if (type) {
      regions.push({
        element: element.element,
        boundingBox,
        type,
      });
    }
  }
  
  return regions;
}

function getModelConfig(config: Partial<FaceDetectionConfig>, backendMode?: BackendSelectionMode): ModelConfig {
  return {
    modelId: 'Xenova/blazeface',
    confidenceThreshold: config.confidenceThreshold ?? DEFAULT_CONFIG.confidenceThreshold,
    inputWidth: 128,
    inputHeight: 128,
    maxDetections: 10,
    iouThreshold: 0.3,
    backendMode,
  };
}

function getOrCreateVisionModel(config: Partial<FaceDetectionConfig>, backendMode?: BackendSelectionMode): LocalVisionModel {
  const newConfig = getModelConfig(config, backendMode);
  
  if (!visionModel || modelConfig?.confidenceThreshold !== newConfig.confidenceThreshold || modelConfig?.backendMode !== newConfig.backendMode) {
    if (visionModel) {
      visionModel.dispose();
    }
    visionModel = new LocalVisionModel(newConfig);
    modelConfig = newConfig;
  }
  
  return visionModel;
}

async function extractImageData(region: VisualRegion): Promise<ImageData | HTMLCanvasElement | HTMLImageElement | HTMLVideoElement | null> {
  const { element } = region;
  const tagName = element.tagName.toLowerCase();
  
  try {
    if (tagName === 'img') {
      const img = element as HTMLImageElement;
      if (img.complete && img.naturalWidth > 0) {
        return img;
      }
      await new Promise<void>((resolve, reject) => {
        if (img.complete) {
          resolve();
        } else {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Image load failed'));
        }
      });
      return img;
    }
    
    if (tagName === 'canvas') {
      return element as HTMLCanvasElement;
    }
    
    if (tagName === 'video') {
      const video = element as HTMLVideoElement;
      if (video.readyState >= 2 && video.videoWidth > 0) {
        return video;
      }
      return null;
    }
    
    if (tagName === 'svg') {
      const svg = element as SVGSVGElement;
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svg);
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      
      try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('SVG render failed'));
          img.src = url;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          return canvas;
        }
        URL.revokeObjectURL(url);
        return null;
      } catch {
        URL.revokeObjectURL(url);
        return null;
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

function convertDetectionsToVisualDetections(
  rawDetections: RawDetection[],
  region: VisualRegion,
  config: FaceDetectionConfig
): PIIDetection[] {
  const detections: PIIDetection[] = [];
  const { boundingBox } = region;
  
  for (const detection of rawDetections) {
    const [, , w, h] = detection.bbox;
    
    const absW = w * boundingBox.width;
    const absH = h * boundingBox.height;
    
    if (absW < config.minFaceSize || absH < config.minFaceSize) continue;
    if (absW > config.maxFaceSize || absH > config.maxFaceSize) continue;
    
    detections.push(createVisualDetection(
      'face',
      region,
      detection.score,
      `Face detected by local vision model (${(detection.score * 100).toFixed(1)}% confidence)`,
      'critical'
    ));
  }
  
  return detections;
}

export function detectLayer3(
  extractedElements: ExtractedElement[],
  config: Partial<FaceDetectionConfig> = {}
): VisualDetectionResult {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const detections: PIIDetection[] = [];
  
  const visualRegions = getVisualRegions(extractedElements);
  
  for (const region of visualRegions) {
    const faceDetections = detectFacesInRegionFallback(region, finalConfig);
    detections.push(...faceDetections);
  }
  
  return { detections };
}

export async function detectLayer3Async(
  extractedElements: ExtractedElement[],
  config: Partial<FaceDetectionConfig> = {}
): Promise<VisualDetectionResult> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const detections: PIIDetection[] = [];
  
  const visualRegions = getVisualRegions(extractedElements);
  
  if (visualRegions.length === 0) {
    return { detections };
  }
  
  const model = getOrCreateVisionModel(finalConfig);
  
  try {
    await model.initialize();
  } catch (error) {
    console.error('[Layer3VisualDetector] Model initialization failed:', error);
    return { detections };
  }
  
  if (model.getState() !== ModelState.READY) {
    return { detections };
  }
  
  for (const region of visualRegions) {
    const imageData = await extractImageData(region);
    if (!imageData) continue;
    
    try {
      const rawDetections = await model.detect(imageData);
      const faceDetections = convertDetectionsToVisualDetections(rawDetections, region, finalConfig);
      detections.push(...faceDetections);
    } catch (error) {
      console.error('[Layer3VisualDetector] Inference failed for region:', error);
    }
  }
  
  return { detections };
}

export interface ModelInferenceResult {
  success: boolean;
  detections: PIIDetection[];
  error?: string;
  modelState: ModelState;
  backend?: VisionBackend;
  requestedBackend?: BackendSelectionMode;
  webgpuAvailable?: boolean;
  webgpuInitializationSuccess?: boolean;
  wasmFallback?: boolean;
  fallbackReason?: string;
  initializationTimeMs?: number;
}

export async function detectLayer3AsyncForExperiment(
  extractedElements: ExtractedElement[],
  config: Partial<FaceDetectionConfig> = {},
  backendMode?: BackendSelectionMode
): Promise<ModelInferenceResult> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const detections: PIIDetection[] = [];
  
  const visualRegions = getVisualRegions(extractedElements);
  
  if (visualRegions.length === 0) {
    return { 
      success: true, 
      detections: [], 
      modelState: ModelState.READY,
      backend: 'wasm',
      requestedBackend: backendMode ?? 'auto',
      webgpuAvailable: false,
      webgpuInitializationSuccess: false,
      wasmFallback: false,
    };
  }
  
  const model = getOrCreateVisionModel(finalConfig, backendMode);
  
  try {
    await model.initialize();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return { 
      success: false, 
      detections: [], 
      error: `Model initialization failed: ${err.message}`,
      modelState: model.getState(),
      backend: model.getActiveBackend(),
      requestedBackend: model.getRequestedBackendMode(),
      webgpuAvailable: false,
      webgpuInitializationSuccess: false,
      wasmFallback: model.isWasmFallback(),
      fallbackReason: model.getFallbackReason(),
      initializationTimeMs: model.getInitializationTimeMs(),
    };
  }
  
  if (model.getState() !== ModelState.READY) {
    return { 
      success: false, 
      detections: [], 
      error: `Model not ready. State: ${model.getState()}`,
      modelState: model.getState(),
      backend: model.getActiveBackend(),
      requestedBackend: model.getRequestedBackendMode(),
      webgpuAvailable: false,
      webgpuInitializationSuccess: false,
      wasmFallback: model.isWasmFallback(),
      fallbackReason: model.getFallbackReason(),
      initializationTimeMs: model.getInitializationTimeMs(),
    };
  }
  
  for (const region of visualRegions) {
    const imageData = await extractImageData(region);
    if (!imageData) continue;
    
    try {
      const rawDetections = await model.detect(imageData);
      const faceDetections = convertDetectionsToVisualDetections(rawDetections, region, finalConfig);
      detections.push(...faceDetections);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return { 
        success: false, 
        detections, 
        error: `Inference failed for region: ${err.message}`,
        modelState: model.getState(),
        backend: model.getActiveBackend(),
        requestedBackend: model.getRequestedBackendMode(),
        webgpuAvailable: false,
        webgpuInitializationSuccess: false,
        wasmFallback: model.isWasmFallback(),
        fallbackReason: model.getFallbackReason(),
        initializationTimeMs: model.getInitializationTimeMs(),
      };
    }
  }
  
  return { 
    success: true, 
    detections, 
    modelState: ModelState.READY,
    backend: model.getActiveBackend(),
    requestedBackend: model.getRequestedBackendMode(),
    webgpuAvailable: model.getModelStatus().webgpuAvailable,
    webgpuInitializationSuccess: model.getModelStatus().webgpuInitializationSuccess,
    wasmFallback: model.getModelStatus().wasmFallback,
    fallbackReason: model.getModelStatus().fallbackReason,
    initializationTimeMs: model.getModelStatus().initializationTimeMs,
  };
}

function detectFacesInRegionFallback(region: VisualRegion, config: FaceDetectionConfig): PIIDetection[] {
  const detections: PIIDetection[] = [];
  
  const { boundingBox } = region;
  
  if (boundingBox.width < config.minFaceSize || boundingBox.height < config.minFaceSize) {
    return detections;
  }
  
  if (boundingBox.width > config.maxFaceSize || boundingBox.height > config.maxFaceSize) {
    return detections;
  }
  
  const hasFaceIndicators = checkForFaceIndicators(region);
  
  if (hasFaceIndicators) {
    const confidence = Math.min(0.9, 0.6 + (hasFaceIndicators * 0.1));
    
    if (confidence >= config.confidenceThreshold) {
      detections.push(createVisualDetection(
        'face',
        region,
        confidence,
        `Face-like pattern detected in ${region.type} region (fallback)`,
        'critical'
      ));
    }
  }
  
  return detections;
}

function checkForFaceIndicators(region: VisualRegion): number {
  const element = region.element;
  const tagName = element.tagName.toLowerCase();
  let indicators = 0;
  
  if (tagName === 'svg') {
    const svgElement = element as SVGSVGElement;
    const circles = svgElement.querySelectorAll('circle');
    const paths = svgElement.querySelectorAll('path');
    
    let eyeCount = 0;
    let mouthCount = 0;
    let faceShapeCount = 0;
    
    circles.forEach(circle => {
      const r = parseFloat(circle.getAttribute('r') || '0');
      
      if (r > 2 && r < 20) {
        eyeCount++;
      }
      if (r > 20 && r < 60) {
        faceShapeCount++;
      }
    });
    
    paths.forEach(path => {
      const d = path.getAttribute('d') || '';
      if (d.includes('Q') && (d.includes('mouth') || d.includes('Mouth') || 
          (d.match(/M\d+,\d+\s*Q\d+,\d+\s*\d+,\d+/) && d.includes('70')))) {
        mouthCount++;
      }
    });
    
    if (eyeCount >= 2 && faceShapeCount >= 1) {
      indicators += 2;
    }
    if (mouthCount >= 1) {
      indicators += 1;
    }
  }
  
  if (tagName === 'img') {
    const src = element.getAttribute('src') || '';
    const alt = element.getAttribute('alt') || '';
    const className = element.className || '';
    const id = element.id || '';
    
    const faceKeywords = ['face', 'avatar', 'profile', 'portrait', 'headshot', 'id-card', 'idcard', 'passport', 'driver'];
    const allText = `${src} ${alt} ${className} ${id}`.toLowerCase();
    
    for (const keyword of faceKeywords) {
      if (allText.includes(keyword)) {
        indicators += 1;
      }
    }
  }
  
  if (tagName === 'canvas') {
    const className = element.className || '';
    const id = element.id || '';
    const allText = `${className} ${id}`.toLowerCase();
    
    if (allText.includes('face') || allText.includes('avatar') || allText.includes('portrait')) {
      indicators += 1;
    }
  }
  
  return indicators;
}

export { DEFAULT_CONFIG as defaultFaceDetectionConfig };
export { LocalVisionModel, ModelState } from './local-vision-model';
export type { ModelConfig, ModelInfo, RawDetection, VisionBackend, BackendSelectionMode } from './local-vision-model';