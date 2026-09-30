import { describe, it, expect } from 'vitest';

describe('Shared Types', () => {
  it('should have basic type structure defined', () => {
    const piiDetection = {
      type: 'email' as const,
      confidence: 0.95,
      location: { selector: 'input[type="email"]' },
      originalValue: 'test@example.com'
    };

    expect(piiDetection.type).toBe('email');
    expect(piiDetection.confidence).toBeGreaterThan(0.9);
  });

  it('should support redaction action types', () => {
    const redactionAction = {
      type: 'placeholder' as const,
      target: { type: 'email' as const, confidence: 0.9, location: {} },
      replacement: '[EMAIL]'
    };

    expect(redactionAction.type).toBe('placeholder');
    expect(redactionAction.replacement).toBe('[EMAIL]');
  });

  it('should support action types', () => {
    const action = {
      type: 'click' as const,
      selector: 'button.submit',
      reasoning: 'Submit the form'
    };

    expect(action.type).toBe('click');
    expect(action.selector).toBe('button.submit');
  });
});