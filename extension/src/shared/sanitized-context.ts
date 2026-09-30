import type { DOMElementMetadata, SanitizedContext, PIIDetection, StructuredSanitizedContext, SanitizedElement } from './types';
import { getPlaceholderForDetection } from './redaction';

function getOrigin(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return 'unknown';
  }
}

function generateElementId(element: DOMElementMetadata, index: number): string {
  return `element-${index}`;
}

function getRoleFromElement(element: DOMElementMetadata): string {
  const tagName = element.tagName.toLowerCase();
  const interactiveRoles: Record<string, string> = {
    'a': 'link',
    'button': 'button',
    'input': 'textbox',
    'select': 'combobox',
    'textarea': 'textbox',
    'img': 'img',
    'form': 'form',
    'nav': 'navigation',
    'main': 'main',
    'article': 'article',
    'section': 'region',
    'aside': 'complementary',
    'header': 'banner',
    'footer': 'contentinfo',
  };
  return interactiveRoles[tagName] || tagName;
}

function getLabelFromElement(element: DOMElementMetadata, isSensitive: boolean): string {
  if (isSensitive) {
    const detection = element.piiDetections[0];
    if (detection) {
      return getPlaceholderForDetection(detection);
    }
    return '[REDACTED]';
  }
  return element.textContent || element.attributes['aria-label'] || element.attributes['name'] || element.attributes['placeholder'] || '';
}

function isElementSensitive(element: DOMElementMetadata): boolean {
  return element.piiDetections.length > 0;
}

export function buildSanitizedContext(
  domElements: DOMElementMetadata[],
  url: string,
  _title: string = document.title
): SanitizedContext {
  const timestamp = Date.now();
  const urlOrigin = getOrigin(url);

  const sanitizedElements = domElements
    .filter(el => el.isVisible)
    .map((element) => {
      const isSensitive = isElementSensitive(element);
      
      const sanitizedTextContent = isSensitive && element.textContent
        ? getPlaceholderForDetection(element.piiDetections[0])
        : element.textContent;

      return {
        ...element,
        textContent: sanitizedTextContent,
      };
    });

  return {
    metadata: {
      url: urlOrigin,
      timestamp,
      domElements: sanitizedElements,
      visualRegions: undefined,
    },
    redactions: sanitizedElements
      .filter(el => el.piiDetections.length > 0)
      .flatMap(el => el.piiDetections.map(detection => ({
        type: 'placeholder' as const,
        target: detection,
        replacement: getPlaceholderForDetection(detection),
      }))),
  };
}

export function buildStructuredSanitizedContext(
  domElements: DOMElementMetadata[],
  url: string,
  _title: string = document.title
): StructuredSanitizedContext {
  const urlOrigin = getOrigin(url);
  const viewport = {
    width: window.innerWidth || document.documentElement.clientWidth,
    height: window.innerHeight || document.documentElement.clientHeight,
  };

  const elements: SanitizedElement[] = domElements
    .filter(el => el.isVisible)
    .map((element, index) => {
      const isSensitive = isElementSensitive(element);
      return {
        id: generateElementId(element, index),
        role: getRoleFromElement(element),
        label: getLabelFromElement(element, isSensitive),
        sensitive: isSensitive,
        bbox: element.boundingBox,
      };
    });

  return {
    page: {
      url_origin: urlOrigin,
      title: _title,
      viewport,
    },
    elements,
  };
}

export function validateSanitizedContext(context: SanitizedContext): boolean {
  const sensitiveTypes: PIIDetection['type'][] = ['password', 'credit_card', 'ssn', 'email', 'phone', 'address', 'name', 'face'];
  
  for (const element of context.metadata.domElements) {
    if (element.textContent) {
      for (const sensitiveType of sensitiveTypes) {
        if (sensitiveType === 'credit_card') {
          if (element.textContent.includes('[CREDIT_CARD]')) continue;
        }
        if (sensitiveType === 'email') {
          if (element.textContent.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/) && !element.textContent.includes('[EMAIL]')) {
            return false;
          }
        }
        if (sensitiveType === 'phone') {
          if (element.textContent.match(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/) && !element.textContent.includes('[PHONE]')) {
            return false;
          }
        }
        if (sensitiveType === 'password') {
          if (element.textContent.length > 0 && !element.textContent.includes('[PASSWORD]')) {
            // If the element has a password detection but textContent is not redacted
            const hasPasswordDetection = element.piiDetections.some(d => d.type === 'password');
            if (hasPasswordDetection) {
              return false;
            }
          }
        }
      }
    }
    
    for (const detection of element.piiDetections) {
      if (detection.originalValue) {
        if (element.textContent && element.textContent.includes(detection.originalValue)) {
          return false;
        }
      }
    }
  }
  
  return true;
}