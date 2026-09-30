import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runDetectionPipeline, groupDetectionsByElement } from '../../extension/src/shared/detection-pipeline';
import { extractDOMElements, ExtractedElement } from '../../extension/src/shared/dom-extraction';

function setupDOM(html: string) {
  document.body.innerHTML = html;
}

describe('Detection Pipeline', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('should combine Layer 1 and Layer 2 detections', () => {
    setupDOM(`
      <input type="password" id="pwd" />
      <div id="text">Email: test@example.com</div>
    `);
    
    const elements = extractDOMElements();
    const result = runDetectionPipeline(elements);
    
    expect(result.layer1Result.detections.length).toBeGreaterThan(0);
    expect(result.layer2Result.detections.length).toBeGreaterThan(0);
    expect(result.detections.length).toBe(
      result.layer1Result.detections.length + result.layer2Result.detections.length
    );
  });

  it('should correctly group detections by element', () => {
    setupDOM(`
      <input type="email" id="email-input" value="test@example.com" />
      <div id="text-div">Contact: user@domain.org</div>
    `);
    
    const elements = extractDOMElements();
    const result = runDetectionPipeline(elements);
    const grouped = groupDetectionsByElement(elements, result.detections);
    
    expect(grouped.size).toBe(2);
    
    const emailInput = elements.find(e => e.element.id === 'email-input');
    const textDiv = elements.find(e => e.element.id === 'text-div');
    
    expect(grouped.get(emailInput?.element!)).toBeDefined();
    expect(grouped.get(textDiv?.element!)).toBeDefined();
    
    const inputDetections = grouped.get(emailInput!.element!);
    expect(inputDetections!.some(d => d.source === 'layer1_typed_field')).toBe(true);
    expect(inputDetections!.some(d => d.source === 'layer2_regex')).toBe(true);
    
    const divDetections = grouped.get(textDiv!.element!);
    expect(divDetections!.some(d => d.source === 'layer2_regex')).toBe(true);
    expect(divDetections!.some(d => d.source === 'layer1_typed_field')).toBe(false);
  });

  it('should prioritize Layer 1 for typed fields even when Layer 2 also matches', () => {
    setupDOM('<input type="password" id="pwd" value="secret123" />');
    
    const elements = extractDOMElements();
    const result = runDetectionPipeline(elements);
    
    const pwdDetections = result.detections.filter(d => d.type === 'password');
    const layer1Pwd = pwdDetections.find(d => d.source === 'layer1_typed_field');
    const layer2Pwd = pwdDetections.find(d => d.source === 'layer2_regex');
    
    expect(layer1Pwd).toBeDefined();
    expect(layer1Pwd?.confidence).toBe(0.95);
    expect(layer2Pwd).toBeUndefined();
  });

  it('should handle elements with no detections', () => {
    setupDOM('<div id="clean">Just regular text</div>');
    
    const elements = extractDOMElements();
    const result = runDetectionPipeline(elements);
    
    expect(result.detections.length).toBe(0);
    expect(result.layer1Result.detections.length).toBe(0);
    expect(result.layer2Result.detections.length).toBe(0);
  });

  it('should handle multiple detections on same element from different layers', () => {
    setupDOM(`
      <input type="email" id="email" value="not-an-email" />
      <div id="text">Real email: real@domain.com</div>
    `);
    
    const elements = extractDOMElements();
    const result = runDetectionPipeline(elements);
    
    const emailInput = elements.find(e => e.element.id === 'email');
    const textDiv = elements.find(e => e.element.id === 'text');
    
    const grouped = groupDetectionsByElement(elements, result.detections);
    
    const inputDetections = grouped.get(emailInput!.element!);
    expect(inputDetections!.some(d => d.type === 'email' && d.source === 'layer1_typed_field')).toBe(true);
    expect(inputDetections!.some(d => d.type === 'email' && d.source === 'layer2_regex')).toBe(false);
    
    const divDetections = grouped.get(textDiv!.element!);
    expect(divDetections!.some(d => d.type === 'email' && d.source === 'layer2_regex')).toBe(true);
  });

  it('should correctly identify critical severity detections', () => {
    setupDOM(`
      <input type="password" id="pwd" />
      <input autocomplete="cc-number" id="cc" />
      <div id="ssn-text">SSN: 123-45-6789</div>
    `);
    
    const elements = extractDOMElements();
    const result = runDetectionPipeline(elements);
    
    const criticalDetections = result.detections.filter(d => d.severity === 'critical');
    expect(criticalDetections.length).toBe(3);
    expect(criticalDetections.map(d => d.type)).toContain('password');
    expect(criticalDetections.map(d => d.type)).toContain('credit_card');
    expect(criticalDetections.map(d => d.type)).toContain('ssn');
  });

  it('should include all required fields in detection output', () => {
    setupDOM('<input type="password" id="pwd" value="secret" />');
    
    const elements = extractDOMElements();
    const result = runDetectionPipeline(elements);
    
    const detection = result.detections[0];
    expect(detection.type).toBeDefined();
    expect(detection.source).toBeDefined();
    expect(detection.confidence).toBeDefined();
    expect(detection.location).toBeDefined();
    expect(detection.location.selector).toBeDefined();
    expect(detection.location.boundingBox).toBeDefined();
    expect(detection.reason).toBeDefined();
    expect(detection.severity).toBeDefined();
  });
});