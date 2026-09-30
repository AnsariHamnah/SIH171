import type { ExtractedElement } from './dom-extraction';
import type { PIIDetection } from './types';
import { detectLayer1, Layer1DetectionResult } from './layer1-detector';
import { detectLayer2, Layer2DetectionResult } from './layer2-detector';
import { detectLayer3, detectLayer3Async, VisualDetectionResult } from './layer3-visual-detector';
import { evaluateVisionGate, VisionGateDecision } from './vision-gate';

export interface VisionGateInfo {
  decision: VisionGateDecision;
  visionInvoked: boolean;
  visionSkipped: boolean;
}

export interface CombinedDetectionResult {
  detections: PIIDetection[];
  layer1Result: Layer1DetectionResult;
  layer2Result: Layer2DetectionResult;
  layer3Result: VisualDetectionResult;
  visionGateInfo: VisionGateInfo;
}

export function runDetectionPipeline(extractedElements: ExtractedElement[]): CombinedDetectionResult {
  const layer1Result = detectLayer1(extractedElements);
  const layer2Result = detectLayer2(extractedElements);
  
  const gateDecision = evaluateVisionGate(extractedElements);
  
  let layer3Result: VisualDetectionResult;
  let visionInvoked = false;
  let visionSkipped = false;
  
  if (gateDecision.shouldRunVision) {
    layer3Result = detectLayer3(extractedElements);
    visionInvoked = true;
  } else {
    layer3Result = { detections: [] };
    visionSkipped = true;
  }

  const allDetections: PIIDetection[] = [
    ...layer1Result.detections,
    ...layer2Result.detections,
    ...layer3Result.detections,
  ];

  return {
    detections: allDetections,
    layer1Result,
    layer2Result,
    layer3Result,
    visionGateInfo: {
      decision: gateDecision,
      visionInvoked,
      visionSkipped,
    },
  };
}

export async function runDetectionPipelineAsync(extractedElements: ExtractedElement[]): Promise<CombinedDetectionResult> {
  const layer1Result = detectLayer1(extractedElements);
  const layer2Result = detectLayer2(extractedElements);
  
  const gateDecision = evaluateVisionGate(extractedElements);
  
  let layer3Result: VisualDetectionResult;
  let visionInvoked = false;
  let visionSkipped = false;
  
  if (gateDecision.shouldRunVision) {
    layer3Result = await detectLayer3Async(extractedElements);
    visionInvoked = true;
  } else {
    layer3Result = { detections: [] };
    visionSkipped = true;
  }

  const allDetections: PIIDetection[] = [
    ...layer1Result.detections,
    ...layer2Result.detections,
    ...layer3Result.detections,
  ];

  return {
    detections: allDetections,
    layer1Result,
    layer2Result,
    layer3Result,
    visionGateInfo: {
      decision: gateDecision,
      visionInvoked,
      visionSkipped,
    },
  };
}

export function groupDetectionsByElement(
  extractedElements: ExtractedElement[],
  detections: PIIDetection[]
): Map<Element, PIIDetection[]> {
  const map = new Map<Element, PIIDetection[]>();
  
  for (const detection of detections) {
    const selector = detection.location.selector;
    if (!selector) continue;
    
    let targetElement: Element | null = null;
    try {
      targetElement = document.querySelector(selector);
    } catch {
      continue;
    }
    
    if (targetElement) {
      const existing = map.get(targetElement) || [];
      existing.push(detection);
      map.set(targetElement, existing);
    }
  }
  
  return map;
}

export function getElementDetections(
  extractedElements: ExtractedElement[],
  detectionsMap: Map<Element, PIIDetection[]>
): PIIDetection[] {
  const elementDetections: PIIDetection[] = [];
  
  for (const extracted of extractedElements) {
    const detections = detectionsMap.get(extracted.element);
    if (detections) {
      elementDetections.push(...detections);
    }
  }
  
  return elementDetections;
}