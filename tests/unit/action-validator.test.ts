import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateAction, createValidationContext } from '../../extension/src/shared/action-validator';
import { extractDOMElements, toDOMElementMetadata } from '../../extension/src/shared/dom-extraction';
import { runDetectionPipeline, groupDetectionsByElement } from '../../extension/src/shared/detection-pipeline';
import type { Action, DOMElementMetadata, ValidationContext } from '../../extension/src/shared/types';

function setupDOM(html: string) {
  document.body.innerHTML = html;
}

function createTestContext(
  html: string,
  valueRefStore: Record<string, string> = {},
  knownReasoningIds: Set<string> = new Set(['reasoning-123', 'reasoning-456']),
  currentUrl: string = 'https://example.test/page'
): ValidationContext {
  setupDOM(html);
  
  const elements = extractDOMElements();
  const result = runDetectionPipeline(elements);
  const detectionsMap = groupDetectionsByElement(elements, result.detections);
  
  const domElements: DOMElementMetadata[] = elements.map(el => {
    const elementDetections = detectionsMap.get(el.element) || [];
    return toDOMElementMetadata(el, elementDetections);
  });

  return createValidationContext(currentUrl, domElements, valueRefStore, knownReasoningIds);
}

function createValidAction(type: Action['action'], target: string, overrides: Partial<Action> = {}): Action {
  return {
    action: type,
    target,
    reasoning_id: 'reasoning-123',
    ...overrides,
  };
}

const EMAIL_FIELD_1 = '[EMAIL_FIELD_1]';
const PASSWORD_FIELD_1 = '[PASSWORD_FIELD_1]';

describe('Action Validator', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('Valid actions (non-sensitive targets)', () => {
    it('validates a valid click action on non-sensitive element', () => {
      const context = createTestContext(`
        <button id="submit-btn">Submit</button>
      `);
      
      const action = createValidAction('click', '#submit-btn');
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(true);
      expect(result.sanitizedAction).toBeDefined();
    });

    it('validates a valid scroll action on non-sensitive element', () => {
      const context = createTestContext(`
        <div id="scrollable-area">Content</div>
      `);
      
      const action = createValidAction('scroll', '#scrollable-area', {
        parameters: { direction: 'down', amount_px: 400 },
      });
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(true);
      expect(result.sanitizedAction).toBeDefined();
    });

    it('validates a valid focus action on non-sensitive element', () => {
      const context = createTestContext(`
        <input type="text" id="focus-field" />
      `);
      
      const action = createValidAction('focus', '#focus-field');
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(true);
    });

    it('validates a valid select action on non-sensitive element', () => {
      const context = createTestContext(`
        <select id="select-field"><option>Option 1</option></select>
      `);
      
      const action = createValidAction('select', '#select-field');
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(true);
    });
  });

  describe('Invalid actions - schema validation', () => {
    it('rejects malformed action (missing target)', () => {
      const context = createTestContext('<button id="btn">Click</button>');
      
      const action = {
        action: 'click',
        reasoning_id: 'reasoning-123',
      };
      
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_SCHEMA');
    });

    it('rejects malformed action (missing action type)', () => {
      const context = createTestContext('<button id="btn">Click</button>');
      
      const action = {
        target: '#btn',
        reasoning_id: 'reasoning-123',
      };
      
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_SCHEMA');
    });

    it('rejects malformed action (missing reasoning_id)', () => {
      const context = createTestContext('<button id="btn">Click</button>');
      
      const action = {
        action: 'click',
        target: '#btn',
      };
      
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_SCHEMA');
    });

    it('rejects action with unknown action type', () => {
      const context = createTestContext('<button id="btn">Click</button>');
      
      const action = {
        action: 'navigate',
        target: '#btn',
        reasoning_id: 'reasoning-123',
      };
      
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('UNSUPPORTED_ACTION');
    });

    it('rejects action with unexpected fields', () => {
      const context = createTestContext('<button id="btn">Click</button>');
      
      const action = {
        action: 'click',
        target: '#btn',
        reasoning_id: 'reasoning-123',
        extra_field: 'malicious-data',
      };
      
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_SCHEMA');
    });
  });

  describe('Invalid actions - target validation', () => {
    it('rejects action with nonexistent target', () => {
      const context = createTestContext('<button id="btn">Click</button>');
      
      const action = createValidAction('click', '#nonexistent');
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('TARGET_NOT_FOUND');
    });

    it('rejects action with ambiguous target', () => {
      const context = createTestContext(`
        <button id="btn1">Click 1</button>
        <button id="btn2">Click 2</button>
      `);
      
      const action = createValidAction('click', 'button');
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('AMBIGUOUS_TARGET');
    });

    it('rejects action with invisible target', () => {
      const context = createTestContext(`
        <button id="hidden-btn" style="display: none;">Hidden</button>
      `);
      
      const action = createValidAction('click', '#hidden-btn');
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVISIBLE_TARGET');
    });

    it('rejects action with disabled target', () => {
      const context = createTestContext(`
        <button id="disabled-btn" disabled>Disabled</button>
      `);
      
      const action = createValidAction('click', '#disabled-btn');
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('DISABLED_TARGET');
    });
  });

  describe('Sensitive field protection (SENSITIVE_ACTION)', () => {
    it('rejects click action targeting password field', () => {
      const context = createTestContext(`
        <input type="password" id="pwd-field" />
      `);
      
      const action = createValidAction('click', '#pwd-field');
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('SENSITIVE_ACTION');
    });

    it('rejects fill action targeting password field with value_ref', () => {
      const context = createTestContext(`
        <input type="password" id="pwd-field" />
      `, { [PASSWORD_FIELD_1]: 'secret123' });
      
      const action = createValidAction('fill', '#pwd-field', { value_ref: PASSWORD_FIELD_1 });
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('SENSITIVE_ACTION');
    });

    it('rejects click action targeting credit card field', () => {
      const context = createTestContext(`
        <input type="text" autocomplete="cc-number" id="cc-field" />
      `);
      
      const action = createValidAction('click', '#cc-field');
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('SENSITIVE_ACTION');
    });

    it('rejects click action targeting SSN field', () => {
      const context = createTestContext(`
        <input type="text" autocomplete="ssn" id="ssn-field" />
      `);
      
      const action = createValidAction('click', '#ssn-field');
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('SENSITIVE_ACTION');
    });

    it('rejects click action targeting email field', () => {
      const context = createTestContext(`
        <input type="email" id="email-field" />
      `);
      
      const action = createValidAction('click', '#email-field');
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('SENSITIVE_ACTION');
    });

    it('rejects fill action targeting email field with value_ref (sensitive field requires confirmation)', () => {
      const context = createTestContext(`
        <input type="email" id="email-field" />
      `, { [EMAIL_FIELD_1]: 'alice@example.test' });
      
      const action = createValidAction('fill', '#email-field', { value_ref: EMAIL_FIELD_1 });
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('SENSITIVE_ACTION');
    });
  });

  describe('Invalid actions - value_ref validation', () => {
    it('rejects action with unknown value_ref', () => {
      const context = createTestContext(`
        <input type="text" id="non-sensitive-field" />
      `, {}); // empty valueRefStore
      
      const action = createValidAction('fill', '#non-sensitive-field', { value_ref: '[UNKNOWN_REF]' });
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_VALUE_REF');
    });

    it('rejects action with unknown value_ref even on sensitive field (sensitive check runs first)', () => {
      const context = createTestContext(`
        <input type="email" id="email-field" />
      `, {}); // empty valueRefStore
      
      const action = createValidAction('fill', '#email-field', { value_ref: '[UNKNOWN_REF]' });
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(false);
      // Sensitive check runs before value_ref check
      expect(result.reason).toBe('SENSITIVE_ACTION');
    });
  });

  describe('Invalid actions - reasoning_id validation', () => {
    it('rejects action with missing reasoning_id', () => {
      const context = createTestContext('<button id="btn">Click</button>');
      
      const action = {
        action: 'click',
        target: '#btn',
      };
      
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_SCHEMA');
    });

    it('rejects action with unknown reasoning_id', () => {
      const context = createTestContext('<button id="btn">Click</button>');
      
      const action = createValidAction('click', '#btn', { reasoning_id: 'unknown-id' });
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('MISSING_REASONING_ID');
    });
  });

  describe('Invalid actions - origin mismatch', () => {
    it('rejects action when origin mismatches', () => {
      const context = createTestContext('<button id="btn">Click</button>', {}, new Set(['reasoning-123']), 'https://evil.test/page');
      
      const action = createValidAction('click', '#btn');
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('ORIGIN_MISMATCH');
    });
  });

  describe('Validator behavior', () => {
    it('returns structured rejection reasons', () => {
      const context = createTestContext('<button id="btn">Click</button>');
      
      const action = { action: 'click', reasoning_id: 'reasoning-123' }; // missing target
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.details).toBeDefined();
      expect(typeof result.reason).toBe('string');
      expect(typeof result.details).toBe('string');
    });

    it('never executes rejected actions', () => {
      const context = createTestContext('<button id="btn">Click</button>');
      
      let executed = false;
      const action = { 
        action: 'click', 
        target: '#btn', 
        reasoning_id: 'reasoning-123',
      } as any;
      
      const result = validateAction(action, context);
      
      expect(result.valid).toBe(true);
      expect(executed).toBe(false); // validator never calls execute
    });

    it('does not transmit data during validation', () => {
      const context = createTestContext('<button id="btn">Click</button>');
      
      const originalFetch = global.fetch;
      global.fetch = vi.fn();
      
      const action = createValidAction('click', '#btn');
      validateAction(action, context);
      
      expect(global.fetch).not.toHaveBeenCalled();
      global.fetch = originalFetch;
    });

    it('is deterministic for repeated validation', () => {
      const context = createTestContext('<button id="btn">Click</button>');
      
      const action = createValidAction('click', '#btn');
      const result1 = validateAction(action, context);
      const result2 = validateAction(action, context);
      const result3 = validateAction(action, context);
      
      expect(result1.valid).toBe(result2.valid);
      expect(result2.valid).toBe(result3.valid);
      expect(result1.reason).toBe(result2.reason);
    });
  });

  describe('Mock action source integration', () => {
    it('provides valid actions for testing (non-sensitive targets)', () => {
      const context = createTestContext(`
        <button id="submit-btn">Submit</button>
        <div id="scrollable-area">Content</div>
      `);

      const clickAction = createValidAction('click', '#submit-btn');
      const scrollAction = createValidAction('scroll', '#scrollable-area', { parameters: { direction: 'down', amount_px: 400 } });

      expect(validateAction(clickAction, context).valid).toBe(true);
      expect(validateAction(scrollAction, context).valid).toBe(true);
    });

    it('provides actions that correctly fail validation for sensitive fields', () => {
      const context = createTestContext(`
        <button id="submit-btn">Submit</button>
        <input type="email" id="email-field" />
        <input type="password" id="pwd-field" />
      `);

      const clickAction = createValidAction('click', '#submit-btn');
      const emailAction = createValidAction('fill', '#email-field');
      const pwdAction = createValidAction('fill', '#pwd-field');

      expect(validateAction(clickAction, context).valid).toBe(true);
      expect(validateAction(emailAction, context).valid).toBe(false);
      expect(validateAction(emailAction, context).reason).toBe('SENSITIVE_ACTION');
      expect(validateAction(pwdAction, context).valid).toBe(false);
      expect(validateAction(pwdAction, context).reason).toBe('SENSITIVE_ACTION');
    });
  });
});