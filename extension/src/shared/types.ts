export type PIIDetectionSource = 'layer1_typed_field' | 'layer2_regex' | 'layer3_visual' | 'layer4_ocr' | 'unknown';

export interface PIIDetection {
  type: 'email' | 'phone' | 'password' | 'credit_card' | 'ssn' | 'address' | 'name' | 'face' | 'unknown';
  source: PIIDetectionSource;
  confidence: number;
  location: {
    selector?: string;
    boundingBox?: { x: number; y: number; width: number; height: number };
    textOffset?: { start: number; end: number };
  };
  originalValue?: string;
  reason?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

export interface RedactionAction {
  type: 'mask' | 'blur' | 'placeholder' | 'exclude';
  target: PIIDetection;
  replacement?: string;
}

export interface SanitizedContext {
  metadata: {
    url: string;
    timestamp: number;
    domElements: DOMElementMetadata[];
    visualRegions?: VisualRegionMetadata[];
  };
  redactions: RedactionAction[];
}

export interface DOMElementMetadata {
  tagName: string;
  attributes: Record<string, string>;
  boundingBox: { x: number; y: number; width: number; height: number };
  textContent?: string;
  isInteractive: boolean;
  isVisible: boolean;
  piiDetections: PIIDetection[];
}

export interface VisualRegionMetadata {
  boundingBox: { x: number; y: number; width: number; height: number };
  description: string;
  piiDetections: PIIDetection[];
  requiresVisionModel: boolean;
}

export interface SanitizedElement {
  id: string;
  role: string;
  label: string;
  sensitive: boolean;
  bbox: { x: number; y: number; width: number; height: number };
}

export interface SanitizedPage {
  url_origin: string;
  title: string;
  viewport: { width: number; height: number };
}

export interface StructuredSanitizedContext {
  page: SanitizedPage;
  elements: SanitizedElement[];
}

export type ActionType = 'click' | 'fill' | 'scroll' | 'focus' | 'select';

export type ActionValidationFailureReason =
  | 'INVALID_SCHEMA'
  | 'UNSUPPORTED_ACTION'
  | 'TARGET_NOT_FOUND'
  | 'AMBIGUOUS_TARGET'
  | 'ORIGIN_MISMATCH'
  | 'TARGET_CHANGED'
  | 'SENSITIVE_ACTION'
  | 'STALE_ACTION'
  | 'INVALID_VALUE_REF'
  | 'INVISIBLE_TARGET'
  | 'DISABLED_TARGET'
  | 'MISSING_REASONING_ID'
  | 'INVALID_SELECTOR'
  | 'UNEXPECTED_FIELDS';

export interface Action {
  action: ActionType;
  target: string;
  parameters?: Record<string, unknown>;
  reasoning_id: string;
  value_ref?: string;
}

export interface ActionValidationResult {
  valid: boolean;
  reason?: ActionValidationFailureReason;
  details?: string;
  sanitizedAction?: Action;
}

export interface ValidationContext {
  currentUrl: string;
  currentOrigin: string;
  domElements: DOMElementMetadata[];
  valueRefStore: Record<string, string>;
  knownReasoningIds: Set<string>;
  sensitiveFormDetected: boolean;
  allowedOrigins: string[];
}