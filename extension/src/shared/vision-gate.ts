import type { ExtractedElement } from './dom-extraction';

export interface VisionGateSignal {
  type: 'image_element' | 'canvas_element' | 'video_element' | 'svg_element' | 'upload_control' | 'face_keyword' | 'id_keyword' | 'document_keyword';
  elementId: string;
  selector: string;
  details: string;
}

export interface VisionGateDecision {
  shouldRunVision: boolean;
  reason: string;
  signals: VisionGateSignal[];
  visualRegionsCount: number;
  timestamp: number;
}

const VISUAL_TAGS = ['img', 'canvas', 'video', 'svg'] as const;

const FACE_KEYWORDS = ['face', 'avatar', 'profile', 'portrait', 'headshot'] as const;
const ID_KEYWORDS = ['id-card', 'idcard', 'passport', 'driver', 'license', 'identity'] as const;
const DOCUMENT_KEYWORDS = ['document', 'document-upload', 'upload-document', 'verify-document', 'kyc'] as const;

const UPLOAD_INPUT_TYPES = ['file'] as const;
const UPLOAD_ACCEPT_PATTERNS = ['image/', 'video/'] as const;

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

function checkForFaceKeywords(element: Element): string[] {
  const src = element.getAttribute('src') || '';
  const alt = element.getAttribute('alt') || '';
  const className = element.className || '';
  const id = element.id || '';
  const allText = `${src} ${alt} ${className} ${id}`.toLowerCase();
  
  const matches: string[] = [];
  for (const keyword of FACE_KEYWORDS) {
    if (allText.includes(keyword)) {
      matches.push(keyword);
    }
  }
  return matches;
}

function checkForIdKeywords(element: Element): string[] {
  const src = element.getAttribute('src') || '';
  const alt = element.getAttribute('alt') || '';
  const className = element.className || '';
  const id = element.id || '';
  const allText = `${src} ${alt} ${className} ${id}`.toLowerCase();
  
  const matches: string[] = [];
  for (const keyword of ID_KEYWORDS) {
    if (allText.includes(keyword)) {
      matches.push(keyword);
    }
  }
  return matches;
}

function checkForDocumentKeywords(element: Element): string[] {
  const src = element.getAttribute('src') || '';
  const alt = element.getAttribute('alt') || '';
  const className = element.className || '';
  const id = element.id || '';
  const allText = `${src} ${alt} ${className} ${id}`.toLowerCase();
  
  const matches: string[] = [];
  for (const keyword of DOCUMENT_KEYWORDS) {
    if (allText.includes(keyword)) {
      matches.push(keyword);
    }
  }
  return matches;
}

function isUploadControl(element: Element): boolean {
  if (element.tagName.toLowerCase() !== 'input') return false;
  const input = element as HTMLInputElement;
  if (!UPLOAD_INPUT_TYPES.includes(input.type as 'file')) return false;
  
  const accept = input.accept || '';
  for (const pattern of UPLOAD_ACCEPT_PATTERNS) {
    if (accept.includes(pattern)) return true;
  }
  return false;
}

function getVisualRegionsFromElements(extractedElements: ExtractedElement[]): { element: Element; boundingBox: { x: number; y: number; width: number; height: number }; type: 'image' | 'canvas' | 'video' | 'svg' }[] {
  const regions: { element: Element; boundingBox: { x: number; y: number; width: number; height: number }; type: 'image' | 'canvas' | 'video' | 'svg' }[] = [];
  
  for (const element of extractedElements) {
    if (!element.isVisible) continue;
    
    const tagName = element.tagName.toLowerCase();
    const boundingBox = element.boundingBox;
    
    if (boundingBox.width === 0 || boundingBox.height === 0) continue;
    
    let type: 'image' | 'canvas' | 'video' | 'svg' | null = null;
    
    if (tagName === 'img') {
      type = 'image';
    } else if (tagName === 'canvas') {
      type = 'canvas';
    } else if (tagName === 'video') {
      type = 'video';
    } else if (tagName === 'svg' || (element.attributes['xmlns'] && element.attributes['xmlns'].includes('svg'))) {
      type = 'svg';
    }
    
    if (type) {
      regions.push({
        element: element.element,
        boundingBox,
        type,
      });
    }
  }
  
  return regions;
}

export function evaluateVisionGate(extractedElements: ExtractedElement[]): VisionGateDecision {
  const signals: VisionGateSignal[] = [];
  const visualRegions = getVisualRegionsFromElements(extractedElements);
  
  for (const region of visualRegions) {
    const selector = generateSelector(region.element);
    const elementId = region.element.id || selector;
    
    signals.push({
      type: `${region.type}_element` as VisionGateSignal['type'],
      elementId,
      selector,
      details: `Visible ${region.type} element at ${selector}`,
    });
    
    const faceKeywords = checkForFaceKeywords(region.element);
    for (const keyword of faceKeywords) {
      signals.push({
        type: 'face_keyword',
        elementId,
        selector,
        details: `Face keyword "${keyword}" found in ${region.type} attributes`,
      });
    }
    
    const idKeywords = checkForIdKeywords(region.element);
    for (const keyword of idKeywords) {
      signals.push({
        type: 'id_keyword',
        elementId,
        selector,
        details: `ID keyword "${keyword}" found in ${region.type} attributes`,
      });
    }
    
    const documentKeywords = checkForDocumentKeywords(region.element);
    for (const keyword of documentKeywords) {
      signals.push({
        type: 'document_keyword',
        elementId,
        selector,
        details: `Document keyword "${keyword}" found in ${region.type} attributes`,
      });
    }
  }
  
  for (const element of extractedElements) {
    if (!element.isVisible) continue;
    if (isUploadControl(element.element)) {
      const selector = generateSelector(element.element);
      const elementId = element.element.id || selector;
      signals.push({
        type: 'upload_control',
        elementId,
        selector,
        details: `File upload control accepting images/video at ${selector}`,
      });
    }
  }
  
  const hasVisualContent = visualRegions.length > 0;
  const hasFaceOrIdSignals = signals.some(s => s.type === 'face_keyword' || s.type === 'id_keyword' || s.type === 'document_keyword');
  const hasUploadControl = signals.some(s => s.type === 'upload_control');
  
  let shouldRunVision = false;
  let reason = 'no_visual_content_requiring_inspection';
  
  if (hasFaceOrIdSignals || hasUploadControl) {
    shouldRunVision = true;
    if (hasFaceOrIdSignals) {
      reason = 'visual_content_with_pii_indicators';
    } else {
      reason = 'document_upload_control_present';
    }
  } else if (hasVisualContent) {
    shouldRunVision = true;
    reason = 'visual_content_present';
  }
  
  return {
    shouldRunVision,
    reason,
    signals,
    visualRegionsCount: visualRegions.length,
    timestamp: Date.now(),
  };
}

export { getVisualRegionsFromElements, generateSelector };
export { VISUAL_TAGS, FACE_KEYWORDS, ID_KEYWORDS, DOCUMENT_KEYWORDS };