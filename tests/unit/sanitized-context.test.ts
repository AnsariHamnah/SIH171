import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildSanitizedContext, buildStructuredSanitizedContext, validateSanitizedContext } from '../../extension/src/shared/sanitized-context';
import { extractDOMElements, toDOMElementMetadata } from '../../extension/src/shared/dom-extraction';
import { runDetectionPipeline, groupDetectionsByElement } from '../../extension/src/shared/detection-pipeline';
import type { DOMElementMetadata, SanitizedContext, StructuredSanitizedContext, PIIDetection } from '../../extension/src/shared/types';

function setupDOM(html: string) {
  document.body.innerHTML = html;
}

function createDetection(type: PIIDetection['type'], overrides: Partial<PIIDetection> = {}): PIIDetection {
  return {
    type,
    source: 'layer1_typed_field',
    confidence: 0.95,
    location: { selector: '#test' },
    originalValue: overrides.originalValue,
    reason: 'test',
    severity: 'high',
    ...overrides,
  };
}

describe('Sanitized Context Builder', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('buildSanitizedContext', () => {
    it('creates sanitized context from DOM elements', () => {
      setupDOM('<div id="test">Hello world</div>');
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/page');

      expect(context.metadata.url).toBe('https://example.test');
      expect(context.metadata.timestamp).toBeDefined();
      expect(context.metadata.domElements).toHaveLength(1);
      expect(context.redactions).toHaveLength(0);
    });

    it('replaces sensitive text content with placeholders', () => {
      setupDOM('<input type="email" id="email" value="alice@example.test" />');
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/page');

      const emailElement = context.metadata.domElements.find(el => el.attributes.id === 'email');
      expect(emailElement).toBeDefined();
      expect(emailElement?.textContent).toBe('[EMAIL]');
      expect(emailElement?.textContent).not.toBe('alice@example.test');
    });

    it('replaces password field with placeholder', () => {
      setupDOM('<input type="password" id="pwd" value="secret123" />');
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/page');

      const pwdElement = context.metadata.domElements.find(el => el.attributes.id === 'pwd');
      expect(pwdElement?.textContent).toBe('[PASSWORD]');
    });

    it('includes redaction actions for sensitive elements', () => {
      setupDOM('<input type="email" id="email" value="alice@example.test" />');
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/page');

      // Both Layer 1 (typed field) and Layer 2 (regex) detect the email
      expect(context.redactions.length).toBeGreaterThanOrEqual(1);
      expect(context.redactions.some(r => r.replacement === '[EMAIL]')).toBe(true);
    });

    it('handles multiple sensitive elements', () => {
      setupDOM(`
        <input type="email" id="email" value="alice@example.test" />
        <input type="password" id="pwd" value="secret123" />
        <input type="tel" id="phone" value="555-123-4567" />
      `);
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/page');

      expect(context.redactions.length).toBeGreaterThanOrEqual(3);
      const replacements = context.redactions.map(r => r.replacement);
      expect(replacements).toContain('[EMAIL]');
      expect(replacements).toContain('[PASSWORD]');
      expect(replacements).toContain('[PHONE]');
    });

    it('preserves non-sensitive elements', () => {
      setupDOM('<div id="clean">Hello world</div>');
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/page');

      expect(context.metadata.domElements).toHaveLength(1);
      expect(context.metadata.domElements[0].textContent).toBe('Hello world');
    });

    it('uses url_origin not full URL', () => {
      setupDOM('<div id="test">Hello</div>');
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/path?query=secret');

      expect(context.metadata.url).toBe('https://example.test');
    });

    it('filters out hidden elements', () => {
      setupDOM(`
        <div id="visible">Visible</div>
        <div id="hidden" style="display: none;">Hidden</div>
      `);
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/page');

      expect(context.metadata.domElements).toHaveLength(1);
      expect(context.metadata.domElements[0].attributes.id).toBe('visible');
    });
  });

  describe('buildStructuredSanitizedContext', () => {
    it('creates structured context with page and elements', () => {
      setupDOM('<input type="email" id="email" value="alice@example.test" />');
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildStructuredSanitizedContext(domElements, 'https://example.test/page', 'Test Page');

      expect(context.page.url_origin).toBe('https://example.test');
      expect(context.page.title).toBe('Test Page');
      expect(context.page.viewport.width).toBeGreaterThan(0);
      expect(context.page.viewport.height).toBeGreaterThan(0);
      expect(context.elements).toHaveLength(1);
    });

    it('marks sensitive elements correctly', () => {
      setupDOM('<input type="password" id="pwd" value="secret" />');
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildStructuredSanitizedContext(domElements, 'https://example.test/page');

      const pwdElement = context.elements.find(e => e.id.includes('pwd') || e.label === '[PASSWORD]');
      expect(pwdElement).toBeDefined();
      expect(pwdElement?.sensitive).toBe(true);
      expect(pwdElement?.label).toBe('[PASSWORD]');
    });

    it('preserves non-sensitive elements with their labels', () => {
      setupDOM('<button id="submit">Submit</button>');
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildStructuredSanitizedContext(domElements, 'https://example.test/page');

      expect(context.elements[0].sensitive).toBe(false);
      expect(context.elements[0].label).toBe('Submit');
      expect(context.elements[0].role).toBe('button');
    });
  });

  describe('validateSanitizedContext', () => {
    it('returns true for properly sanitized context', () => {
      setupDOM('<input type="email" id="email" value="alice@example.test" />');
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/page');
      const valid = validateSanitizedContext(context);

      expect(valid).toBe(true);
    });

    it('detects raw email in sanitized output', () => {
      const context: SanitizedContext = {
        metadata: {
          url: 'https://example.test',
          timestamp: Date.now(),
          domElements: [{
            tagName: 'INPUT',
            attributes: { id: 'email', type: 'email' },
            boundingBox: { x: 0, y: 0, width: 100, height: 30 },
            textContent: 'alice@example.test',
            isInteractive: true,
            isVisible: true,
            piiDetections: [],
            formId: null,
          }],
        },
        redactions: [],
      };

      const valid = validateSanitizedContext(context);
      expect(valid).toBe(false);
    });

    it('detects raw password in sanitized output', () => {
      const context: SanitizedContext = {
        metadata: {
          url: 'https://example.test',
          timestamp: Date.now(),
          domElements: [{
            tagName: 'INPUT',
            attributes: { id: 'pwd', type: 'password' },
            boundingBox: { x: 0, y: 0, width: 100, height: 30 },
            textContent: 'secret123',
            isInteractive: true,
            isVisible: true,
            piiDetections: [createDetection('password', { originalValue: 'secret123' })],
            formId: null,
          }],
        },
        redactions: [],
      };

      const valid = validateSanitizedContext(context);
      expect(valid).toBe(false);
    });

    it('detects raw phone in sanitized output', () => {
      const context: SanitizedContext = {
        metadata: {
          url: 'https://example.test',
          timestamp: Date.now(),
          domElements: [{
            tagName: 'DIV',
            attributes: {},
            boundingBox: { x: 0, y: 0, width: 100, height: 30 },
            textContent: 'Call 555-123-4567 now',
            isInteractive: false,
            isVisible: true,
            piiDetections: [createDetection('phone', { originalValue: '555-123-4567' })],
            formId: null,
          }],
        },
        redactions: [],
      };

      const valid = validateSanitizedContext(context);
      expect(valid).toBe(false);
    });

    it('passes when sensitive values are properly replaced', () => {
      const context: SanitizedContext = {
        metadata: {
          url: 'https://example.test',
          timestamp: Date.now(),
          domElements: [{
            tagName: 'INPUT',
            attributes: { id: 'email', type: 'email' },
            boundingBox: { x: 0, y: 0, width: 100, height: 30 },
            textContent: '[EMAIL]',
            isInteractive: true,
            isVisible: true,
            piiDetections: [createDetection('email', { originalValue: 'alice@example.test' })],
            formId: null,
          }],
        },
        redactions: [],
      };

      const valid = validateSanitizedContext(context);
      expect(valid).toBe(true);
    });
  });

  describe('Privacy Invariants', () => {
    it('raw email values do not appear in sanitized output', () => {
      setupDOM('<input type="email" id="email" value="alice@example.test" />');
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/page');
      const emailElement = context.metadata.domElements.find(el => el.attributes.id === 'email');
      
      expect(emailElement?.textContent).not.toContain('alice@example.test');
      expect(emailElement?.textContent).toBe('[EMAIL]');
    });

    it('raw passwords do not appear in sanitized output', () => {
      setupDOM('<input type="password" id="pwd" value="secret123" />');
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/page');
      const pwdElement = context.metadata.domElements.find(el => el.attributes.id === 'pwd');
      
      expect(pwdElement?.textContent).not.toContain('secret123');
      expect(pwdElement?.textContent).toBe('[PASSWORD]');
    });

    it('raw phone numbers do not appear in sanitized output', () => {
      setupDOM('<input type="tel" id="phone" value="555-123-4567" />');
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/page');
      const phoneElement = context.metadata.domElements.find(el => el.attributes.id === 'phone');
      
      expect(phoneElement?.textContent).not.toContain('555-123-4567');
      expect(phoneElement?.textContent).toBe('[PHONE]');
    });

    it('raw credit card values do not appear in sanitized output', () => {
      setupDOM('<input type="text" autocomplete="cc-number" id="cc" value="4532015112830366" />');
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/page');
      const ccElement = context.metadata.domElements.find(el => el.attributes.id === 'cc');
      
      expect(ccElement?.textContent).not.toContain('4532015112830366');
      expect(ccElement?.textContent).toBe('[CREDIT_CARD]');
    });

    it('Layer 1 sensitive fields are removed', () => {
      setupDOM('<input type="password" id="pwd" value="secret" />');
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/page');
      
      expect(context.redactions.some(r => r.replacement === '[PASSWORD]')).toBe(true);
    });

    it('Layer 2 text detections are removed', () => {
      setupDOM('<div id="text">Contact alice@example.test</div>');
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/page');
      const textElement = context.metadata.domElements.find(el => el.attributes.id === 'text');
      
      expect(textElement?.textContent).not.toContain('alice@example.test');
    });

    it('non-sensitive text remains intact', () => {
      setupDOM('<div id="clean">Hello world, this is a test</div>');
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/page');
      const cleanElement = context.metadata.domElements.find(el => el.attributes.id === 'clean');
      
      expect(cleanElement?.textContent).toBe('Hello world, this is a test');
    });

    it('element metadata required by protocol remains available', () => {
      setupDOM('<button id="submit" aria-label="Submit form">Submit</button>');
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/page');
      const buttonElement = context.metadata.domElements.find(el => el.attributes.id === 'submit');
      
      expect(buttonElement).toBeDefined();
      expect(buttonElement?.tagName).toBe('BUTTON');
      expect(buttonElement?.attributes.id).toBe('submit');
      expect(buttonElement?.attributes['aria-label']).toBe('Submit form');
      expect(buttonElement?.boundingBox).toBeDefined();
      expect(buttonElement?.isInteractive).toBe(true);
    });

    it('sanitized output contains only permitted fields', () => {
      setupDOM('<input type="email" id="email" value="alice@example.test" />');
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/page');
      
      expect(context.metadata.url).toBeDefined();
      expect(context.metadata.timestamp).toBeDefined();
      expect(context.metadata.domElements).toBeDefined();
      expect(context.redactions).toBeDefined();
      expect(context.metadata.visualRegions).toBeUndefined();
    });

    it('no network call occurs during sanitization', () => {
      setupDOM('<input type="email" id="email" value="alice@example.test" />');
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const originalFetch = global.fetch;
      global.fetch = vi.fn();
      
      buildSanitizedContext(domElements, 'https://example.test/page');
      
      expect(global.fetch).not.toHaveBeenCalled();
      global.fetch = originalFetch;
    });
  });

  describe('Visual Privacy Invariants (Phase 11)', () => {
    it('visualRegions populated when visual PII detected', () => {
      setupDOM(`
        <svg id="face-avatar" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="45" fill="#ffdbac"/>
          <circle cx="35" cy="40" r="5" fill="#333"/>
          <circle cx="65" cy="40" r="5" fill="#333"/>
        </svg>
      `);
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/page');
      
      expect(context.metadata.visualRegions).toBeDefined();
      expect(Array.isArray(context.metadata.visualRegions)).toBe(true);
      expect(context.metadata.visualRegions!.length).toBeGreaterThan(0);
      expect(context.metadata.visualRegions![0].piiDetections.length).toBeGreaterThan(0);
      expect(context.metadata.visualRegions![0].piiDetections[0].type).toBe('face');
      expect(context.metadata.visualRegions![0].piiDetections[0].source).toBe('layer3_visual');
    });

    it('visualRegions undefined for DOM-only page', () => {
      setupDOM('<input type="email" id="email" value="alice@example.test" />');
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/page');
      
      expect(context.metadata.visualRegions).toBeUndefined();
    });

    it('visual region redaction actions included in redactions', () => {
      setupDOM(`
        <svg id="face-avatar" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="45" fill="#ffdbac"/>
          <circle cx="35" cy="40" r="5" fill="#333"/>
          <circle cx="65" cy="40" r="5" fill="#333"/>
        </svg>
      `);
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/page');
      
      const visualRedactions = context.redactions.filter(r => r.type === 'mask' || r.type === 'blur');
      expect(visualRedactions.length).toBeGreaterThan(0);
      expect(visualRedactions[0].target.type).toBe('face');
      expect(visualRedactions[0].replacement).toBe('[FACE]');
    });

    it('face placeholder used for visual redaction', () => {
      setupDOM(`
        <svg id="face-avatar" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="45" fill="#ffdbac"/>
          <circle cx="35" cy="40" r="5" fill="#333"/>
          <circle cx="65" cy="40" r="5" fill="#333"/>
        </svg>
      `);
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/page');
      
      const faceRedaction = context.redactions.find(r => r.target.type === 'face');
      expect(faceRedaction).toBeDefined();
      expect(faceRedaction?.replacement).toBe('[FACE]');
    });

    it('no raw face pixels in sanitized output', () => {
      setupDOM(`
        <svg id="face-avatar" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="45" fill="#ffdbac"/>
          <circle cx="35" cy="40" r="5" fill="#333"/>
          <circle cx="65" cy="40" r="5" fill="#333"/>
        </svg>
      `);
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/page');
      
      // Verify no raw face data in visual regions
      for (const region of context.metadata.visualRegions || []) {
        expect(region.description).not.toContain('circle cx="35"');
        expect(region.description).not.toContain('circle cx="65"');
        // The visual region description should not contain raw SVG face structure
      }
    });

    it('DOM + visual PII both handled in combined context', () => {
      setupDOM(`
        <input type="email" id="email" value="alice@example.test" />
        <svg id="face-avatar" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="45" fill="#ffdbac"/>
          <circle cx="35" cy="40" r="5" fill="#333"/>
          <circle cx="65" cy="40" r="5" fill="#333"/>
        </svg>
      `);
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/page');
      
      // DOM redaction
      const emailRedaction = context.redactions.find(r => r.target.type === 'email');
      expect(emailRedaction).toBeDefined();
      expect(emailRedaction?.replacement).toBe('[EMAIL]');
      
      // Visual redaction
      const faceRedaction = context.redactions.find(r => r.target.type === 'face');
      expect(faceRedaction).toBeDefined();
      expect(faceRedaction?.replacement).toBe('[FACE]');
      
      // Both visual regions and dom elements present
      expect(context.metadata.visualRegions).toBeDefined();
      expect(context.metadata.domElements.length).toBeGreaterThan(0);
    });

    it('visual region requiresVisionModel flag set correctly', () => {
      setupDOM(`
        <svg id="face-avatar" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="45" fill="#ffdbac"/>
          <circle cx="35" cy="40" r="5" fill="#333"/>
          <circle cx="65" cy="40" r="5" fill="#333"/>
        </svg>
        <img id="regular-img" src="photo.png" alt="regular photo" />
      `);
      
      const elements = extractDOMElements();
      const result = runDetectionPipeline(elements);
      const detectionsMap = groupDetectionsByElement(elements, result.detections);
      
      const domElements: DOMElementMetadata[] = elements.map(el => {
        const elementDetections = detectionsMap.get(el.element) || [];
        return toDOMElementMetadata(el, elementDetections);
      });

      const context = buildSanitizedContext(domElements, 'https://example.test/page');
      
      const faceRegion = context.metadata.visualRegions!.find(r => 
        r.piiDetections.some(d => d.type === 'face')
      );
      expect(faceRegion).toBeDefined();
      expect(faceRegion?.requiresVisionModel).toBe(true);
      
      // Regular image without detections should not be in visualRegions with detections
      const regularRegion = context.metadata.visualRegions!.find(r => 
        r.piiDetections.length === 0
      );
      // Note: regular images without detections are not included in visualRegions
    });
  });
});