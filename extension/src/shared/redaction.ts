import type { PIIDetection } from './types';

export const PII_TYPE_TO_PLACEHOLDER: Record<PIIDetection['type'], string> = {
  email: '[EMAIL]',
  phone: '[PHONE]',
  password: '[PASSWORD]',
  credit_card: '[CREDIT_CARD]',
  ssn: '[SSN]',
  address: '[ADDRESS]',
  name: '[NAME]',
  face: '[FACE]',
  unknown: '[REDACTED]',
};

export function getPlaceholderForDetection(detection: PIIDetection): string {
  return PII_TYPE_TO_PLACEHOLDER[detection.type] || '[REDACTED]';
}

export interface RedactionResult {
  sanitizedText: string;
  redactions: RedactionInfo[];
}

export interface RedactionInfo {
  type: PIIDetection['type'];
  originalValue: string;
  replacement: string;
  textOffset: { start: number; end: number };
}

function sortDetectionsByOffset(detections: PIIDetection[]): PIIDetection[] {
  return [...detections].sort((a, b) => {
    const aStart = a.location.textOffset?.start ?? 0;
    const bStart = b.location.textOffset?.start ?? 0;
    return aStart - bStart;
  });
}

function hasOverlap(a: PIIDetection, b: PIIDetection): boolean {
  const aStart = a.location.textOffset?.start ?? 0;
  const aEnd = a.location.textOffset?.end ?? 0;
  const bStart = b.location.textOffset?.start ?? 0;
  const bEnd = b.location.textOffset?.end ?? 0;
  return aStart < bEnd && bStart < aEnd;
}

export function applyRedactions(text: string, detections: PIIDetection[]): RedactionResult {
  if (!text || detections.length === 0) {
    return { sanitizedText: text, redactions: [] };
  }

  const sortedDetections = sortDetectionsByOffset(detections);
  
  const nonOverlapping: PIIDetection[] = [];
  for (const detection of sortedDetections) {
    const hasOverlapWithExisting = nonOverlapping.some(existing => hasOverlap(existing, detection));
    if (!hasOverlapWithExisting) {
      nonOverlapping.push(detection);
    }
  }

  // Process from end to start (descending order) so earlier replacements don't affect later indices
  const descendingDetections = [...nonOverlapping].sort((a, b) => {
    const aStart = a.location.textOffset?.start ?? 0;
    const bStart = b.location.textOffset?.start ?? 0;
    return bStart - aStart;
  });

  let sanitizedText = text;
  const redactionInfos: RedactionInfo[] = [];

  for (const detection of descendingDetections) {
    const start = detection.location.textOffset?.start ?? 0;
    const end = detection.location.textOffset?.end ?? 0;
    const originalValue = detection.originalValue || text.slice(start, end);
    const replacement = getPlaceholderForDetection(detection);

    sanitizedText = sanitizedText.slice(0, start) + replacement + sanitizedText.slice(end);

    redactionInfos.push({
      type: detection.type,
      originalValue,
      replacement,
      textOffset: { start, end: start + replacement.length },
    });
  }

  // Reverse to maintain original order in redactionInfos
  redactionInfos.reverse();

  return { sanitizedText, redactions: redactionInfos };
}

export function buildRedactionActions(detections: PIIDetection[]): Array<{ type: 'placeholder'; target: PIIDetection; replacement: string }> {
  return detections.map(detection => ({
    type: 'placeholder' as const,
    target: detection,
    replacement: getPlaceholderForDetection(detection),
  }));
}