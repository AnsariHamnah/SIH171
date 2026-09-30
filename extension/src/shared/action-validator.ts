import type {
  Action,
  ActionType,
  ActionValidationResult,
  DOMElementMetadata,
  PIIDetection,
  ValidationContext,
} from './types';

const ALLOWED_ACTION_TYPES: ActionType[] = ['click', 'fill', 'scroll', 'focus', 'select'];

const SENSITIVE_PII_TYPES: PIIDetection['type'][] = [
  'password',
  'credit_card',
  'ssn',
  'email',
  'phone',
  'address',
  'name',
];

function getOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return 'unknown';
  }
}

function resolveSelector(selector: string, domElements: DOMElementMetadata[]): DOMElementMetadata[] {
  const matches: DOMElementMetadata[] = [];
  
  for (const element of domElements) {
    if (element.attributes.id && selector === `#${element.attributes.id}`) {
      matches.push(element);
    } else if (element.attributes.name && selector === `[name="${element.attributes.name}"]`) {
      matches.push(element);
    } else if (selector.startsWith('[') && selector.endsWith(']')) {
      const attrMatch = selector.match(/\[([^=]+)(?:="([^"]*)")?\]/);
      if (attrMatch) {
        const attrName = attrMatch[1];
        const attrValue = attrMatch[2];
        if (element.attributes[attrName] && (!attrValue || element.attributes[attrName] === attrValue)) {
          matches.push(element);
        }
      }
    } else if (selector === element.tagName.toLowerCase()) {
      matches.push(element);
    }
  }
  
  return matches;
}

function isElementSensitive(element: DOMElementMetadata): boolean {
  return element.piiDetections.some(d => SENSITIVE_PII_TYPES.includes(d.type));
}

function isElementInSensitiveForm(element: DOMElementMetadata, domElements: DOMElementMetadata[]): boolean {
  if (!element.formId) return false;
  // Check if any element in the same form has high/critical severity PII
  const formElements = domElements.filter(e => e.formId === element.formId);
  for (const formEl of formElements) {
    if (formEl.piiDetections.some(d => d.severity === 'critical' || d.severity === 'high')) {
      return true;
    }
  }
  return false;
}

function isElementInteractable(element: DOMElementMetadata): boolean {
  if (!element.isVisible) return false;
  if (element.attributes.disabled === 'true' || element.attributes.disabled === '') return false;
  if (element.attributes.readonly === 'true' || element.attributes.readonly === '') return false;
  if (element.attributes['aria-disabled'] === 'true') return false;
  return true;
}

function isValidActionSchema(action: unknown): action is Action {
  if (!action || typeof action !== 'object') return false;
  
  const obj = action as Record<string, unknown>;
  
  if (typeof obj.action !== 'string') return false;
  if (typeof obj.target !== 'string') return false;
  if (typeof obj.reasoning_id !== 'string') return false;
  
  if (obj.parameters !== undefined && (typeof obj.parameters !== 'object' || obj.parameters === null)) {
    return false;
  }
  if (obj.value_ref !== undefined && typeof obj.value_ref !== 'string') {
    return false;
  }
  
  const allowedKeys = ['action', 'target', 'parameters', 'reasoning_id', 'value_ref'];
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.includes(key)) {
      return false;
    }
  }
  
  return true;
}

function hasUnexpectedFields(action: Action): boolean {
  const allowedKeys = ['action', 'target', 'parameters', 'reasoning_id', 'value_ref'];
  for (const key of Object.keys(action)) {
    if (!allowedKeys.includes(key)) {
      return true;
    }
  }
  return false;
}

export function validateAction(
  action: unknown,
  context: ValidationContext
): ActionValidationResult {
  // Check 1: Session/domain allow-list
  if (!context.allowedOrigins.includes(context.currentOrigin)) {
    return {
      valid: false,
      reason: 'ORIGIN_MISMATCH',
      details: `Action origin ${context.currentOrigin} is not in allowed origins list`,
    };
  }

  // Check 2: Action schema validation
  if (!isValidActionSchema(action)) {
    return {
      valid: false,
      reason: 'INVALID_SCHEMA',
      details: 'Action does not conform to required schema',
    };
  }

  const typedAction = action as Action;

  // Check 3: Action-type allow-list
  if (!ALLOWED_ACTION_TYPES.includes(typedAction.action)) {
    return {
      valid: false,
      reason: 'UNSUPPORTED_ACTION',
      details: `Action type "${typedAction.action}" is not in the allowed MVP set`,
    };
  }

  // Check 4: reasoning_id traceability
  if (!typedAction.reasoning_id || !context.knownReasoningIds.has(typedAction.reasoning_id)) {
    return {
      valid: false,
      reason: 'MISSING_REASONING_ID',
      details: 'Action missing valid reasoning_id',
    };
  }

  // Check 5: Selector existence and uniqueness
  const targetElements = resolveSelector(typedAction.target, context.domElements);
  if (targetElements.length === 0) {
    return {
      valid: false,
      reason: 'TARGET_NOT_FOUND',
      details: `Selector "${typedAction.target}" matched zero elements`,
    };
  }
  if (targetElements.length > 1) {
    return {
      valid: false,
      reason: 'AMBIGUOUS_TARGET',
      details: `Selector "${typedAction.target}" matched ${targetElements.length} elements`,
    };
  }

  const targetElement = targetElements[0];

  // Check 6: Visibility and interactability
  if (!targetElement.isVisible) {
    return {
      valid: false,
      reason: 'INVISIBLE_TARGET',
      details: 'Target element is not visible',
    };
  }
  if (!isElementInteractable(targetElement)) {
    return {
      valid: false,
      reason: 'DISABLED_TARGET',
      details: 'Target element is disabled or not interactable',
    };
  }

  // Check 7: Selector re-classification / Sensitive-pattern confirmation gate
  if (isElementSensitive(targetElement) || isElementInSensitiveForm(targetElement, context.domElements)) {
    return {
      valid: false,
      reason: 'SENSITIVE_ACTION',
      details: 'Action targets sensitive element; requires explicit user confirmation',
    };
  }

  // Check 8: value_ref resolution
  if (typedAction.value_ref) {
    if (!context.valueRefStore[typedAction.value_ref]) {
      return {
        valid: false,
        reason: 'INVALID_VALUE_REF',
        details: `value_ref "${typedAction.value_ref}" not found in client store`,
      };
    }
  }

  // Check 9: Unexpected fields
  if (hasUnexpectedFields(typedAction)) {
    return {
      valid: false,
      reason: 'UNEXPECTED_FIELDS',
      details: 'Action contains unexpected fields not in schema',
    };
  }

  // All checks passed
  return {
    valid: true,
    sanitizedAction: typedAction,
  };
}

export function createValidationContext(
  currentUrl: string,
  domElements: DOMElementMetadata[],
  valueRefStore: Record<string, string> = {},
  knownReasoningIds: Set<string> = new Set(),
  allowedOrigins: string[] = ['https://example.test']
): ValidationContext {
  return {
    currentUrl,
    currentOrigin: getOrigin(currentUrl),
    domElements,
    valueRefStore,
    knownReasoningIds,
    sensitiveFormDetected: domElements.some(el => 
      el.tagName.toLowerCase() === 'form' && 
      el.piiDetections.some(d => d.severity === 'critical' || d.severity === 'high')
    ),
    allowedOrigins,
  };
}

export { ALLOWED_ACTION_TYPES, SENSITIVE_PII_TYPES };