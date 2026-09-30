import { describe, it, expect, beforeEach, vi } from 'vitest';
import { matchDetections, calculateMetrics, sourceToLayer } from '../evaluation/matcher';
import { evaluateRedaction } from '../evaluation/redaction-evaluator';
import { evaluateSecurity } from '../evaluation/security-evaluator';
import type { PIIType, DetectionLayer, ActualDetection } from '../evaluation/types';

describe('Phase 9 - Evaluation Harness', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('sourceToLayer', () => {
    it('maps layer1_typed_field to layer 1', () => {
      expect(sourceToLayer('layer1_typed_field')).toBe(1);
    });

    it('maps layer2_regex to layer 2', () => {
      expect(sourceToLayer('layer2_regex')).toBe(2);
    });

    it('maps layer3_visual to layer 3', () => {
      expect(sourceToLayer('layer3_visual')).toBe(3);
    });

    it('maps layer4_ocr to layer 4', () => {
      expect(sourceToLayer('layer4_ocr')).toBe(4);
    });

    it('defaults unknown sources to layer 1', () => {
      expect(sourceToLayer('unknown')).toBe(1);
    });
  });

  describe('matchDetections', () => {
    it('matches exact element_id and type', () => {
      const groundTruth = [
        { element_id: 'email', type: 'email' as PIIType, expected_layer: 1 as DetectionLayer },
        { element_id: 'password', type: 'password' as PIIType, expected_layer: 1 as DetectionLayer },
      ];
      const actual: ActualDetection[] = [
        { elementId: 'email', type: 'email' as PIIType, source: 'layer1_typed_field', layer: 1 as DetectionLayer, selector: '#email' },
        { elementId: 'password', type: 'password' as PIIType, source: 'layer1_typed_field', layer: 1 as DetectionLayer, selector: '#password' },
      ];

      const { matches, falsePositives } = matchDetections(groundTruth, actual);

      expect(matches.length).toBe(2);
      expect(matches[0].isTruePositive).toBe(true);
      expect(matches[1].isTruePositive).toBe(true);
      expect(falsePositives.length).toBe(0);
    });

    it('detects false negative when ground truth not detected', () => {
      const groundTruth = [
        { element_id: 'email', type: 'email' as PIIType, expected_layer: 1 as DetectionLayer },
        { element_id: 'password', type: 'password' as PIIType, expected_layer: 1 as DetectionLayer },
      ];
      const actual: ActualDetection[] = [
        { elementId: 'email', type: 'email' as PIIType, source: 'layer1_typed_field', layer: 1 as DetectionLayer, selector: '#email' },
      ];

      const { matches, falsePositives } = matchDetections(groundTruth, actual);

      expect(matches.length).toBe(2);
      expect(matches[0].isTruePositive).toBe(true);
      expect(matches[1].isTruePositive).toBe(false);
      expect(matches[1].isFalseNegative).toBe(true);
      expect(falsePositives.length).toBe(0);
    });

    it('detects false positive when extra detection found', () => {
      const groundTruth = [
        { element_id: 'email', type: 'email' as PIIType, expected_layer: 1 as DetectionLayer },
      ];
      const actual: ActualDetection[] = [
        { elementId: 'email', type: 'email' as PIIType, source: 'layer1_typed_field', layer: 1 as DetectionLayer, selector: '#email' },
        { elementId: 'phone', type: 'phone' as PIIType, source: 'layer2_regex', layer: 2 as DetectionLayer, selector: '#phone' },
      ];

      const { matches, falsePositives } = matchDetections(groundTruth, actual);

      expect(matches.length).toBe(1);
      expect(matches[0].isTruePositive).toBe(true);
      expect(falsePositives.length).toBe(1);
      expect(falsePositives[0].elementId).toBe('phone');
    });

    it('handles empty ground truth', () => {
      const groundTruth: Array<{ element_id: string; type: PIIType; expected_layer: DetectionLayer }> = [];
      const actual: ActualDetection[] = [
        { elementId: 'email', type: 'email' as PIIType, source: 'layer1_typed_field', layer: 1 as DetectionLayer, selector: '#email' },
      ];

      const { matches, falsePositives } = matchDetections(groundTruth, actual);

      expect(matches.length).toBe(0);
      expect(falsePositives.length).toBe(1);
    });

    it('handles empty actual detections', () => {
      const groundTruth = [
        { element_id: 'email', type: 'email' as PIIType, expected_layer: 1 as DetectionLayer },
      ];
      const actual: ActualDetection[] = [];

      const { matches, falsePositives } = matchDetections(groundTruth, actual);

      expect(matches.length).toBe(1);
      expect(matches[0].isTruePositive).toBe(false);
      expect(matches[0].isFalseNegative).toBe(true);
      expect(falsePositives.length).toBe(0);
    });
  });

  describe('calculateMetrics', () => {
    it('calculates perfect precision/recall for all true positives', () => {
      const matches = [
        { groundTruthElementId: 'email', groundTruthType: 'email' as PIIType, groundTruthLayer: 1 as DetectionLayer, matchedDetection: { elementId: 'email', type: 'email' as PIIType, source: 'layer1_typed_field', layer: 1 as DetectionLayer }, isTruePositive: true, isFalseNegative: false },
        { groundTruthElementId: 'password', groundTruthType: 'password' as PIIType, groundTruthLayer: 1 as DetectionLayer, matchedDetection: { elementId: 'password', type: 'password' as PIIType, source: 'layer1_typed_field', layer: 1 as DetectionLayer }, isTruePositive: true, isFalseNegative: false },
      ];
      const falsePositives: ActualDetection[] = [];

      const metrics = calculateMetrics(matches, falsePositives, ['email', 'password'], [1]);

      expect(metrics.overallPrecision).toBe(1);
      expect(metrics.overallRecall).toBe(1);
      expect(metrics.overallF1).toBe(1);
      expect(metrics.perTypeMetrics.email.precision).toBe(1);
      expect(metrics.perTypeMetrics.email.recall).toBe(1);
      expect(metrics.perTypeMetrics.password.precision).toBe(1);
      expect(metrics.perTypeMetrics.password.recall).toBe(1);
      expect(metrics.perLayerMetrics[1].precision).toBe(1);
      expect(metrics.perLayerMetrics[1].recall).toBe(1);
    });

    it('calculates 50% precision/recall for 1 TP, 1 FP, 1 FN', () => {
      const matches = [
        { groundTruthElementId: 'email', groundTruthType: 'email' as PIIType, groundTruthLayer: 1 as DetectionLayer, matchedDetection: { elementId: 'email', type: 'email' as PIIType, source: 'layer1_typed_field', layer: 1 as DetectionLayer }, isTruePositive: true, isFalseNegative: false },
        { groundTruthElementId: 'phone', groundTruthType: 'phone' as PIIType, groundTruthLayer: 1 as DetectionLayer, matchedDetection: null, isTruePositive: false, isFalseNegative: true },
      ];
      const falsePositives: ActualDetection[] = [
        { elementId: 'credit_card', type: 'credit_card' as PIIType, source: 'layer1_typed_field', layer: 1 as DetectionLayer },
      ];

      const metrics = calculateMetrics(matches, falsePositives, ['email', 'phone', 'credit_card'], [1]);

      expect(metrics.overallPrecision).toBe(0.5);
      expect(metrics.overallRecall).toBe(0.5);
      expect(metrics.overallF1).toBe(0.5);
    });

    it('handles zero detections gracefully', () => {
      const matches: any[] = [];
      const falsePositives: ActualDetection[] = [];

      const metrics = calculateMetrics(matches, falsePositives, ['email'], [1]);

      expect(metrics.overallPrecision).toBe(0);
      expect(metrics.overallRecall).toBe(0);
      expect(metrics.overallF1).toBe(0);
    });

    it('calculates per-type metrics correctly', () => {
      const matches = [
        { groundTruthElementId: 'email', groundTruthType: 'email' as PIIType, groundTruthLayer: 1 as DetectionLayer, matchedDetection: { elementId: 'email', type: 'email' as PIIType, source: 'layer1_typed_field', layer: 1 as DetectionLayer }, isTruePositive: true, isFalseNegative: false },
      ];
      const falsePositives: ActualDetection[] = [
        { elementId: 'phone', type: 'phone' as PIIType, source: 'layer2_regex', layer: 2 as DetectionLayer },
      ];

      const metrics = calculateMetrics(matches, falsePositives, ['email', 'phone'], [1, 2]);

      expect(metrics.perTypeMetrics.email.precision).toBe(1);
      expect(metrics.perTypeMetrics.email.recall).toBe(1);
      expect(metrics.perTypeMetrics.phone.precision).toBe(0);
      expect(metrics.perTypeMetrics.phone.recall).toBe(0);
      expect(metrics.perLayerMetrics[1].precision).toBe(1);
      expect(metrics.perLayerMetrics[2].precision).toBe(0);
    });
  });

  describe('evaluateRedaction', () => {
    it('returns precision 1 when all redactions correct', () => {
      const sanitizedContext = {
        metadata: {
          domElements: [
            { attributes: { id: 'email' }, textContent: '[EMAIL]' },
            { attributes: { id: 'password' }, textContent: '[PASSWORD]' },
          ],
        },
      };

      const result = evaluateRedaction('test', 1, [
        { element_id: 'email', pii_type: 'email' as PIIType, expected_placeholder: '[EMAIL]', original_value: 'test@example.test' },
        { element_id: 'password', pii_type: 'password' as PIIType, expected_placeholder: '[PASSWORD]', original_value: 'secret123' },
      ], sanitizedContext);

      expect(result.precision).toBe(1);
      expect(result.correctRedactions).toBe(2);
      expect(result.leakedRedactions).toBe(0);
      expect(result.leaks.length).toBe(0);
    });

    it('detects leaked redaction when original value present', () => {
      const sanitizedContext = {
        metadata: {
          domElements: [
            { attributes: { id: 'email' }, textContent: 'test@example.test' },
          ],
        },
      };

      const result = evaluateRedaction('test', 1, [
        { element_id: 'email', pii_type: 'email' as PIIType, expected_placeholder: '[EMAIL]', original_value: 'test@example.test' },
      ], sanitizedContext);

      expect(result.precision).toBe(0);
      expect(result.correctRedactions).toBe(0);
      expect(result.leakedRedactions).toBe(1);
      expect(result.leaks.length).toBe(1);
      expect(result.leaks[0].actualTextContent).toBe('test@example.test');
    });

    it('detects missing element as leak', () => {
      const sanitizedContext = {
        metadata: {
          domElements: [],
        },
      };

      const result = evaluateRedaction('test', 1, [
        { element_id: 'email', pii_type: 'email' as PIIType, expected_placeholder: '[EMAIL]', original_value: 'test@example.test' },
      ], sanitizedContext);

      expect(result.precision).toBe(0);
      expect(result.leakedRedactions).toBe(1);
      expect(result.leaks[0].actualTextContent).toBe('ELEMENT_NOT_FOUND');
    });

    it('handles partial redactions correctly', () => {
      const sanitizedContext = {
        metadata: {
          domElements: [
            { attributes: { id: 'email' }, textContent: '[EMAIL]' },
            { attributes: { id: 'password' }, textContent: 'secret123' },
          ],
        },
      };

      const result = evaluateRedaction('test', 1, [
        { element_id: 'email', pii_type: 'email' as PIIType, expected_placeholder: '[EMAIL]', original_value: 'test@example.test' },
        { element_id: 'password', pii_type: 'password' as PIIType, expected_placeholder: '[PASSWORD]', original_value: 'secret123' },
      ], sanitizedContext);

      expect(result.precision).toBe(0.5);
      expect(result.correctRedactions).toBe(1);
      expect(result.leakedRedactions).toBe(1);
    });
  });

  describe('evaluateSecurity', () => {
    it('passes when all hidden injections filtered', () => {
      const result = evaluateSecurity({
        sampleId: 'test',
        category: 5,
        hiddenElements: [
          { element_id: 'inj1', hidden_method: 'display:none', contains_injection_text: true },
          { element_id: 'inj2', hidden_method: 'visibility:hidden', contains_injection_text: true },
        ],
        expectedActionOutcomes: [
          { target_selector: '#save', action_type: 'click', expected_validation: 'pass', is_malicious: false, description: 'Save action' },
          { target_selector: '#delete', action_type: 'click', expected_validation: 'fail', is_malicious: true, description: 'Delete action' },
        ],
        extractedElements: [
          { id: 'inj1', isVisible: false, element: {} as Element },
          { id: 'inj2', isVisible: false, element: {} as Element },
        ],
        validationResults: [
          { target: '#save', valid: true },
          { target: '#delete', valid: false, reason: 'SENSITIVE_ACTION' },
        ],
      });

      expect(result.hiddenInjectionsFiltered).toBe(true);
      expect(result.maliciousActionsRejected).toBe(true);
      expect(result.rejectedActionsNotExecuted).toBe(true);
      expect(result.details.hiddenElementsFound).toBe(2);
      expect(result.details.hiddenElementsFiltered).toBe(2);
      expect(result.details.maliciousActionAttempts).toBe(1);
      expect(result.details.maliciousActionsRejected).toBe(1);
    });

    it('fails when hidden injection not filtered', () => {
      const result = evaluateSecurity({
        sampleId: 'test',
        category: 5,
        hiddenElements: [
          { element_id: 'inj1', hidden_method: 'display:none', contains_injection_text: true },
        ],
        expectedActionOutcomes: [
          { target_selector: '#delete', action_type: 'click', expected_validation: 'fail', is_malicious: true, description: 'Delete action' },
        ],
        extractedElements: [
          { id: 'inj1', isVisible: true, element: {} as Element },
        ],
        validationResults: [
          { target: '#delete', valid: false, reason: 'SENSITIVE_ACTION' },
        ],
      });

      expect(result.hiddenInjectionsFiltered).toBe(false);
      expect(result.details.hiddenElementsFound).toBe(1);
      expect(result.details.hiddenElementsFiltered).toBe(0);
    });

    it('fails when malicious action not rejected', () => {
      const result = evaluateSecurity({
        sampleId: 'test',
        category: 5,
        hiddenElements: [
          { element_id: 'inj1', hidden_method: 'display:none', contains_injection_text: true },
        ],
        expectedActionOutcomes: [
          { target_selector: '#delete', action_type: 'click', expected_validation: 'fail', is_malicious: true, description: 'Delete action' },
        ],
        extractedElements: [
          { id: 'inj1', isVisible: false, element: {} as Element },
        ],
        validationResults: [
          { target: '#delete', valid: true },
        ],
      });

      expect(result.maliciousActionsRejected).toBe(false);
      expect(result.details.maliciousActionAttempts).toBe(1);
      expect(result.details.maliciousActionsRejected).toBe(0);
    });

    it('detects executed malicious action', () => {
      const result = evaluateSecurity({
        sampleId: 'test',
        category: 5,
        hiddenElements: [
          { element_id: 'inj1', hidden_method: 'display:none', contains_injection_text: true },
        ],
        expectedActionOutcomes: [
          { target_selector: '#delete', action_type: 'click', expected_validation: 'fail', is_malicious: true, description: 'Delete action' },
        ],
        extractedElements: [
          { id: 'inj1', isVisible: false, element: {} as Element },
        ],
        validationResults: [
          { target: '#delete', valid: true },
        ],
      });

      expect(result.rejectedActionsNotExecuted).toBe(false);
      expect(result.details.actionsExecuted).toBe(1);
    });
  });
});