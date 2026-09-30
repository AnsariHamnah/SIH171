import type { ExtractedElement } from './dom-extraction';
import type { PIIDetection } from './types';

export interface Layer2DetectionResult {
  detections: PIIDetection[];
}

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

const PHONE_REGEXES = [
    /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
    /\b\+?[1-9]\d{1,14}\b/g,
];

const CREDIT_CARD_REGEX = /\b(?:\d[ -]*?){13,16}\b/g;

const SSN_REGEX = /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g;

const ADDRESS_REGEXES = [
    /\b\d+\s+[A-Za-z0-9\s.,'-]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|place|pl|way|circle|cir|highway|hwy)\b/gi,
    /\b(?:PO Box|P\.O\. Box)\s+\d+\b/gi,
];

function findMatches(text: string, regex: RegExp): Array<{ start: number; end: number; match: string }> {
    const matches: Array<{ start: number; end: number; match: string }> = [];
    let match: RegExpExecArray | null;
    const globalRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
    while ((match = globalRegex.exec(text)) !== null) {
        matches.push({
            start: match.index,
            end: match.index + match[0].length,
            match: match[0]
        });
        if (!globalRegex.global) break;
    }
    return matches;
}

function isLuhnValid(cardNumber: string): boolean {
    const digits = cardNumber.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return false;
    
    let sum = 0;
    let isEven = false;
    
    for (let i = digits.length - 1; i >= 0; i--) {
        let digit = parseInt(digits[i], 10);
        
        if (isEven) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        
        sum += digit;
        isEven = !isEven;
    }
    
    return sum % 10 === 0;
}

function createDetection(
    type: PIIDetection['type'],
    element: ExtractedElement,
    textOffset: { start: number; end: number },
    matchedText: string,
    reason: string,
    severity: PIIDetection['severity'] = 'medium'
): PIIDetection {
    const selector = generateSelector(element.element);
    return {
        type,
        source: 'layer2_regex',
        confidence: 0.8,
        location: {
            selector,
            boundingBox: element.boundingBox,
            textOffset,
        },
        originalValue: matchedText,
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

export function detectLayer2(extractedElements: ExtractedElement[]): Layer2DetectionResult {
    const detections: PIIDetection[] = [];

    for (const element of extractedElements) {
        if (!element.isVisible) continue;
        
        const text = element.textContent || '';
        if (!text || text.length === 0) continue;

        const emailMatches = findMatches(text, EMAIL_REGEX);
        for (const match of emailMatches) {
            detections.push(createDetection(
                'email',
                element,
                match,
                match.match,
                `Email pattern matched: ${match.match}`,
                'high'
            ));
        }

        for (const phoneRegex of PHONE_REGEXES) {
            const phoneMatches = findMatches(text, phoneRegex);
            for (const match of phoneMatches) {
                detections.push(createDetection(
                    'phone',
                    element,
                    match,
                    match.match,
                    `Phone pattern matched: ${match.match}`,
                    'high'
                ));
            }
        }

        const ccMatches = findMatches(text, CREDIT_CARD_REGEX);
        for (const match of ccMatches) {
            const digitsOnly = match.match.replace(/\D/g, '');
            if (digitsOnly.length >= 13 && digitsOnly.length <= 19 && isLuhnValid(digitsOnly)) {
                detections.push(createDetection(
                    'credit_card',
                    element,
                    match,
                    match.match,
                    `Credit card pattern matched (Luhn valid): ${match.match}`,
                    'critical'
                ));
            }
        }

        const ssnMatches = findMatches(text, SSN_REGEX);
        for (const match of ssnMatches) {
            detections.push(createDetection(
                'ssn',
                element,
                match,
                match.match,
                `SSN pattern matched: ${match.match}`,
                'critical'
            ));
        }

        for (const addressRegex of ADDRESS_REGEXES) {
            const addressMatches = findMatches(text, addressRegex);
            for (const match of addressMatches) {
                detections.push(createDetection(
                    'address',
                    element,
                    match,
                    match.match,
                    `Address pattern matched: ${match.match}`,
                    'medium'
                ));
            }
        }
    }

    return { detections };
}