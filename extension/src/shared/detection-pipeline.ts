import type { ExtractedElement } from './dom-extraction';
import type { PIIDetection } from './types';
import { detectLayer1, Layer1DetectionResult } from './layer1-detector';
import { detectLayer2, Layer2DetectionResult } from './layer2-detector';

export interface CombinedDetectionResult {
  detections: PIIDetection[];
  layer1Result: Layer1DetectionResult;
  layer2Result: Layer2DetectionResult;
}

export function runDetectionPipeline(extractedElements: ExtractedElement[]): CombinedDetectionResult {
  const layer1Result = detectLayer1(extractedElements);
  const layer2Result = detectLayer2(extractedElements);

  const allDetections: PIIDetection[] = [
    ...layer1Result.detections,
    ...layer2Result.detections,
  ];

  return {
    detections: allDetections,
    layer1Result,
    layer2Result,
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