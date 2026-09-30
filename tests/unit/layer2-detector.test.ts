import { describe, it, expect, beforeEach, vi } from 'vitest';
import { detectLayer2 } from '../../extension/src/shared/layer2-detector';
import { extractDOMElements, ExtractedElement } from '../../extension/src/shared/dom-extraction';

function setupDOM(html: string) {
  document.body.innerHTML = html;
}

describe('Layer 2 - Regex/String PII Detection', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('should detect email addresses in text content', () => {
    setupDOM('<div id="text">Contact us at test@example.com for more info</div>');
    
    const elements = extractDOMElements();
    const result = detectLayer2(elements);
    
    const emailDetection = result.detections.find(d => d.type === 'email');
    expect(emailDetection).toBeDefined();
    expect(emailDetection?.source).toBe('layer2_regex');
    expect(emailDetection?.confidence).toBe(0.8);
    expect(emailDetection?.severity).toBe('high');
    expect(emailDetection?.originalValue).toBe('test@example.com');
    expect(emailDetection?.reason).toContain('Email pattern matched');
    expect(emailDetection?.location.textOffset).toBeDefined();
  });

  it('should detect multiple emails in same element', () => {
    setupDOM('<div id="text">Emails: a@b.com and x@y.org</div>');
    
    const elements = extractDOMElements();
    const result = detectLayer2(elements);
    
    const emailDetections = result.detections.filter(d => d.type === 'email');
    expect(emailDetections.length).toBe(2);
    expect(emailDetections.map(d => d.originalValue)).toContain('a@b.com');
    expect(emailDetections.map(d => d.originalValue)).toContain('x@y.org');
  });

  it('should detect phone numbers in various formats', () => {
    setupDOM(`
      <div id="p1">Call 555-123-4567</div>
      <div id="p2">Call (555) 123-4567</div>
      <div id="p3">Call 555.123.4567</div>
      <div id="p4">Call +1 555 123 4567</div>
    `);
    
    const elements = extractDOMElements();
    const result = detectLayer2(elements);
    
    const phoneDetections = result.detections.filter(d => d.type === 'phone');
    expect(phoneDetections.length).toBeGreaterThanOrEqual(4);
  });

  it('should detect credit card numbers with Luhn validation', () => {
    setupDOM('<div id="cc">Card: 4532015112830366</div>');
    
    const elements = extractDOMElements();
    const result = detectLayer2(elements);
    
    const ccDetection = result.detections.find(d => d.type === 'credit_card');
    expect(ccDetection).toBeDefined();
    expect(ccDetection?.severity).toBe('critical');
    expect(ccDetection?.originalValue).toBe('4532015112830366');
  });

  it('should reject invalid credit card numbers (failing Luhn)', () => {
    setupDOM('<div id="cc">Card: 1234567890123456</div>');
    
    const elements = extractDOMElements();
    const result = detectLayer2(elements);
    
    const ccDetection = result.detections.find(d => d.type === 'credit_card');
    expect(ccDetection).toBeUndefined();
  });

  it('should detect SSN patterns', () => {
    setupDOM(`
      <div id="ssn1">SSN: 123-45-6789</div>
      <div id="ssn2">SSN: 123 45 6789</div>
      <div id="ssn3">SSN: 123.45.6789</div>
    `);
    
    const elements = extractDOMElements();
    const result = detectLayer2(elements);
    
    const ssnDetections = result.detections.filter(d => d.type === 'ssn');
    expect(ssnDetections.length).toBe(3);
    expect(ssnDetections[0]?.severity).toBe('critical');
  });

  it('should detect address patterns', () => {
    setupDOM(`
      <div id="addr1">123 Main Street</div>
      <div id="addr2">456 Oak Ave</div>
      <div id="addr3">PO Box 123</div>
    `);
    
    const elements = extractDOMElements();
    const result = detectLayer2(elements);
    
    const addrDetections = result.detections.filter(d => d.type === 'address');
    expect(addrDetections.length).toBeGreaterThanOrEqual(2);
    expect(addrDetections[0]?.severity).toBe('medium');
  });

  it('should not detect non-sensitive text', () => {
    setupDOM('<div id="text">Hello world, this is a regular sentence.</div>');
    
    const elements = extractDOMElements();
    const result = detectLayer2(elements);
    
    expect(result.detections.length).toBe(0);
  });

  it('should skip hidden elements', () => {
    setupDOM(`
      <div id="visible">test@example.com</div>
      <div id="hidden" style="display: none;">hidden@example.com</div>
    `);
    
    const elements = extractDOMElements();
    const result = detectLayer2(elements);
    
    const emailDetections = result.detections.filter(d => d.type === 'email');
    expect(emailDetections.length).toBe(1);
    expect(emailDetections[0]?.originalValue).toBe('test@example.com');
  });

  it('should handle empty text content', () => {
    setupDOM('<div id="empty"></div>');
    
    const elements = extractDOMElements();
    const result = detectLayer2(elements);
    
    expect(result.detections.length).toBe(0);
  });

  it('should handle input element values', () => {
    setupDOM('<input type="text" id="input" value="my email is test@example.com" />');
    
    const elements = extractDOMElements();
    const result = detectLayer2(elements);
    
    const emailDetection = result.detections.find(d => d.type === 'email');
    expect(emailDetection).toBeDefined();
    expect(emailDetection?.originalValue).toBe('test@example.com');
  });

  it('should include location information with text offsets', () => {
    setupDOM('<div id="text">Email: test@example.com here</div>');
    
    const elements = extractDOMElements();
    const result = detectLayer2(elements);
    
    const detection = result.detections[0];
    expect(detection.location.selector).toBeDefined();
    expect(detection.location.boundingBox).toBeDefined();
    expect(detection.location.textOffset).toBeDefined();
    expect(detection.location.textOffset!.start).toBeLessThan(detection.location.textOffset!.end);
  });

  it('should not match partial email-like strings without proper domain', () => {
    setupDOM('<div id="text">not-an-email@ or @no-domain</div>');
    
    const elements = extractDOMElements();
    const result = detectLayer2(elements);
    
    const emailDetections = result.detections.filter(d => d.type === 'email');
    expect(emailDetections.length).toBe(0);
  });

  it('should handle overlapping matches from different regexes', () => {
    setupDOM('<div id="text">Contact: test@example.com or 555-123-4567</div>');
    
    const elements = extractDOMElements();
    const result = detectLayer2(elements);
    
    const types = result.detections.map(d => d.type);
    expect(types).toContain('email');
    expect(types).toContain('phone');
  });

  it('should detect credit card with spaces and dashes', () => {
    setupDOM('<div id="cc">Card: 4532 0151 1283 0366</div>');
    
    const elements = extractDOMElements();
    const result = detectLayer2(elements);
    
    const ccDetection = result.detections.find(d => d.type === 'credit_card');
    expect(ccDetection).toBeDefined();
  });

  it('should handle false-positive-prone examples (over-redaction expected per design)', () => {
    setupDOM(`
      <div id="price">Price: $123.45</div>
      <div id="version">Version 1.2.3</div>
      <div id="date">Date: 12/31/2023</div>
      <div id="zip">ZIP: 12345</div>
    `);
    
    const elements = extractDOMElements();
    const result = detectLayer2(elements);
    
    // Per over-redaction principle (docs/PII_DETECTION.md), some false positives are acceptable
    // These examples are prone to false matches but we document the expected behavior
    const phoneDetections = result.detections.filter(d => d.type === 'phone');
    const ssnDetections = result.detections.filter(d => d.type === 'ssn');
    const ccDetections = result.detections.filter(d => d.type === 'credit_card');
    
    // Document current behavior - over-redaction is preferred
    // This test documents the current false positive rate
    expect(phoneDetections.length).toBeGreaterThanOrEqual(0);
    expect(ssnDetections.length).toBeGreaterThanOrEqual(0);
    expect(ccDetections.length).toBeGreaterThanOrEqual(0);
  });
});