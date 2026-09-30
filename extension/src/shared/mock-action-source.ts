import type { Action, ActionType, DOMElementMetadata, ValidationContext } from './types';

export interface MockActionSource {
  getValidClick(): Action;
  getValidFill(): Action;
  getValidScroll(): Action;
  getMalformedAction(): unknown;
  getNonexistentTargetAction(): Action;
  getStaleAction(): Action;
  getSensitiveFieldAction(): Action;
  getInvalidValueRefAction(): Action;
  getWrongOriginAction(): Action;
  getInvisibleTargetAction(): Action;
  getDisabledTargetAction(): Action;
  getUnknownActionType(): unknown;
  getActionWithUnexpectedFields(): unknown;
}

function createMockActionSource(
  domElements: DOMElementMetadata[],
  _valueRefStore: Record<string, string> = { [EMAIL_FIELD_1]: 'alice@example.test' },
  _knownReasoningIds: Set<string> = new Set(['reasoning-123', 'reasoning-456'])
): MockActionSource {
  // Find a clickable element
  const clickableElement = domElements.find(el => 
    el.isVisible && 
    (el.tagName.toLowerCase() === 'button' || 
     el.tagName.toLowerCase() === 'a' ||
     el.attributes.role === 'button')
  ) || domElements[0];

  // Find a fillable element (non-sensitive)
  const fillableElement = domElements.find(el => 
    el.isVisible &&
    (el.tagName.toLowerCase() === 'input' ||
     el.tagName.toLowerCase() === 'textarea') &&
    el.attributes.type !== 'password' &&
    !el.piiDetections.some(d => d.type === 'password' || d.type === 'credit_card' || d.type === 'ssn')
  ) || domElements[0];

  // Find a scrollable element
  const scrollableElement = domElements.find(el => el.tagName.toLowerCase() === 'div') || domElements[0];

  // Find a sensitive element
  const sensitiveElement = domElements.find(el => 
    el.piiDetections.some(d => d.type === 'password' || d.type === 'credit_card' || d.type === 'ssn')
  ) || domElements[0];

  // Find an invisible element
  const invisibleElement = domElements.find(el => !el.isVisible) || domElements[0];

  // Find a disabled element
  const disabledElement = domElements.find(el => 
    el.attributes.disabled === 'true' || 
    el.attributes.disabled === ''
  ) || domElements[0];

  const baseAction = (type: ActionType, target: string, overrides: Partial<Action> = {}): Action => ({
    action: type,
    target,
    reasoning_id: 'reasoning-123',
    ...overrides,
  });

  return {
    getValidClick: () => baseAction('click', `#${clickableElement?.attributes.id || 'submit-btn'}`),
    getValidFill: () => baseAction('fill', `#${fillableElement?.attributes.id || 'email-field'}`, { value_ref: '[EMAIL_FIELD_1]' }),
    getValidScroll: () => baseAction('scroll', `#${scrollableElement?.attributes.id || 'scrollable-area'}`, {
      parameters: { direction: 'down', amount_px: 400 },
    }),
    getMalformedAction: () => ({
      action: 'click',
      // missing target
      reasoning_id: 'reasoning-123',
    }),
    getNonexistentTargetAction: () => baseAction('click', '#nonexistent-element'),
    getStaleAction: () => baseAction('click', `#${sensitiveElement?.attributes.id || 'password-field'}`),
    getSensitiveFieldAction: () => baseAction('fill', `#${sensitiveElement?.attributes.id || 'password-field'}`, { value_ref: '[PASSWORD_FIELD_1]' }),
    getInvalidValueRefAction: () => baseAction('fill', `#${fillableElement?.attributes.id || 'email-field'}`, { value_ref: '[UNKNOWN_REF]' }),
    getWrongOriginAction: () => baseAction('click', '#submit-btn'), // will fail origin check
    getInvisibleTargetAction: () => baseAction('click', `#${invisibleElement?.attributes.id || 'hidden-element'}`),
    getDisabledTargetAction: () => baseAction('click', `#${disabledElement?.attributes.id || 'disabled-btn'}`),
    getUnknownActionType: () => ({
      action: 'navigate', // not in MVP allowed set
      target: '#some-element',
      reasoning_id: 'reasoning-123',
    }),
    getActionWithUnexpectedFields: () => ({
      action: 'click',
      target: '#submit-btn',
      reasoning_id: 'reasoning-123',
      extra_field: 'malicious-data',
    }),
  };
}

export function createMockActionSourceFromContext(
  context: ValidationContext,
  valueRefStore?: Record<string, string>,
  knownReasoningIds?: Set<string>
): MockActionSource {
  return createMockActionSource(context.domElements, valueRefStore, knownReasoningIds);
}

export const EMAIL_FIELD_1 = '[EMAIL_FIELD_1]';
export const PASSWORD_FIELD_1 = '[PASSWORD_FIELD_1]';