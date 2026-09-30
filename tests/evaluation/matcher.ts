import type { 
  PIIType, 
  DetectionLayer, 
  MatchResult, 
  ActualDetection,
  SampleEvaluationResult,
  PII_TYPES,
  DETECTION_LAYERS
} from './types';

export function sourceToLayer(source: string): number {
  switch (source) {
    case 'layer1_typed_field': return 1;
    case 'layer2_regex': return 2;
    case 'layer3_visual': return 3;
    case 'layer4_ocr': return 4;
    default: return 1;
  }
}

export function matchDetections(
  groundTruth: Array<{ element_id: string; type: PIIType; expected_layer: DetectionLayer }>,
  actualDetections: ActualDetection[]
): { matches: MatchResult[]; falsePositives: ActualDetection[] } {
  const usedActual = new Set<number>();
  const matches: MatchResult[] = [];

  for (const gt of groundTruth) {
    let matchedDetection: ActualDetection | null = null;
    let bestMatchIndex = -1;

    for (let i = 0; i < actualDetections.length; i++) {
      const actual = actualDetections[i];
      if (usedActual.has(i)) continue;

      if (actual.elementId === gt.element_id && actual.type === gt.type) {
        matchedDetection = actual;
        bestMatchIndex = i;
        break;
      }
    }

    if (matchedDetection) {
      usedActual.add(bestMatchIndex);
      matches.push({
        groundTruthElementId: gt.element_id,
        groundTruthType: gt.type,
        groundTruthLayer: gt.expected_layer,
        matchedDetection,
        isTruePositive: true,
        isFalseNegative: false,
      });
    } else {
      matches.push({
        groundTruthElementId: gt.element_id,
        groundTruthType: gt.type,
        groundTruthLayer: gt.expected_layer,
        matchedDetection: null,
        isTruePositive: false,
        isFalseNegative: true,
      });
    }
  }

  const falsePositives: ActualDetection[] = [];
  for (let i = 0; i < actualDetections.length; i++) {
    if (!usedActual.has(i)) {
      falsePositives.push(actualDetections[i]);
    }
  }

  return { matches, falsePositives };
}

export function calculateMetrics(
  matches: MatchResult[],
  falsePositives: ActualDetection[],
  piiTypes: PIIType[],
  detectionLayers: DetectionLayer[]
): {
  overallPrecision: number;
  overallRecall: number;
  overallF1: number;
  perTypeMetrics: Record<string, { precision: number; recall: number; f1: number; tp: number; fp: number; fn: number }>;
  perLayerMetrics: Record<number, { precision: number; recall: number; f1: number; tp: number; fp: number; fn: number }>;
} {
  let totalTP = 0;
  let totalFP = falsePositives.length;
  let totalFN = 0;

  const perType: Record<string, { tp: number; fp: number; fn: number }> = {};
  const perLayer: Record<number, { tp: number; fp: number; fn: number }> = {};

  for (const pt of piiTypes) {
    perType[pt] = { tp: 0, fp: 0, fn: 0 };
  }
  for (const dl of detectionLayers) {
    perLayer[dl] = { tp: 0, fp: 0, fn: 0 };
  }

  for (const match of matches) {
    if (match.isTruePositive) {
      totalTP++;
      perType[match.groundTruthType].tp++;
      perLayer[match.groundTruthLayer].tp++;
    } else {
      totalFN++;
      perType[match.groundTruthType].fn++;
      perLayer[match.groundTruthLayer].fn++;
    }
  }

  for (const fp of falsePositives) {
    if (piiTypes.includes(fp.type)) {
      perType[fp.type].fp++;
    }
    const layer = sourceToLayer(fp.source) as DetectionLayer;
    if (detectionLayers.includes(layer)) {
      perLayer[layer].fp++;
    }
  }

  const perTypeMetrics: Record<string, { precision: number; recall: number; f1: number; tp: number; fp: number; fn: number }> = {};
  for (const pt of piiTypes) {
    const { tp, fp, fn } = perType[pt];
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
    perTypeMetrics[pt] = { precision, recall, f1, tp, fp, fn };
  }

  const perLayerMetrics: Record<number, { precision: number; recall: number; f1: number; tp: number; fp: number; fn: number }> = {};
  for (const dl of detectionLayers) {
    const { tp, fp, fn } = perLayer[dl];
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
    perLayerMetrics[dl] = { precision, recall, f1, tp, fp, fn };
  }

  const overallPrecision = totalTP + totalFP > 0 ? totalTP / (totalTP + totalFP) : 0;
  const overallRecall = totalTP + totalFN > 0 ? totalTP / (totalTP + totalFN) : 0;
  const overallF1 = overallPrecision + overallRecall > 0 ? 2 * overallPrecision * overallRecall / (overallPrecision + overallRecall) : 0;

  return {
    overallPrecision,
    overallRecall,
    overallF1,
    perTypeMetrics,
    perLayerMetrics,
  };
}

