import type { 
  SyntheticSample, 
  ExpectedDetection, 
  ExpectedRedaction,
  ExpectedHiddenElement,
  ExpectedActionOutcome,
  GroundTruthAnnotation,
  SampleMetadata,
  DatasetIndex
} from '../dataset/types';

export type PIIType = 'email' | 'phone' | 'password' | 'credit_card' | 'ssn' | 'address' | 'name' | 'face' | 'government_id' | 'none';
export type DetectionLayer = 1 | 2 | 3 | 4;
export type CapabilityStatus = 'implemented' | 'deferred' | 'partial';

export interface MatchResult {
  groundTruthElementId: string;
  groundTruthType: PIIType;
  groundTruthLayer: DetectionLayer;
  matchedDetection: ActualDetection | null;
  isTruePositive: boolean;
  isFalseNegative: boolean;
}

export interface ActualDetection {
  elementId: string;
  type: PIIType;
  source: string;
  layer: DetectionLayer;
  selector?: string;
  textContent?: string;
  severity?: string;
}

export interface SampleEvaluationResult {
  sampleId: string;
  category: number;
  capabilityStatus: CapabilityStatus;
  matches: MatchResult[];
  actualDetections: ActualDetection[];
  falsePositives: ActualDetection[];
  precision: number;
  recall: number;
  f1: number;
  perTypeMetrics: Record<PIIType, { precision: number; recall: number; f1: number; tp: number; fp: number; fn: number }>;
  perLayerMetrics: Record<DetectionLayer, { precision: number; recall: number; f1: number; tp: number; fp: number; fn: number }>;
  deferredReason?: string;
}

export interface RedactionEvaluationResult {
  sampleId: string;
  category: number;
  totalExpectedRedactions: number;
  correctRedactions: number;
  leakedRedactions: number;
  precision: number;
  leaks: Array<{
    elementId: string;
    piiType: PIIType;
    expectedPlaceholder: string;
    actualTextContent: string;
  }>;
}

export interface SecurityEvaluationResult {
  sampleId: string;
  category: number;
  hiddenInjectionsFiltered: boolean;
  maliciousActionsRejected: boolean;
  rejectedActionsNotExecuted: boolean;
  details: {
    hiddenElementsFound: number;
    hiddenElementsFiltered: number;
    maliciousActionAttempts: number;
    maliciousActionsRejected: number;
    actionsExecuted: number;
  };
}

export interface CategoryEvaluationResult {
  category: number;
  categoryName: string;
  samplesEvaluated: number;
  samplesDeferred: number;
  aggregatePrecision: number;
  aggregateRecall: number;
  aggregateF1: number;
  perTypeAggregate: Record<PIIType, { precision: number; recall: number; f1: number }>;
  perLayerAggregate: Record<DetectionLayer, { precision: number; recall: number; f1: number }>;
  redactionPrecision: number;
  securityPassRate?: number;
}

export interface EvaluationSummary {
  datasetVersion: string;
  totalSamples: number;
  totalEvaluated: number;
  totalDeferred: number;
  overallPrecision: number;
  overallRecall: number;
  overallF1: number;
  overallRedactionPrecision: number;
  categoryResults: CategoryEvaluationResult[];
  timestamp: string;
  evaluatorVersion: string;
}

export interface FullEvaluationResult {
  summary: EvaluationSummary;
  sampleResults: SampleEvaluationResult[];
  redactionResults: RedactionEvaluationResult[];
  securityResults: SecurityEvaluationResult[];
}

export const PII_TYPES: PIIType[] = ['email', 'phone', 'password', 'credit_card', 'ssn', 'address', 'name', 'face', 'government_id'];
export const DETECTION_LAYERS: DetectionLayer[] = [1, 2, 3, 4];

export type { 
  SyntheticSample, 
  ExpectedDetection, 
  ExpectedRedaction,
  ExpectedHiddenElement,
  ExpectedActionOutcome,
  GroundTruthAnnotation,
  SampleMetadata,
  DatasetIndex
};