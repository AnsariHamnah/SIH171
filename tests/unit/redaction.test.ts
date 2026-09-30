import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyRedactions, getPlaceholderForDetection, PII_TYPE_TO_PLACEHOLDER, buildRedactionActions } from '../../extension/src/shared/redaction';
import type { PIIDetection } from '../../extension/src/shared/types';

function createDetection(type: PIIDetection['type'], textOffset: { start: number; end: number }, originalValue?: string): PIIDetection {
  return {
    type,
    source: 'layer2_regex',
    confidence: 0.8,
    location: { textOffset },
    originalValue,
    reason: 'test',
    severity: 'high',
  };
}

describe('Redaction Module', () => {
  describe('getPlaceholderForDetection', () => {
    it('returns correct placeholder for each PII type', () => {
      expect(getPlaceholderForDetection(createDetection('email', { start: 0, end: 10 }))).toBe('[EMAIL]');
      expect(getPlaceholderForDetection(createDetection('phone', { start: 0, end: 10 }))).toBe('[PHONE]');
      expect(getPlaceholderForDetection(createDetection('password', { start: 0, end: 10 }))).toBe('[PASSWORD]');
      expect(getPlaceholderForDetection(createDetection('credit_card', { start: 0, end: 10 }))).toBe('[CREDIT_CARD]');
      expect(getPlaceholderForDetection(createDetection('ssn', { start: 0, end: 10 }))).toBe('[SSN]');
      expect(getPlaceholderForDetection(createDetection('address', { start: 0, end: 10 }))).toBe('[ADDRESS]');
      expect(getPlaceholderForDetection(createDetection('name', { start: 0, end: 10 }))).toBe('[NAME]');
      expect(getPlaceholderForDetection(createDetection('face', { start: 0, end: 10 }))).toBe('[FACE]');
      expect(getPlaceholderForDetection(createDetection('unknown', { start: 0, end: 10 }))).toBe('[REDACTED]');
    });
  });

  describe('PII_TYPE_TO_PLACEHOLDER', () => {
    it('contains all required placeholders', () => {
      expect(PII_TYPE_TO_PLACEHOLDER.email).toBe('[EMAIL]');
      expect(PII_TYPE_TO_PLACEHOLDER.phone).toBe('[PHONE]');
      expect(PII_TYPE_TO_PLACEHOLDER.password).toBe('[PASSWORD]');
      expect(PII_TYPE_TO_PLACEHOLDER.credit_card).toBe('[CREDIT_CARD]');
      expect(PII_TYPE_TO_PLACEHOLDER.ssn).toBe('[SSN]');
      expect(PII_TYPE_TO_PLACEHOLDER.address).toBe('[ADDRESS]');
      expect(PII_TYPE_TO_PLACEHOLDER.name).toBe('[NAME]');
      expect(PII_TYPE_TO_PLACEHOLDER.face).toBe('[FACE]');
      expect(PII_TYPE_TO_PLACEHOLDER.unknown).toBe('[REDACTED]');
    });
  });

  describe('applyRedactions', () => {
    it('returns original text when no detections', () => {
      const text = 'Hello world';
      const result = applyRedactions(text, []);
      expect(result.sanitizedText).toBe(text);
      expect(result.redactions).toHaveLength(0);
    });

    it('returns original text when text is empty', () => {
      const result = applyRedactions('', [createDetection('email', { start: 0, end: 10 })]);
      expect(result.sanitizedText).toBe('');
    });

    it('replaces single email with placeholder', () => {
      const text = 'Contact alice@example.test for info';
      const detection = createDetection('email', { start: 8, end: 26 }, 'alice@example.test');
      const result = applyRedactions(text, [detection]);
      expect(result.sanitizedText).toBe('Contact [EMAIL] for info');
      expect(result.redactions).toHaveLength(1);
      expect(result.redactions[0].replacement).toBe('[EMAIL]');
    });

    it('replaces single phone number with placeholder', () => {
      const text = 'Call 555-123-4567 now';
      const detection = createDetection('phone', { start: 5, end: 17 }, '555-123-4567');
      const result = applyRedactions(text, [detection]);
      expect(result.sanitizedText).toBe('Call [PHONE] now');
    });

    it('replaces single password with placeholder', () => {
      const text = 'Password: secret123';
      const detection = createDetection('password', { start: 10, end: 19 }, 'secret123');
      const result = applyRedactions(text, [detection]);
      expect(result.sanitizedText).toBe('Password: [PASSWORD]');
    });

    it('replaces multiple different PII types in one text', () => {
      const text = 'Email alice@example.test and call 555-123-4567';
      const detections = [
        createDetection('email', { start: 6, end: 24 }, 'alice@example.test'),
        createDetection('phone', { start: 34, end: 46 }, '555-123-4567'),
      ];
      const result = applyRedactions(text, detections);
      expect(result.sanitizedText).toBe('Email [EMAIL] and call [PHONE]');
      expect(result.redactions).toHaveLength(2);
    });

    it('handles adjacent PII detections', () => {
      const text = 'alice@example.test555-123-4567';
      const detections = [
        createDetection('email', { start: 0, end: 18 }, 'alice@example.test'),
        createDetection('phone', { start: 18, end: 30 }, '555-123-4567'),
      ];
      const result = applyRedactions(text, detections);
      expect(result.sanitizedText).toBe('[EMAIL][PHONE]');
    });

    it('handles overlapping detections - keeps first one', () => {
      const text = 'alice@example.test';
      const detections = [
        createDetection('email', { start: 0, end: 18 }, 'alice@example.test'),
        createDetection('phone', { start: 5, end: 15 }, 'example'),
      ];
      const result = applyRedactions(text, detections);
      expect(result.sanitizedText).toBe('[EMAIL]');
      expect(result.redactions).toHaveLength(1);
    });

    it('handles multiple detections of same type', () => {
      const text = 'Email alice@example.test and bob@test.org';
      const detections = [
        createDetection('email', { start: 6, end: 24 }, 'alice@example.test'),
        createDetection('email', { start: 29, end: 42 }, 'bob@test.org'),
      ];
      const result = applyRedactions(text, detections);
      expect(result.sanitizedText).toBe('Email [EMAIL] and [EMAIL]');
      expect(result.redactions).toHaveLength(2);
    });

    it('preserves non-sensitive text around detections', () => {
      const text = 'Hello alice@example.test world';
      const detection = createDetection('email', { start: 6, end: 24 }, 'alice@example.test');
      const result = applyRedactions(text, [detection]);
      expect(result.sanitizedText).toBe('Hello [EMAIL] world');
    });

    it('handles detection at start of text', () => {
      const text = 'alice@example.test is my email';
      const detection = createDetection('email', { start: 0, end: 18 }, 'alice@example.test');
      const result = applyRedactions(text, [detection]);
      expect(result.sanitizedText).toBe('[EMAIL] is my email');
    });

    it('handles detection at end of text', () => {
      const text = 'My email is alice@example.test';
      const detection = createDetection('email', { start: 12, end: 30 }, 'alice@example.test');
      const result = applyRedactions(text, [detection]);
      expect(result.sanitizedText).toBe('My email is [EMAIL]');
    });

    it('handles detection covering entire text', () => {
      const text = 'alice@example.test';
      const detection = createDetection('email', { start: 0, end: 18 }, 'alice@example.test');
      const result = applyRedactions(text, [detection]);
      expect(result.sanitizedText).toBe('[EMAIL]');
    });

    it('uses originalValue from detection when available', () => {
      const text = 'Contact: alice@example.test';
      const detection = createDetection('email', { start: 9, end: 27 }, 'alice@example.test');
      const result = applyRedactions(text, [detection]);
      expect(result.redactions[0].originalValue).toBe('alice@example.test');
    });

    it('handles credit card detection', () => {
      const text = 'Card: 4532015112830366';
      const detection = createDetection('credit_card', { start: 6, end: 22 }, '4532015112830366');
      const result = applyRedactions(text, [detection]);
      expect(result.sanitizedText).toBe('Card: [CREDIT_CARD]');
    });

    it('handles SSN detection', () => {
      const text = 'SSN: 123-45-6789';
      const detection = createDetection('ssn', { start: 5, end: 16 }, '123-45-6789');
      const result = applyRedactions(text, [detection]);
      expect(result.sanitizedText).toBe('SSN: [SSN]');
    });
  });

  describe('buildRedactionActions', () => {
    it('creates redaction actions for all detections', () => {
      const detections = [
        createDetection('email', { start: 0, end: 10 }),
        createDetection('phone', { start: 11, end: 21 }),
      ];
      const actions = buildRedactionActions(detections);
      expect(actions).toHaveLength(2);
      expect(actions[0].type).toBe('placeholder');
      expect(actions[0].replacement).toBe('[EMAIL]');
      expect(actions[1].replacement).toBe('[PHONE]');
    });
  });
});