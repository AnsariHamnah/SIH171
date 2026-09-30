import { describe, it, expect, beforeAll } from 'vitest';
import {
  getDataset,
  getSamplesByCategory,
  getSampleById,
  getAllSampleIds,
  getCategorySampleIds,
  loadSampleHTML,
  validateDataset,
  type SyntheticSample,
  type DatasetIndex
} from '../dataset';

describe('Phase 8 - Synthetic Dataset', () => {
  let dataset: DatasetIndex;
  
  beforeAll(() => {
    dataset = getDataset();
  });

  describe('Dataset Structure', () => {
    it('should load dataset index successfully', () => {
      expect(dataset).toBeDefined();
      expect(dataset.version).toBe('1.0.0');
      expect(dataset.created).toBeDefined();
      expect(dataset.categories).toBeDefined();
      expect(dataset.samples).toBeDefined();
      expect(Array.isArray(dataset.samples)).toBe(true);
    });

    it('should have all 6 categories defined', () => {
      expect(Object.keys(dataset.categories)).toHaveLength(6);
      expect(dataset.categories[1]).toBeDefined();
      expect(dataset.categories[2]).toBeDefined();
      expect(dataset.categories[3]).toBeDefined();
      expect(dataset.categories[4]).toBeDefined();
      expect(dataset.categories[5]).toBeDefined();
      expect(dataset.categories[6]).toBeDefined();
    });

    it('should have correct category names', () => {
      expect(dataset.categories[1].name).toBe('Standard HTML Forms (DOM-sufficient)');
      expect(dataset.categories[2].name).toBe('Mislabeled / Custom-styled Fields');
      expect(dataset.categories[3].name).toBe('Canvas-rendered / Non-DOM Content');
      expect(dataset.categories[4].name).toBe('Visual PII (Faces, ID Cards)');
      expect(dataset.categories[5].name).toBe('Prompt Injection Test Pages');
      expect(dataset.categories[6].name).toBe('Mixed/Realistic Composite Pages');
    });
  });

  describe('Sample Loading', () => {
    it('should load all samples without errors', () => {
      expect(dataset.samples.length).toBeGreaterThan(0);
      
      for (const sample of dataset.samples) {
        expect(sample.metadata.id).toBeDefined();
        expect(sample.metadata.category).toBeGreaterThanOrEqual(1);
        expect(sample.metadata.category).toBeLessThanOrEqual(6);
        expect(sample.metadata.html_file).toBeDefined();
        expect(sample.metadata.url_origin).toBeDefined();
        expect(sample.metadata.title).toBeDefined();
      }
    });

    it('should have no duplicate sample IDs', () => {
      const ids = dataset.samples.map(s => s.metadata.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });

    it('should load HTML for each sample', () => {
      for (const sample of dataset.samples) {
        const html = loadSampleHTML(sample.metadata.category, sample.metadata.id.replace(`cat${sample.metadata.category}-`, ''));
        expect(html).toBeDefined();
        expect(html!.length).toBeGreaterThan(0);
        expect(html).toContain('<!DOCTYPE html>');
      }
    });

    it('should have valid ground truth for each sample', () => {
      for (const sample of dataset.samples) {
        expect(sample.ground_truth).toBeDefined();
        expect(Array.isArray(sample.ground_truth)).toBe(true);
        
        for (const gt of sample.ground_truth) {
          expect(gt.element_id).toBeDefined();
          expect(['email', 'phone', 'password', 'credit_card', 'ssn', 'address', 'name', 'face', 'government_id', 'none']).toContain(gt.type);
          expect([1, 2, 3, 4]).toContain(gt.expected_layer);
        }
      }
    });
  });

  describe('Category 1 - Standard HTML Forms', () => {
    const samples = getSamplesByCategory(1);
    
    it('should have at least 3 samples', () => {
      expect(samples.length).toBeGreaterThanOrEqual(3);
    });

    it('should include standard-login, registration-form, payment-form', () => {
      const ids = samples.map(s => s.metadata.id);
      expect(ids).toContain('cat1-standard-login');
      expect(ids).toContain('cat1-registration-form');
      expect(ids).toContain('cat1-payment-form');
    });

    it('should have correct PII types for standard forms', () => {
      for (const sample of samples) {
        for (const gt of sample.ground_truth) {
          // Category 1 should only have Layer 1 detections
          expect(gt.expected_layer).toBe(1);
        }
      }
    });
  });

  describe('Category 2 - Mislabeled / Custom-styled Fields', () => {
    const samples = getSamplesByCategory(2);
    
    it('should have at least 3 samples', () => {
      expect(samples.length).toBeGreaterThanOrEqual(3);
    });

    it('should include custom-password, generic-credit-card, div-as-input', () => {
      const ids = samples.map(s => s.metadata.id);
      expect(ids).toContain('cat2-custom-password');
      expect(ids).toContain('cat2-generic-credit-card');
      expect(ids).toContain('cat2-div-as-input');
    });

    it('should have expected layers > 1 for mislabeled fields', () => {
      for (const sample of samples) {
        const mislabeledGT = sample.ground_truth.filter(gt => gt.type !== 'none' && gt.expected_layer > 1);
        expect(mislabeledGT.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Category 3 - Canvas-rendered / Non-DOM Content', () => {
    const samples = getSamplesByCategory(3);
    
    it('should have at least 2 samples', () => {
      expect(samples.length).toBeGreaterThanOrEqual(2);
    });

    it('should include canvas-login and static-image-form', () => {
      const ids = samples.map(s => s.metadata.id);
      expect(ids).toContain('cat3-canvas-login');
      expect(ids).toContain('cat3-static-image-form');
    });

    it('should have canvas elements marked for Layer 3', () => {
      for (const sample of samples) {
        const canvasGT = sample.ground_truth.filter(gt => 
          gt.type === 'none' && gt.expected_layer === 3
        );
        expect(canvasGT.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Category 4 - Visual PII (Faces, ID Cards)', () => {
    const samples = getSamplesByCategory(4);
    
    it('should have at least 2 samples', () => {
      expect(samples.length).toBeGreaterThanOrEqual(2);
    });

    it('should include profile-with-face and id-card-upload', () => {
      const ids = samples.map(s => s.metadata.id);
      expect(ids).toContain('cat4-profile-with-face');
      expect(ids).toContain('cat4-id-card-upload');
    });

    it('should have face type detections expected at Layer 3', () => {
      for (const sample of samples) {
        const faceGT = sample.ground_truth.filter(gt => gt.type === 'face');
        expect(faceGT.length).toBeGreaterThan(0);
        
        for (const face of faceGT) {
          expect(face.expected_layer).toBe(3);
        }
      }
    });
  });

  describe('Category 5 - Prompt Injection Test Pages', () => {
    const samples = getSamplesByCategory(5);
    
    it('should have at least 2 samples', () => {
      expect(samples.length).toBeGreaterThanOrEqual(2);
    });

    it('should include account-deletion-injection and payment-injection', () => {
      const ids = samples.map(s => s.metadata.id);
      expect(ids).toContain('cat5-account-deletion-injection');
      expect(ids).toContain('cat5-payment-injection');
    });

    it('should have hidden injection elements documented', () => {
      for (const sample of samples) {
        const hiddenElements = sample.expected_hidden_elements;
        expect(hiddenElements.length).toBeGreaterThan(0);
        
        for (const hidden of hiddenElements) {
          expect(['display:none', 'visibility:hidden', 'opacity:0', 'off-screen', 'script', 'style']).toContain(hidden.hidden_method);
          expect(hidden.contains_injection_text).toBe(true);
          expect(hidden.injection_text_preview).toBeDefined();
        }
      }
    });

    it('should have malicious action outcomes documented', () => {
      for (const sample of samples) {
        const maliciousActions = sample.expected_action_outcomes.filter(a => a.is_malicious);
        expect(maliciousActions.length).toBeGreaterThan(0);
        
        for (const action of maliciousActions) {
          expect(action.expected_validation).toBe('fail');
          expect(action.expected_failure_reason).toBe('SENSITIVE_ACTION');
        }
      }
    });
  });

  describe('Category 6 - Mixed/Realistic Composite Pages', () => {
    const samples = getSamplesByCategory(6);
    
    it('should have at least 2 samples', () => {
      expect(samples.length).toBeGreaterThanOrEqual(2);
    });

    it('should include signup-composite and account-settings-composite', () => {
      const ids = samples.map(s => s.metadata.id);
      expect(ids).toContain('cat6-signup-composite');
      expect(ids).toContain('cat6-account-settings-composite');
    });

    it('should combine multiple PII types across categories', () => {
      for (const sample of samples) {
        const piiTypes = new Set(sample.ground_truth.map(gt => gt.type).filter(t => t !== 'none'));
        // Should have at least 4 different PII types (name, email, password, credit_card, face, etc.)
        expect(piiTypes.size).toBeGreaterThanOrEqual(4);
      }
    });

    it('should have hidden injection elements (Category 5)', () => {
      for (const sample of samples) {
        const hiddenElements = sample.expected_hidden_elements;
        expect(hiddenElements.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Ground Truth Completeness', () => {
    it('should have expected_detections for all non-none ground truth items', () => {
      for (const sample of dataset.samples) {
        const piiGT = sample.ground_truth.filter(gt => gt.type !== 'none');
        
        for (const gt of piiGT) {
          const detection = sample.expected_detections.find(d => d.element_id === gt.element_id && d.pii_type === gt.type);
          expect(detection).toBeDefined();
          expect(detection!.pii_type).toBe(gt.type);
          expect(detection!.detection_layer).toBe(gt.expected_layer);
        }
      }
    });

    it('should have expected_redactions for all detected PII', () => {
      for (const sample of dataset.samples) {
        for (const det of sample.expected_detections) {
          const redaction = sample.expected_redactions.find(r => r.element_id === det.element_id && r.pii_type === det.pii_type);
          expect(redaction).toBeDefined();
          expect(redaction!.pii_type).toBe(det.pii_type);
          expect(redaction!.expected_placeholder).toBeDefined();
          expect(redaction!.original_value).toBeDefined();
        }
      }
    });

    it('should have expected_action_outcomes covering legitimate and malicious actions', () => {
      for (const sample of dataset.samples) {
        const legitimateActions = sample.expected_action_outcomes.filter(a => !a.is_malicious);
        const maliciousActions = sample.expected_action_outcomes.filter(a => a.is_malicious);
        
        // Category 5 and 6 should have malicious actions
        if (sample.metadata.category >= 5) {
          expect(maliciousActions.length).toBeGreaterThan(0);
        }
        
        // All should have legitimate actions
        expect(legitimateActions.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Dataset Validation', () => {
    it('should pass validation', () => {
      const result = validateDataset();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Determinism', () => {
    it('should produce same dataset on multiple loads', () => {
      const dataset1 = getDataset();
      const dataset2 = getDataset();
      
      expect(dataset1.samples.length).toBe(dataset2.samples.length);
      expect(dataset1.version).toBe(dataset2.version);
      
      for (let i = 0; i < dataset1.samples.length; i++) {
        expect(dataset1.samples[i].metadata.id).toBe(dataset2.samples[i].metadata.id);
      }
    });

    it('should have deterministic sample ordering', () => {
      const ids1 = getAllSampleIds();
      const ids2 = getAllSampleIds();
      expect(ids1).toEqual(ids2);
    });
  });

  describe('Category Sample Counts', () => {
    it('should have reasonable sample counts per category', () => {
      for (let cat = 1; cat <= 6; cat++) {
        const samples = getSamplesByCategory(cat);
        expect(samples.length).toBeGreaterThanOrEqual(2);
        expect(samples.length).toBeLessThanOrEqual(10);
      }
    });

    it('total samples should be in expected range (12-60)', () => {
      const total = dataset.samples.length;
      expect(total).toBeGreaterThanOrEqual(12);
      expect(total).toBeLessThanOrEqual(60);
    });
  });
});