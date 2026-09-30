console.log('[SIH-26171] Content script loaded');

import { extractDOMElements, toDOMElementMetadata } from '../shared/dom-extraction';
import { runDetectionPipeline, groupDetectionsByElement } from '../shared/detection-pipeline';
import { buildSanitizedContext, buildStructuredSanitizedContext, validateSanitizedContext } from '../shared/sanitized-context';
import { validateAction, createValidationContext } from '../shared/action-validator';
import { createMockActionSourceFromContext, EMAIL_FIELD_1, PASSWORD_FIELD_1 } from '../shared/mock-action-source';
import type { PIIDetection, DOMElementMetadata, SanitizedContext, StructuredSanitizedContext, Action, ActionValidationResult } from '../shared/types';

interface MessageFromBackground {
  type: string;
  payload?: unknown;
}

interface ExtractDOMResponse {
  elements: DOMElementMetadata[];
  detections: PIIDetection[];
  success: boolean;
  error?: string;
}

interface SanitizeDOMResponse {
  sanitizedContext: SanitizedContext;
  structuredContext: StructuredSanitizedContext;
  validationPassed: boolean;
  success: boolean;
  error?: string;
}

interface ValidateActionResponse {
  validationResult: ActionValidationResult;
  success: boolean;
  error?: string;
}

interface MockActionSourceResponse {
  actions: Record<string, Action>;
  success: boolean;
  error?: string;
}

function runExtractionAndDetection(): ExtractDOMResponse {
  try {
    const extractedElements = extractDOMElements();
    
    const detectionResult = runDetectionPipeline(extractedElements);
    
    const detectionsMap = groupDetectionsByElement(extractedElements, detectionResult.detections);
    
    const domElements: DOMElementMetadata[] = extractedElements.map(el => {
      const elementDetections = detectionsMap.get(el.element) || [];
      return toDOMElementMetadata(el, elementDetections);
    });

    return {
      elements: domElements,
      detections: detectionResult.detections,
      success: true,
    };
  } catch (error) {
    return {
      elements: [],
      detections: [],
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function runSanitization(): SanitizeDOMResponse {
  try {
    const extractedElements = extractDOMElements();
    
    const detectionResult = runDetectionPipeline(extractedElements);
    
    const detectionsMap = groupDetectionsByElement(extractedElements, detectionResult.detections);
    
    const domElements: DOMElementMetadata[] = extractedElements.map(el => {
      const elementDetections = detectionsMap.get(el.element) || [];
      return toDOMElementMetadata(el, elementDetections);
    });

    const sanitizedContext = buildSanitizedContext(domElements, window.location.href);
    const structuredContext = buildStructuredSanitizedContext(domElements, window.location.href);
    const validationPassed = validateSanitizedContext(sanitizedContext);

    return {
      sanitizedContext,
      structuredContext,
      validationPassed,
      success: true,
    };
  } catch (error) {
    return {
      sanitizedContext: { metadata: { url: '', timestamp: 0, domElements: [] }, redactions: [] },
      structuredContext: { page: { url_origin: '', title: '', viewport: { width: 0, height: 0 } }, elements: [] },
      validationPassed: false,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function runValidateAction(action: unknown): ValidateActionResponse {
  try {
    const extractedElements = extractDOMElements();
    const detectionResult = runDetectionPipeline(extractedElements);
    const detectionsMap = groupDetectionsByElement(extractedElements, detectionResult.detections);
    
    const domElements: DOMElementMetadata[] = extractedElements.map(el => {
      const elementDetections = detectionsMap.get(el.element) || [];
      return toDOMElementMetadata(el, elementDetections);
    });

    const valueRefStore: Record<string, string> = {
      [EMAIL_FIELD_1]: 'alice@example.test',
      [PASSWORD_FIELD_1]: 'secret123',
    };
    const knownReasoningIds = new Set(['reasoning-123', 'reasoning-456']);
    
    const context = createValidationContext(window.location.href, domElements, valueRefStore, knownReasoningIds);
    
    const validationResult = validateAction(action, context);

    return {
      validationResult,
      success: true,
    };
  } catch (error) {
    return {
      validationResult: { valid: false, reason: 'INVALID_SCHEMA', details: error instanceof Error ? error.message : 'Unknown error' },
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function runMockActionSource(): MockActionSourceResponse {
  try {
    const extractedElements = extractDOMElements();
    const detectionResult = runDetectionPipeline(extractedElements);
    const detectionsMap = groupDetectionsByElement(extractedElements, detectionResult.detections);
    
    const domElements: DOMElementMetadata[] = extractedElements.map(el => {
      const elementDetections = detectionsMap.get(el.element) || [];
      return toDOMElementMetadata(el, elementDetections);
    });

    const valueRefStore: Record<string, string> = {
      [EMAIL_FIELD_1]: 'alice@example.test',
      [PASSWORD_FIELD_1]: 'secret123',
    };
    const knownReasoningIds = new Set(['reasoning-123', 'reasoning-456']);
    
    const context = createValidationContext(window.location.href, domElements, valueRefStore, knownReasoningIds);
    const mockSource = createMockActionSourceFromContext(context, valueRefStore, knownReasoningIds);

    const actions: Record<string, Action> = {
      validClick: mockSource.getValidClick(),
      validFill: mockSource.getValidFill(),
      validScroll: mockSource.getValidScroll(),
      nonexistentTarget: mockSource.getNonexistentTargetAction(),
      staleAction: mockSource.getStaleAction(),
      sensitiveField: mockSource.getSensitiveFieldAction(),
      invalidValueRef: mockSource.getInvalidValueRefAction(),
      invisibleTarget: mockSource.getInvisibleTargetAction(),
      disabledTarget: mockSource.getDisabledTargetAction(),
    };

    return {
      actions,
      success: true,
    };
  } catch (error) {
    return {
      actions: {},
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

chrome.runtime.onMessage.addListener((message: MessageFromBackground, sender, sendResponse) => {
  console.log('[SIH-26171] Content received message:', message.type);
  
  if (message.type === 'EXTRACT_DOM') {
    const result = runExtractionAndDetection();
    sendResponse(result);
    return true;
  }
  
  if (message.type === 'SANITIZE_DOM') {
    const result = runSanitization();
    sendResponse(result);
    return true;
  }
  
  if (message.type === 'VALIDATE_ACTION') {
    const action = message.payload;
    if (!action) {
      sendResponse({ validationResult: { valid: false, reason: 'INVALID_SCHEMA', details: 'Missing action payload' }, success: false, error: 'Missing action payload' });
      return true;
    }
    const result = runValidateAction(action);
    sendResponse(result);
    return true;
  }
  
  if (message.type === 'MOCK_ACTION_SOURCE') {
    const result = runMockActionSource();
    sendResponse(result);
    return true;
  }
  
  if (message.type === 'PING') {
    sendResponse({ received: true });
    return true;
  }
  
  sendResponse({ received: true });
  return true;
});

export { runExtractionAndDetection, runSanitization, runValidateAction, extractDOMElements };