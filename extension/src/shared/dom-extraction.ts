import type { DOMElementMetadata, PIIDetection } from './types';

export interface ExtractedElement {
  element: Element;
  tagName: string;
  attributes: Record<string, string>;
  boundingBox: { x: number; y: number; width: number; height: number };
  textContent: string | null;
  isInteractive: boolean;
  role: string | null;
  ariaLabel: string | null;
  inputType: string | null;
  autocomplete: string | null;
  formId: string | null;
  labelText: string | null;
  isVisible: boolean;
  isInViewport: boolean;
}

function getAttributes(element: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attributes = element.attributes;
  for (let i = 0; i < attributes.length; i++) {
    const attr = attributes[i];
    attrs[attr.name] = attr.value;
  }
  return attrs;
}

function getBoundingBox(element: Element): { x: number; y: number; width: number; height: number } {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

function isElementVisible(element: Element): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return false;
  }
  if (isElementOffScreen(element, rect)) {
    return false;
  }
  return true;
}

function isElementOffScreen(element: Element, rect: DOMRect): boolean {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  
  const style = window.getComputedStyle(element);
  const position = style.position;
  const transform = style.transform;
  
  if (position === 'absolute' || position === 'fixed') {
    const left = parseFloat(style.left) || 0;
    const top = parseFloat(style.top) || 0;
    
    const largeNegativeLeft = left < -viewportWidth;
    const largeNegativeTop = top < -viewportHeight;
    const largePositiveLeft = left > viewportWidth * 2;
    const largePositiveTop = top > viewportHeight * 2;
    
    if (largeNegativeLeft || largeNegativeTop || largePositiveLeft || largePositiveTop) {
      return true;
    }
  }
  
  if (transform && transform !== 'none') {
    const translateMatch = transform.match(/translate\(?\s*(-?\d+(?:\.\d+)?)px?\s*,\s*(-?\d+(?:\.\d+)?)px?\s*\)?/);
    if (translateMatch) {
      const tx = parseFloat(translateMatch[1]);
      const ty = parseFloat(translateMatch[2]);
      if (Math.abs(tx) > viewportWidth * 2 || Math.abs(ty) > viewportHeight * 2) {
        return true;
      }
    }
  }
  
  const isOffScreenLeft = rect.right <= 0;
  const isOffScreenRight = rect.left >= viewportWidth;
  const isOffScreenTop = rect.bottom <= 0;
  const isOffScreenBottom = rect.top >= viewportHeight;
  
  return isOffScreenLeft || isOffScreenRight || isOffScreenTop || isOffScreenBottom;
}

function isElementInViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

function isInteractiveElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', 'option', 'optgroup'];
  if (interactiveTags.includes(tagName)) {
    return true;
  }
  const role = element.getAttribute('role');
  const interactiveRoles = ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'slider', 'spinbutton', 'textbox', 'searchbox', 'combobox', 'listbox', 'option', 'menuitemcheckbox', 'menuitemradio'];
  if (role && interactiveRoles.includes(role)) {
    return true;
  }
  if (element.hasAttribute('tabindex') && element.getAttribute('tabindex') !== '-1') {
    return true;
  }
  if (element.hasAttribute('contenteditable') && element.getAttribute('contenteditable') !== 'false') {
    return true;
  }
  return false;
}

function getRole(element: Element): string | null {
  const role = element.getAttribute('role');
  if (role) return role;
  const tagName = element.tagName.toLowerCase();
  const implicitRoles: Record<string, string> = {
    'a': 'link',
    'button': 'button',
    'input': 'textbox',
    'select': 'combobox',
    'textarea': 'textbox',
    'img': 'img',
    'h1': 'heading',
    'h2': 'heading',
    'h3': 'heading',
    'h4': 'heading',
    'h5': 'heading',
    'h6': 'heading',
    'form': 'form',
    'nav': 'navigation',
    'main': 'main',
    'article': 'article',
    'section': 'region',
    'aside': 'complementary',
    'header': 'banner',
    'footer': 'contentinfo',
  };
  return implicitRoles[tagName] || null;
}

function getAriaLabel(element: Element): string | null {
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;
  const ariaLabelledBy = element.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const labelElement = document.getElementById(ariaLabelledBy);
    if (labelElement) return labelElement.textContent?.trim() || null;
  }
  return null;
}

function getInputType(element: Element): string | null {
  if (element.tagName.toLowerCase() === 'input') {
    return element.getAttribute('type') || 'text';
  }
  return null;
}

function getAutocomplete(element: Element): string | null {
  return element.getAttribute('autocomplete');
}

function getFormId(element: Element): string | null {
  const form = (element as HTMLFormElement).form;
  if (form) return form.id || '';
  return null;
}

function getLabelText(element: Element): string | null {
  if (element.tagName.toLowerCase() === 'input' || element.tagName.toLowerCase() === 'textarea' || element.tagName.toLowerCase() === 'select') {
    const input = element as HTMLInputElement;
    if (input.labels && input.labels.length > 0) {
      return input.labels[0].textContent?.trim() || null;
    }
    const id = element.id;
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label) return label.textContent?.trim() || null;
    }
  }
  return null;
}

function getTextContent(element: Element): string | null {
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return (element as HTMLInputElement).value;
  }
  return element.textContent?.trim() || null;
}

export function extractDOMElements(): ExtractedElement[] {
  const elements: ExtractedElement[] = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    null
  );

  let node: Node | null = walker.nextNode();
  while (node) {
    const element = node as Element;
    const tagName = element.tagName.toLowerCase();
    
    const skipTags = ['script', 'style', 'noscript', 'meta', 'link', 'head', 'title'];
    if (skipTags.includes(tagName)) {
      node = walker.nextNode();
      continue;
    }

    const extracted: ExtractedElement = {
      element,
      tagName: element.tagName,
      attributes: getAttributes(element),
      boundingBox: getBoundingBox(element),
      textContent: getTextContent(element),
      isInteractive: isInteractiveElement(element),
      role: getRole(element),
      ariaLabel: getAriaLabel(element),
      inputType: getInputType(element),
      autocomplete: getAutocomplete(element),
      formId: getFormId(element),
      labelText: getLabelText(element),
      isVisible: isElementVisible(element),
      isInViewport: isElementInViewport(element),
    };

    elements.push(extracted);
    node = walker.nextNode();
  }

  return elements;
}

export function toDOMElementMetadata(extracted: ExtractedElement, piiDetections: PIIDetection[] = []): DOMElementMetadata {
  return {
    tagName: extracted.tagName,
    attributes: extracted.attributes,
    boundingBox: extracted.boundingBox,
    textContent: extracted.textContent || undefined,
    isInteractive: extracted.isInteractive,
    isVisible: extracted.isVisible,
    piiDetections,
    formId: extracted.formId,
  };
}