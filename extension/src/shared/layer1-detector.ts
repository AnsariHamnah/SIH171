import type { ExtractedElement } from './dom-extraction';
import type { PIIDetection } from './types';

export interface Layer1DetectionResult {
  detections: PIIDetection[];
}

function createDetection(
  type: PIIDetection['type'],
  element: ExtractedElement,
  reason: string,
  severity: PIIDetection['severity'] = 'high'
): PIIDetection {
  const selector = generateSelector(element.element);
  return {
    type,
    source: 'layer1_typed_field',
    confidence: 0.95,
    location: {
      selector,
      boundingBox: element.boundingBox,
    },
    originalValue: element.textContent || undefined,
    reason,
    severity,
  };
}

function generateSelector(element: Element): string {
  if (element.id) {
    return `#${element.id}`;
  }
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body) {
    let part = current.tagName.toLowerCase();
    if (current.id) {
      part += `#${current.id}`;
      parts.unshift(part);
      break;
    }
    const parent: Element | null = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((el: Element) => el.tagName === current!.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        part += `:nth-of-type(${index})`;
      }
    }
    parts.unshift(part);
    current = parent;
  }
  return parts.join(' > ');
}

const PASSWORD_TYPES = ['password'];
const PASSWORD_AUTOCOMPLETE = ['current-password', 'new-password', 'one-time-code'];

const EMAIL_TYPES = ['email'];
const EMAIL_AUTOCOMPLETE = ['email', 'username'];

const PHONE_TYPES = ['tel'];
const PHONE_AUTOCOMPLETE = ['tel', 'tel-national', 'tel-area-code', 'tel-country-code', 'tel-local', 'tel-local-prefix', 'tel-local-suffix', 'tel-extension'];

const CREDIT_CARD_AUTOCOMPLETE = ['cc-number', 'cc-name', 'cc-exp', 'cc-exp-month', 'cc-exp-year', 'cc-csc', 'cc-type'];

const SSN_AUTOCOMPLETE = ['ssn'];

const ADDRESS_AUTOCOMPLETE = [
  'street-address', 'address-line1', 'address-line2', 'address-line3',
  'address-level1', 'address-level2', 'address-level3', 'address-level4',
  'postal-code', 'country', 'country-name'
];

const NAME_AUTOCOMPLETE = ['name', 'given-name', 'additional-name', 'family-name', 'honorific-prefix', 'honorific-suffix', 'nickname'];

const ARIA_SENSITIVE_ROLES = ['password', 'searchbox'];
const ARIA_SENSITIVE_LABELS = [
  'password', 'passcode', 'pin', 'secret', 'ssn', 'social security',
  'credit card', 'card number', 'cvv', 'cvc', 'expiration',
  'email', 'e-mail', 'phone', 'telephone', 'mobile',
  'address', 'street', 'zip', 'postal'
];

export function detectLayer1(extractedElements: ExtractedElement[]): Layer1DetectionResult {
  const detections: PIIDetection[] = [];

  for (const element of extractedElements) {
    if (!element.isVisible) continue;

    const tagName = element.tagName.toLowerCase();
    const inputType = element.inputType?.toLowerCase() || '';
    const autocomplete = element.autocomplete?.toLowerCase() || '';
    const role = element.role?.toLowerCase() || '';
    const ariaLabel = element.ariaLabel?.toLowerCase() || '';
    const labelText = element.labelText?.toLowerCase() || '';

    if (tagName === 'input' || tagName === 'textarea') {
      if (PASSWORD_TYPES.includes(inputType) || PASSWORD_AUTOCOMPLETE.some(ac => autocomplete.includes(ac))) {
        detections.push(createDetection('password', element, `Input type="${inputType}" or autocomplete="${autocomplete}" indicates password field`, 'critical'));
        continue;
      }

      if (EMAIL_TYPES.includes(inputType) || EMAIL_AUTOCOMPLETE.some(ac => autocomplete.includes(ac))) {
        detections.push(createDetection('email', element, `Input type="${inputType}" or autocomplete="${autocomplete}" indicates email field`, 'high'));
        continue;
      }

      if (PHONE_TYPES.includes(inputType) || PHONE_AUTOCOMPLETE.some(ac => autocomplete.includes(ac))) {
        detections.push(createDetection('phone', element, `Input type="${inputType}" or autocomplete="${autocomplete}" indicates phone field`, 'high'));
        continue;
      }

      if (CREDIT_CARD_AUTOCOMPLETE.some(ac => autocomplete.includes(ac))) {
        detections.push(createDetection('credit_card', element, `autocomplete="${autocomplete}" indicates credit card field`, 'critical'));
        continue;
      }

      if (SSN_AUTOCOMPLETE.some(ac => autocomplete.includes(ac))) {
        detections.push(createDetection('ssn', element, `autocomplete="${autocomplete}" indicates SSN field`, 'critical'));
        continue;
      }

      if (ADDRESS_AUTOCOMPLETE.some(ac => autocomplete.includes(ac))) {
        detections.push(createDetection('address', element, `autocomplete="${autocomplete}" indicates address field`, 'medium'));
        continue;
      }

      if (NAME_AUTOCOMPLETE.some(ac => autocomplete.includes(ac))) {
        detections.push(createDetection('name', element, `autocomplete="${autocomplete}" indicates name field`, 'medium'));
        continue;
      }
    }

    if (role === 'password' || ARIA_SENSITIVE_ROLES.includes(role)) {
      detections.push(createDetection('password', element, `role="${role}" indicates password field`, 'critical'));
      continue;
    }

    const combinedLabels = `${ariaLabel} ${labelText}`.toLowerCase();
    for (const sensitiveLabel of ARIA_SENSITIVE_LABELS) {
      if (combinedLabels.includes(sensitiveLabel)) {
        let type: PIIDetection['type'] = 'unknown';
        if (['password', 'passcode', 'pin', 'secret'].includes(sensitiveLabel)) type = 'password';
        else if (['ssn', 'social security'].includes(sensitiveLabel)) type = 'ssn';
        else if (['credit card', 'card number', 'cvv', 'cvc', 'expiration'].includes(sensitiveLabel)) type = 'credit_card';
        else if (['email', 'e-mail'].includes(sensitiveLabel)) type = 'email';
        else if (['phone', 'telephone', 'mobile'].includes(sensitiveLabel)) type = 'phone';
        else if (['address', 'street', 'zip', 'postal'].includes(sensitiveLabel)) type = 'address';

        if (type !== 'unknown') {
          detections.push(createDetection(type, element, `ARIA label or associated label contains "${sensitiveLabel}"`, 'high'));
          break;
        }
      }
    }
  }

  return { detections };
}