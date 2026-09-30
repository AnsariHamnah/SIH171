import type {
  DOMElementMetadata,
  SanitizedContext,
  PIIDetection,
  StructuredSanitizedContext,
  SanitizedElement,
  VisualRegionMetadata,
} from './types';

import { getPlaceholderForDetection } from './redaction';
import { RedactionMethod } from './visual-redaction';

function getOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return 'unknown';
  }
}

function generateElementId(
  _element: DOMElementMetadata,
  index: number
): string {
  return `element-${index}`;
}

function getRoleFromElement(element: DOMElementMetadata): string {
  const tagName = element.tagName.toLowerCase();

  const interactiveRoles: Record<string, string> = {
    a: 'link',
    button: 'button',
    input: 'textbox',
    select: 'combobox',
    textarea: 'textbox',
    img: 'img',
    form: 'form',
    nav: 'navigation',
    main: 'main',
    article: 'article',
    section: 'region',
    aside: 'complementary',
    header: 'banner',
    footer: 'contentinfo',
  };

  return interactiveRoles[tagName] || tagName;
}

function isElementSensitive(element: DOMElementMetadata): boolean {
  return (element.piiDetections ?? []).length > 0;
}

function getLabelFromElement(
  element: DOMElementMetadata,
  isSensitive: boolean
): string {
  if (isSensitive) {
    const detection = element.piiDetections[0];

    return detection
      ? getPlaceholderForDetection(detection)
      : '[REDACTED]';
  }

  const attributes = element.attributes ?? {};

  return (
    element.textContent ||
    attributes['aria-label'] ||
    attributes['name'] ||
    attributes['placeholder'] ||
    ''
  );
}

/**
 * Escapes a string so it can safely be used in a regular expression.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Redacts detected values and common email/phone patterns.
 * This is defense in depth, not a complete PII detector.
 */
function sanitizeString(
  value: string,
  detections: PIIDetection[]
): string {
  let sanitized = value;

  for (const detection of detections) {
    const originalValue = detection.originalValue;

    if (typeof originalValue !== 'string' || !originalValue.trim()) {
      continue;
    }

    sanitized = sanitized.replace(
      new RegExp(escapeRegExp(originalValue), 'gi'),
      getPlaceholderForDetection(detection)
    );
  }

  // Redact common email patterns.
  sanitized = sanitized.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    '[EMAIL]'
  );

  // Redact common 10-digit phone-number patterns.
  sanitized = sanitized.replace(
    /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g,
    '[PHONE]'
  );

  return sanitized;
}

/**
 * Recursively sanitizes strings in objects and arrays.
 */
function sanitizeUnknown<T>(
  value: T,
  detections: PIIDetection[]
): T {
  if (typeof value === 'string') {
    return sanitizeString(value, detections) as T;
  }

  if (Array.isArray(value)) {
    return value.map(item =>
      sanitizeUnknown(item, detections)
    ) as T;
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(
      value as Record<string, unknown>
    )) {
      if (
        key === 'originalValue' &&
        typeof child === 'string' &&
        child.length > 0
      ) {
        const matchingDetection = detections.find(
          detection => detection.originalValue === child
        );

        result[key] = matchingDetection
          ? getPlaceholderForDetection(matchingDetection)
          : sanitizeString(child, detections);

        continue;
      }

      result[key] = sanitizeUnknown(child, detections);
    }

    return result as T;
  }

  return value;
}

/**
 * Creates metadata for visual elements.
 * Attribute strings and detection metadata are sanitized before this runs.
 */
function buildVisualRegionMetadata(
  domElements: DOMElementMetadata[],
  _redactionMethod: RedactionMethod = 'solid'
): VisualRegionMetadata[] {
  const visualElements = domElements.filter(element => {
    const tagName = element.tagName.toLowerCase();

    return (
      element.isVisible &&
      ['img', 'canvas', 'video', 'svg'].includes(tagName)
    );
  });

  return visualElements.map(element => {
    const piiDetections = element.piiDetections ?? [];

    const requiresVisionModel = piiDetections.some(
      detection => detection.source === 'layer3_visual'
    );

    let description = `${element.tagName.toLowerCase()} element`;

    const alt = element.attributes?.['alt'];

    if (alt) {
      description += ` with alt="${alt}"`;
    }

    const src = element.attributes?.['src'];

    if (src) {
      description += ` src="${src.substring(0, 50)}"`;
    }

    return {
      boundingBox: element.boundingBox,
      description,
      piiDetections,
      requiresVisionModel,
    };
  });
}

/**
 * Builds a sanitized DOM context.
 *
 * Visible elements are retained. Detected PII is redacted from strings,
 * attributes, and nested metadata before the context is returned.
 */
export function buildSanitizedContext(
  domElements: DOMElementMetadata[],
  url: string,
  _title: string = document.title,
  redactionMethod: RedactionMethod = 'solid'
): SanitizedContext {
  const timestamp = Date.now();
  const urlOrigin = getOrigin(url);

  const sanitizedElements: DOMElementMetadata[] = domElements
    .filter(element => element.isVisible)
    .map(element => {
      const detections = element.piiDetections ?? [];

      // Recursively sanitize the element's string fields.
      const recursivelySanitized = sanitizeUnknown(
        element,
        detections
      ) as DOMElementMetadata;

      // Sanitize text explicitly.
      const sanitizedTextContent = element.textContent
        ? sanitizeString(element.textContent, detections)
        : element.textContent;

      // Sanitize every captured attribute.
      const sanitizedAttributes = Object.fromEntries(
        Object.entries(element.attributes ?? {}).map(
          ([key, value]) => [
            key,
            typeof value === 'string'
              ? sanitizeString(value, detections)
              : value,
          ]
        )
      );

      // Never preserve a detected raw value in detection metadata.
      const sanitizedDetections = detections.map(detection => sanitizeUnknown(detection, detections) as PIIDetection
);
      return {
        ...recursivelySanitized,
        textContent: sanitizedTextContent,
        attributes: sanitizedAttributes,
        piiDetections: sanitizedDetections,
      };
    });

  const visualRegions = buildVisualRegionMetadata(
    sanitizedElements,
    redactionMethod
  );

  const metadata: SanitizedContext['metadata'] = {
    url: urlOrigin,
    timestamp,
    domElements: sanitizedElements,
  };

  if (visualRegions.length > 0) {
    metadata.visualRegions = visualRegions;
  }

  const redactions: SanitizedContext['redactions'] = [
    ...sanitizedElements
      .filter(element => element.piiDetections.length > 0)
      .flatMap(element =>
        element.piiDetections.map(detection => ({
          type: 'placeholder' as const,
          target: detection,
          replacement: getPlaceholderForDetection(detection),
        }))
      ),

    ...visualRegions
      .filter(region => region.piiDetections.length > 0)
      .flatMap(region =>
        region.piiDetections.map(detection => ({
          type:
            redactionMethod === 'solid'
              ? ('mask' as const)
              : (redactionMethod as
                  | 'mask'
                  | 'blur'
                  | 'placeholder'
                  | 'exclude'),
          target: detection,
          replacement: getPlaceholderForDetection(detection),
        }))
      ),
  ];

  return {
    metadata,
    redactions,
  };
}

/**
 * Builds a compact, structured representation for downstream reasoning.
 */
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
    .filter(element => element.isVisible)
    .map((element, index) => {
      const sensitive = isElementSensitive(element);
      const detections = element.piiDetections ?? [];

      // Sanitize labels even when no detection was attached to the element.
      let label = getLabelFromElement(element, sensitive);

      label = sanitizeString(label, detections);

      return {
        id: generateElementId(element, index),
        role: getRoleFromElement(element),
        label,
        sensitive,
        bbox: element.boundingBox,
      };
    });

  return {
    page: {
      url_origin: urlOrigin,
      title: sanitizeString(_title, []),
      viewport,
    },
    elements,
  };
}

/**
 * Checks the complete serialized context.
 *
 * Returns false when common PII patterns or detected original values remain.
 * This validator is a defense-in-depth check, not a guarantee that all PII
 * can be identified.
 */
export function validateSanitizedContext(
  context: SanitizedContext
): boolean {
  try {
    const serialized = JSON.stringify(context);

    if (!serialized) {
      return false;
    }

    const exposedValues: string[] = [];

    for (const element of context.metadata.domElements) {
      if (typeof element.textContent === 'string') {
        exposedValues.push(element.textContent);
      }

      for (const value of Object.values(element.attributes ?? {})) {
        if (typeof value === 'string') {
          exposedValues.push(value);
        }
      }
    }

    const exposedPayload = [context.metadata.url, ...exposedValues].join(' ');

    // Common email and phone patterns must not remain in the user-facing payload.
    const emailPattern =
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

    const phonePattern =
  /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)[\s.-]|\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/;

    if (emailPattern.test(exposedPayload)) {
      return false;
    }

    if (phonePattern.test(exposedPayload)) {
      return false;
    }

    // Check that detected original values were replaced in user-visible text
    // and attributes. We intentionally ignore detection metadata because it may
    // keep the original value for auditing while the exposed payload must not.
    for (const element of context.metadata.domElements) {
      for (const detection of element.piiDetections ?? []) {
        const originalValue = detection.originalValue;

        if (
          typeof originalValue === 'string' &&
          originalValue.length > 0 &&
          originalValue !== getPlaceholderForDetection(detection) &&
          exposedValues.some(value => value.includes(originalValue))
        ) {
          return false;
        }
      }
    }

    // Reject password fields if their contents are still exposed.
    for (const element of context.metadata.domElements) {
      const hasPasswordDetection = (
        element.piiDetections ?? []
      ).some(detection => detection.type === 'password');

      if (
        hasPasswordDetection &&
        element.textContent &&
        !element.textContent.includes('[PASSWORD]')
      ) {
        return false;
      }

      const inputType = element.attributes?.['type']?.toLowerCase();

      if (inputType === 'password') {
        const value = element.attributes?.['value'];

        if (value && !value.includes('[PASSWORD]')) {
          return false;
        }
      }
    }

    return true;
  } catch {
    // Fail closed if serialization or validation throws.
    return false;
  }
}