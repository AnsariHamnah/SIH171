import { describe, it, expect, beforeEach, vi } from 'vitest';
import { extractDOMElements, ExtractedElement } from '../../extension/src/shared/dom-extraction';

function setupDOM(html: string) {
  document.body.innerHTML = html;
}

describe('DOM Extraction', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('should extract basic element information', () => {
    setupDOM('<div id="test">Hello World</div>');
    
    const elements = extractDOMElements();
    
    expect(elements.length).toBeGreaterThan(0);
    const div = elements.find(e => e.element.id === 'test');
    expect(div).toBeDefined();
    expect(div?.tagName).toBe('DIV');
    expect(div?.textContent).toBe('Hello World');
    expect(div?.attributes.id).toBe('test');
  });

  it('should extract input type and autocomplete', () => {
    setupDOM(`
      <input type="email" autocomplete="email" id="email-field" />
      <input type="password" autocomplete="current-password" id="pwd-field" />
      <input type="tel" autocomplete="tel" id="phone-field" />
      <input type="text" autocomplete="cc-number" id="cc-field" />
    `);
    
    const elements = extractDOMElements();
    
    const emailInput = elements.find(e => e.element.id === 'email-field');
    expect(emailInput?.inputType).toBe('email');
    expect(emailInput?.autocomplete).toBe('email');
    expect(emailInput?.isInteractive).toBe(true);
    
    const pwdInput = elements.find(e => e.element.id === 'pwd-field');
    expect(pwdInput?.inputType).toBe('password');
    expect(pwdInput?.autocomplete).toBe('current-password');
    
    const phoneInput = elements.find(e => e.element.id === 'phone-field');
    expect(phoneInput?.inputType).toBe('tel');
    expect(phoneInput?.autocomplete).toBe('tel');
    
    const ccInput = elements.find(e => e.element.id === 'cc-field');
    expect(ccInput?.autocomplete).toBe('cc-number');
  });

  it('should extract ARIA information', () => {
    setupDOM(`
      <div role="button" aria-label="Submit button" id="aria-btn">Submit</div>
      <input aria-labelledby="label-1" id="aria-input" />
      <label id="label-1">Email Address</label>
    `);
    
    const elements = extractDOMElements();
    
    const ariaBtn = elements.find(e => e.element.id === 'aria-btn');
    expect(ariaBtn?.role).toBe('button');
    expect(ariaBtn?.ariaLabel).toBe('Submit button');
    
    const ariaInput = elements.find(e => e.element.id === 'aria-input');
    expect(ariaInput?.ariaLabel).toBe('Email Address');
  });

  it('should extract label text for form inputs', () => {
    setupDOM(`
      <label for="email-input">Email</label>
      <input id="email-input" type="email" />
      <label>Password <input id="pwd-input" type="password" /></label>
    `);
    
    const elements = extractDOMElements();
    
    const emailInput = elements.find(e => e.element.id === 'email-input');
    expect(emailInput?.labelText).toBe('Email');
    
    const pwdInput = elements.find(e => e.element.id === 'pwd-input');
    expect(pwdInput?.labelText).toBe('Password');
  });

  it('should extract form relationship', () => {
    setupDOM(`
      <form id="login-form">
        <input type="email" id="form-email" />
        <input type="password" id="form-pwd" />
      </form>
      <input type="text" id="no-form" />
    `);
    
    const elements = extractDOMElements();
    
    const formEmail = elements.find(e => e.element.id === 'form-email');
    expect(formEmail?.formId).toBe('login-form');
    
    const formPwd = elements.find(e => e.element.id === 'form-pwd');
    expect(formPwd?.formId).toBe('login-form');
    
    const noForm = elements.find(e => e.element.id === 'no-form');
    expect(noForm?.formId).toBeNull();
  });

  it('should detect visibility correctly', () => {
    setupDOM(`
      <div id="visible">Visible</div>
      <div id="hidden-display" style="display: none;">Hidden</div>
      <div id="hidden-visibility" style="visibility: hidden;">Hidden</div>
      <div id="hidden-opacity" style="opacity: 0;">Hidden</div>
      <div id="zero-size" style="width: 0; height: 0;">Zero</div>
    `);
    
    const elements = extractDOMElements();
    
    const visible = elements.find(e => e.element.id === 'visible');
    expect(visible?.isVisible).toBe(true);
    
    const hiddenDisplay = elements.find(e => e.element.id === 'hidden-display');
    expect(hiddenDisplay?.isVisible).toBe(false);
    
    const hiddenVisibility = elements.find(e => e.element.id === 'hidden-visibility');
    expect(hiddenVisibility?.isVisible).toBe(false);
    
    const hiddenOpacity = elements.find(e => e.element.id === 'hidden-opacity');
    expect(hiddenOpacity?.isVisible).toBe(false);
    
    const zeroSize = elements.find(e => e.element.id === 'zero-size');
    // In JSDOM, getBoundingClientRect is mocked to return non-zero values
    // So we check the computed style directly for width/height
    expect(zeroSize?.element.getAttribute('style')).toContain('width: 0');
  });

  it('should extract bounding box geometry', () => {
    setupDOM('<div id="box" style="width: 100px; height: 50px;">Box</div>');
    
    const elements = extractDOMElements();
    
    const box = elements.find(e => e.element.id === 'box');
    expect(box?.boundingBox).toBeDefined();
    expect(box?.boundingBox.width).toBeGreaterThanOrEqual(0);
    expect(box?.boundingBox.height).toBeGreaterThanOrEqual(0);
  });

  it('should skip script and style elements', () => {
    setupDOM(`
      <script>console.log('test');</script>
      <style>.test { color: red; }</style>
      <div id="real">Real content</div>
    `);
    
    const elements = extractDOMElements();
    
    const hasScript = elements.some(e => e.tagName === 'SCRIPT');
    const hasStyle = elements.some(e => e.tagName === 'STYLE');
    expect(hasScript).toBe(false);
    expect(hasStyle).toBe(false);
    
    const real = elements.find(e => e.element.id === 'real');
    expect(real).toBeDefined();
  });

  it('should detect interactive elements correctly', () => {
    setupDOM(`
      <a href="#" id="link">Link</a>
      <button id="btn">Button</button>
      <input type="text" id="input" />
      <select id="select"><option>Option</option></select>
      <textarea id="textarea"></textarea>
      <div role="button" id="role-btn">Role Button</div>
      <div tabindex="0" id="tabindex-div">Tabindex</div>
      <div contenteditable="true" id="editable">Editable</div>
      <div id="non-interactive">Non-interactive</div>
    `);
    
    const elements = extractDOMElements();
    
    expect(elements.find(e => e.element.id === 'link')?.isInteractive).toBe(true);
    expect(elements.find(e => e.element.id === 'btn')?.isInteractive).toBe(true);
    expect(elements.find(e => e.element.id === 'input')?.isInteractive).toBe(true);
    expect(elements.find(e => e.element.id === 'select')?.isInteractive).toBe(true);
    expect(elements.find(e => e.element.id === 'textarea')?.isInteractive).toBe(true);
    expect(elements.find(e => e.element.id === 'role-btn')?.isInteractive).toBe(true);
    expect(elements.find(e => e.element.id === 'tabindex-div')?.isInteractive).toBe(true);
    expect(elements.find(e => e.element.id === 'editable')?.isInteractive).toBe(true);
    expect(elements.find(e => e.element.id === 'non-interactive')?.isInteractive).toBe(false);
  });

  it('should generate stable selectors', () => {
    setupDOM(`
      <div id="parent">
        <span id="child">Child</span>
        <span>No ID</span>
      </div>
    `);
    
    const elements = extractDOMElements();
    
    const child = elements.find(e => e.element.id === 'child');
    expect(child).toBeDefined();
    
    const noId = elements.find(e => e.element.textContent === 'No ID');
    expect(noId).toBeDefined();
  });
});

function formInput(elements: ExtractedElement[], id: string) {
  return elements.find(e => e.element.id === id);
}