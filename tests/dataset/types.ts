export type PIIType = 'email' | 'phone' | 'password' | 'credit_card' | 'ssn' | 'address' | 'name' | 'face' | 'government_id' | 'none';

export type DetectionLayer = 1 | 2 | 3 | 4;

export interface GroundTruthAnnotation {
  element_id: string;
  type: PIIType;
  expected_layer: DetectionLayer;
  description?: string;
}

export interface SampleMetadata {
  id: string;
  category: number;
  description: string;
  html_file: string;
  url_origin: string;
  title: string;
}

export interface ExpectedDetection {
  element_id: string;
  pii_type: PIIType;
  detection_layer: DetectionLayer;
  selector?: string;
  text_content?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

export interface ExpectedRedaction {
  element_id: string;
  pii_type: PIIType;
  expected_placeholder: string;
  original_value: string;
}

export interface ExpectedHiddenElement {
  element_id: string;
  hidden_method: 'display:none' | 'visibility:hidden' | 'opacity:0' | 'off-screen' | 'script' | 'style';
  contains_injection_text: boolean;
  injection_text_preview?: string;
}

export interface ExpectedActionOutcome {
  target_selector: string;
  action_type: 'click' | 'fill' | 'scroll' | 'focus' | 'select';
  expected_validation: 'pass' | 'fail';
  expected_failure_reason?: string;
  is_malicious: boolean;
  description: string;
}

export interface SyntheticSample {
  metadata: SampleMetadata;
  ground_truth: GroundTruthAnnotation[];
  expected_detections: ExpectedDetection[];
  expected_redactions: ExpectedRedaction[];
  expected_hidden_elements: ExpectedHiddenElement[];
  expected_action_outcomes: ExpectedActionOutcome[];
}

export interface DatasetIndex {
  version: string;
  created: string;
  categories: {
    [category: number]: {
      name: string;
      description: string;
      samples: string[];
    };
  };
  samples: SyntheticSample[];
}