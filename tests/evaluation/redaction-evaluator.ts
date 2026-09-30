import type { PIIType, RedactionEvaluationResult, ExpectedRedaction } from './types';

export function evaluateRedaction(
  sampleId: string,
  category: number,
  expectedRedactions: ExpectedRedaction[],
  sanitizedContext: any
): RedactionEvaluationResult {
  let correctRedactions = 0;
  let leakedRedactions = 0;
  const leaks: Array<{
    elementId: string;
    piiType: PIIType;
    expectedPlaceholder: string;
    actualTextContent: string;
  }> = [];

  for (const expected of expectedRedactions) {
    const element = sanitizedContext.metadata?.domElements?.find(
      (el: any) => el.attributes?.id === expected.element_id
    );

    if (!element) {
      leakedRedactions++;
      leaks.push({
        elementId: expected.element_id,
        piiType: expected.pii_type,
        expectedPlaceholder: expected.expected_placeholder,
        actualTextContent: 'ELEMENT_NOT_FOUND',
      });
      continue;
    }

    const actualText = element.textContent || '';
    
    if (actualText === expected.expected_placeholder) {
      correctRedactions++;
    } else if (actualText.includes(expected.original_value)) {
      leakedRedactions++;
      leaks.push({
        elementId: expected.element_id,
        piiType: expected.pii_type,
        expectedPlaceholder: expected.expected_placeholder,
        actualTextContent: actualText,
      });
    } else {
      leakedRedactions++;
      leaks.push({
        elementId: expected.element_id,
        piiType: expected.pii_type,
        expectedPlaceholder: expected.expected_placeholder,
        actualTextContent: actualText,
      });
    }
  }

  const totalExpected = expectedRedactions.length;
  const precision = totalExpected > 0 ? correctRedactions / totalExpected : 1;

  return {
    sampleId,
    category,
    totalExpectedRedactions: totalExpected,
    correctRedactions,
    leakedRedactions,
    precision,
    leaks,
  };
}