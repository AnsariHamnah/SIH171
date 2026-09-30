import { JSDOM } from 'jsdom';
import { vi } from 'vitest';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
});

global.window = dom.window as any;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.Document = dom.window.Document;
global.HTMLInputElement = dom.window.HTMLInputElement;
global.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
global.HTMLSelectElement = dom.window.HTMLSelectElement;
global.HTMLFormElement = dom.window.HTMLFormElement;
global.HTMLLabelElement = dom.window.HTMLLabelElement;

// Mock getComputedStyle to return proper values
const originalGetComputedStyle = dom.window.getComputedStyle;
global.getComputedStyle = (element: Element, pseudoElt?: string | null) => {
  const style = originalGetComputedStyle(element, pseudoElt ?? undefined);
  // Ensure display, visibility, opacity are accessible
  return new Proxy(style, {
    get(target, prop) {
      const value = target[prop as keyof CSSStyleDeclaration];
      if (typeof value === 'function') {
        return value.bind(target);
      }
      return value;
    }
  });
};

// Mock getBoundingClientRect to return non-zero values for visible elements
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function() {
  const rect = originalGetBoundingClientRect.call(this);
  // If all zeros, provide reasonable defaults based on element type
  if (rect.width === 0 && rect.height === 0) {
    const tagName = this.tagName.toLowerCase();
    const isInput = ['input', 'textarea', 'select', 'button'].includes(tagName);
    return {
      x: 0,
      y: 0,
      width: isInput ? 200 : 100,
      height: isInput ? 30 : 20,
      top: 0,
      left: 0,
      bottom: isInput ? 30 : 20,
      right: isInput ? 200 : 100,
      toJSON: () => ({})
    } as DOMRect;
  }
  return rect;
};

// Ensure HTMLInputElement has form property
const originalHTMLInputElement = global.HTMLInputElement;
global.HTMLInputElement = class extends originalHTMLInputElement {
  form: HTMLFormElement | null = null;
} as any;

// Mock window.innerWidth/innerHeight
Object.defineProperty(global.window, 'innerWidth', { value: 1024, writable: true });
Object.defineProperty(global.window, 'innerHeight', { value: 768, writable: true });
Object.defineProperty(global.window.document.documentElement, 'clientWidth', { value: 1024, writable: true });
Object.defineProperty(global.window.document.documentElement, 'clientHeight', { value: 768, writable: true });

// Mock scrollTo for viewport calculations
global.window.scrollTo = vi.fn();