import type { VisualRegion, VisualDetectionResult } from './layer3-visual-detector';
import type { ExtractedElement } from './dom-extraction';
import type { PIIDetection } from './types';
import { RedactionRegion, RedactionOptions, DEFAULT_REDACTION_OPTIONS, redactCanvasRegions, captureElementAsCanvas, getRedactionRegionsFromDetections } from './visual-redaction';

export interface ScreenshotData {
  dataUrl: string;
  width: number;
  height: number;
  timestamp: number;
}

export interface VisualRegionResult {
  region: VisualRegion;
  canvas: HTMLCanvasElement | null;
  detections: PIIDetection[];
  redactedCanvas: HTMLCanvasElement | null;
}

export interface VisualPerceptionResult {
  screenshot: ScreenshotData | null;
  regions: VisualRegionResult[];
  allDetections: PIIDetection[];
  success: boolean;
  error?: string;
}

export interface VisualPerceptionConfig {
  captureFullPage: boolean;
  maxDimension: number;
  redactionOptions: RedactionOptions;
}

const DEFAULT_CONFIG: VisualPerceptionConfig = {
  captureFullPage: false,
  maxDimension: 2048,
  redactionOptions: DEFAULT_REDACTION_OPTIONS,
};

async function captureScreenshot(config: VisualPerceptionConfig): Promise<ScreenshotData | null> {
  try {
    let width: number;
    let height: number;
    
    if (config.captureFullPage) {
      width = document.documentElement.scrollWidth;
      height = document.documentElement.scrollHeight;
    } else {
      width = window.innerWidth || document.documentElement.clientWidth;
      height = window.innerHeight || document.documentElement.clientHeight;
    }
    
    if (width > config.maxDimension || height > config.maxDimension) {
      const scale = Math.min(config.maxDimension / width, config.maxDimension / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    const dataUrl = canvas.toDataURL('image/png');
    
    return {
      dataUrl,
      width,
      height,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('[VisualPerception] Screenshot capture failed:', error);
    return null;
  }
}

async function processVisualRegion(
  region: VisualRegion,
  detectionResult: VisualDetectionResult,
  redactionOptions: RedactionOptions
): Promise<VisualRegionResult> {
  const canvas = captureElementAsCanvas(region.element);
  
  if (!canvas) {
    return {
      region,
      canvas: null,
      detections: detectionResult.detections,
      redactedCanvas: null,
    };
  }
  
  const redactionRegions = getRedactionRegionsFromDetections(detectionResult.detections);
  
  const redactedCanvas = redactionRegions.length > 0
    ? createRedactedCanvas(canvas, redactionRegions, redactionOptions)
    : canvas;
  
  return {
    region,
    canvas,
    detections: detectionResult.detections,
    redactedCanvas,
  };
}

function createRedactedCanvas(
  sourceCanvas: HTMLCanvasElement,
  regions: RedactionRegion[],
  options: RedactionOptions
): HTMLCanvasElement | null {
  const resultCanvas = document.createElement('canvas');
  resultCanvas.width = sourceCanvas.width;
  resultCanvas.height = sourceCanvas.height;
  
  const ctx = resultCanvas.getContext('2d');
  if (!ctx) return null;
  
  ctx.drawImage(sourceCanvas, 0, 0);
  
  const result = redactCanvasRegions(resultCanvas, regions, options);
  
  if (!result.success) return null;
  
  return resultCanvas;
}

export async function runVisualPerceptionPipeline(
  extractedElements: ExtractedElement[],
  detectionResult: VisualDetectionResult,
  config: Partial<VisualPerceptionConfig> = {}
): Promise<VisualPerceptionResult> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const allDetections: PIIDetection[] = [...detectionResult.detections];
  
  const visualRegions = getVisualRegionsFromElements(extractedElements);
  
  const regions: VisualRegionResult[] = [];
  
  for (const region of visualRegions) {
    const regionDetections = detectionResult.detections.filter(
      d => d.location.boundingBox && 
      boxesOverlap(d.location.boundingBox, region.boundingBox)
    );
    
    if (regionDetections.length === 0) continue;
    
    const regionResult = await processVisualRegion(
      region,
      { detections: regionDetections },
      finalConfig.redactionOptions
    );
    
    regions.push(regionResult);
  }
  
  const screenshot = await captureScreenshot(finalConfig);
  
  return {
    screenshot,
    regions,
    allDetections,
    success: true,
  };
}

function getVisualRegionsFromElements(extractedElements: ExtractedElement[]): VisualRegion[] {
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

function boxesOverlap(box1: { x: number; y: number; width: number; height: number }, box2: { x: number; y: number; width: number; height: number }): boolean {
  return !(
    box1.x + box1.width <= box2.x ||
    box2.x + box2.width <= box1.x ||
    box1.y + box1.height <= box2.y ||
    box2.y + box2.height <= box1.y
  );
}

export { DEFAULT_CONFIG as defaultVisualPerceptionConfig };