import { describe, it, expect, beforeEach, vi } from 'vitest';
import { detectLayer1 } from '../../extension/src/shared/layer1-detector';
import { extractDOMElements, ExtractedElement } from '../../extension/src/shared/dom-extraction';

function setupDOM(html: string) {
  document.body.innerHTML = html;
}

describe('Layer 1 - Typed Field PII Detection', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('should detect password fields by input type', () => {
    setupDOM('<input type="password" id="pwd" />');
    
    const elements = extractDOMElements();
    const result = detectLayer1(elements);
    
    const pwdDetection = result.detections.find(d => d.type === 'password');
    expect(pwdDetection).toBeDefined();
    expect(pwdDetection?.source).toBe('layer1_typed_field');
    expect(pwdDetection?.confidence).toBe(0.95);
    expect(pwdDetection?.severity).toBe('critical');
    expect(pwdDetection?.reason).toContain('password');
  });

  it('should detect password fields by autocomplete', () => {
    setupDOM(`
      <input type="text" autocomplete="current-password" id="pwd1" />
      <input type="text" autocomplete="new-password" id="pwd2" />
      <input type="text" autocomplete="one-time-code" id="pwd3" />
    `);
    
    const elements = extractDOMElements();
    const result = detectLayer1(elements);
    
    const pwdDetections = result.detections.filter(d => d.type === 'password');
    expect(pwdDetections.length).toBe(3);
  });

  it('should detect email fields by input type', () => {
    setupDOM('<input type="email" id="email" />');
    
    const elements = extractDOMElements();
    const result = detectLayer1(elements);
    
    const emailDetection = result.detections.find(d => d.type === 'email');
    expect(emailDetection).toBeDefined();
    expect(emailDetection?.source).toBe('layer1_typed_field');
    expect(emailDetection?.confidence).toBe(0.95);
    expect(emailDetection?.severity).toBe('high');
    expect(emailDetection?.reason).toContain('email');
  });

  it('should detect email fields by autocomplete', () => {
    setupDOM(`
      <input type="text" autocomplete="email" id="email1" />
      <input type="text" autocomplete="username" id="email2" />
    `);
    
    const elements = extractDOMElements();
    const result = detectLayer1(elements);
    
    const emailDetections = result.detections.filter(d => d.type === 'email');
    expect(emailDetections.length).toBe(2);
  });

  it('should detect phone fields by input type', () => {
    setupDOM('<input type="tel" id="phone" />');
    
    const elements = extractDOMElements();
    const result = detectLayer1(elements);
    
    const phoneDetection = result.detections.find(d => d.type === 'phone');
    expect(phoneDetection).toBeDefined();
    expect(phoneDetection?.source).toBe('layer1_typed_field');
    expect(phoneDetection?.confidence).toBe(0.95);
    expect(phoneDetection?.severity).toBe('high');
  });

  it('should detect phone fields by autocomplete', () => {
    setupDOM(`
      <input type="text" autocomplete="tel" id="phone1" />
      <input type="text" autocomplete="tel-national" id="phone2" />
      <input type="text" autocomplete="tel-local" id="phone3" />
    `);
    
    const elements = extractDOMElements();
    const result = detectLayer1(elements);
    
    const phoneDetections = result.detections.filter(d => d.type === 'phone');
    expect(phoneDetections.length).toBe(3);
  });

  it('should detect credit card fields by autocomplete', () => {
    setupDOM(`
      <input type="text" autocomplete="cc-number" id="cc1" />
      <input type="text" autocomplete="cc-exp" id="cc2" />
      <input type="text" autocomplete="cc-csc" id="cc3" />
    `);
    
    const elements = extractDOMElements();
    const result = detectLayer1(elements);
    
    const ccDetections = result.detections.filter(d => d.type === 'credit_card');
    expect(ccDetections.length).toBe(3);
    expect(ccDetections[0]?.severity).toBe('critical');
  });

  it('should detect SSN fields by autocomplete', () => {
    setupDOM('<input type="text" autocomplete="ssn" id="ssn" />');
    
    const elements = extractDOMElements();
    const result = detectLayer1(elements);
    
    const ssnDetection = result.detections.find(d => d.type === 'ssn');
    expect(ssnDetection).toBeDefined();
    expect(ssnDetection?.severity).toBe('critical');
  });

  it('should detect address fields by autocomplete', () => {
    setupDOM(`
      <input type="text" autocomplete="street-address" id="addr1" />
      <input type="text" autocomplete="postal-code" id="addr2" />
    `);
    
    const elements = extractDOMElements();
    const result = detectLayer1(elements);
    
    const addrDetections = result.detections.filter(d => d.type === 'address');
    expect(addrDetections.length).toBe(2);
    expect(addrDetections[0]?.severity).toBe('medium');
  });

  it('should detect name fields by autocomplete', () => {
    setupDOM(`
      <input type="text" autocomplete="name" id="name1" />
      <input type="text" autocomplete="given-name" id="name2" />
      <input type="text" autocomplete="family-name" id="name3" />
    `);
    
    const elements = extractDOMElements();
    const result = detectLayer1(elements);
    
    const nameDetections = result.detections.filter(d => d.type === 'name');
    expect(nameDetections.length).toBe(3);
  });

  it('should detect password via role attribute', () => {
    setupDOM('<div role="password" id="role-pwd">Password</div>');
    
    const elements = extractDOMElements();
    const result = detectLayer1(elements);
    
    const pwdDetection = result.detections.find(d => d.type === 'password');
    expect(pwdDetection).toBeDefined();
    expect(pwdDetection?.reason).toContain('role');
  });

  it('should detect sensitive fields via ARIA label', () => {
    setupDOM(`
      <input type="text" aria-label="Password" id="aria-pwd" />
      <input type="text" aria-label="Credit Card Number" id="aria-cc" />
      <input type="text" aria-label="Email Address" id="aria-email" />
      <input type="text" aria-label="Phone Number" id="aria-phone" />
      <input type="text" aria-label="SSN" id="aria-ssn" />
    `);
    
    const elements = extractDOMElements();
    const result = detectLayer1(elements);
    
    const types = result.detections.map(d => d.type);
    expect(types).toContain('password');
    expect(types).toContain('credit_card');
    expect(types).toContain('email');
    expect(types).toContain('phone');
    expect(types).toContain('ssn');
  });

  it('should detect sensitive fields via associated label', () => {
    setupDOM(`
      <label for="label-pwd">Password</label>
      <input type="text" id="label-pwd" />
      <label for="label-cc">Credit Card</label>
      <input type="text" id="label-cc" />
    `);
    
    const elements = extractDOMElements();
    const result = detectLayer1(elements);
    
    const types = result.detections.map(d => d.type);
    expect(types).toContain('password');
    expect(types).toContain('credit_card');
  });

  it('should not detect non-sensitive fields', () => {
    setupDOM(`
      <input type="text" id="regular" />
      <input type="search" id="search" />
      <input type="number" id="number" />
      <div>Just text</div>
    `);
    
    const elements = extractDOMElements();
    const result = detectLayer1(elements);
    
    expect(result.detections.length).toBe(0);
  });

  it('should skip hidden elements', () => {
    setupDOM(`
      <input type="password" id="visible-pwd" />
      <input type="password" id="hidden-pwd" style="display: none;" />
      <input type="email" id="hidden-email" style="visibility: hidden;" />
    `);
    
    const elements = extractDOMElements();
    const result = detectLayer1(elements);
    
    const pwdDetections = result.detections.filter(d => d.type === 'password');
    expect(pwdDetections.length).toBe(1);
    expect(pwdDetections[0]?.location.selector).toContain('visible-pwd');
  });

  it('should include location information', () => {
    setupDOM('<input type="password" id="loc-test" />');
    
    const elements = extractDOMElements();
    const result = detectLayer1(elements);
    
    const detection = result.detections[0];
    expect(detection.location.selector).toBeDefined();
    expect(detection.location.boundingBox).toBeDefined();
    expect(detection.location.boundingBox?.x).toBeDefined();
    expect(detection.location.boundingBox?.y).toBeDefined();
    expect(detection.location.boundingBox?.width).toBeDefined();
    expect(detection.location.boundingBox?.height).toBeDefined();
  });

  it('should include original value in detection', () => {
    setupDOM('<input type="email" id="email-val" value="test@example.com" />');
    
    const elements = extractDOMElements();
    const result = detectLayer1(elements);
    
    const detection = result.detections.find(d => d.type === 'email');
    expect(detection?.originalValue).toBe('test@example.com');
  });

  it('should handle overlapping signals (password + email on same element)', () => {
    setupDOM('<input type="password" autocomplete="email" id="overlap" />');
    
    const elements = extractDOMElements();
    const result = detectLayer1(elements);
    
    const pwdDetection = result.detections.find(d => d.type === 'password');
    expect(pwdDetection).toBeDefined();
    expect(result.detections.filter(d => d.type === 'email').length).toBe(0);
  });
});