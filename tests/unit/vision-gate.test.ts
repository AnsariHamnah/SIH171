import { describe, it, expect, beforeEach, vi } from 'vitest';
import { evaluateVisionGate, getVisualRegionsFromElements, VisionGateDecision, VisionGateSignal } from '../../extension/src/shared/vision-gate';
import { extractDOMElements, ExtractedElement } from '../../extension/src/shared/dom-extraction';

function setupDOM(html: string) {
  document.body.innerHTML = html;
}

describe('Vision Gate', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('getVisualRegionsFromElements', () => {
    it('should return empty array for non-visual elements', () => {
      setupDOM(`
        <input type="email" id="email" value="test@example.com" />
        <div id="text">Hello world</div>
        <button id="btn">Click</button>
      `);

      const elements = extractDOMElements();
      const regions = getVisualRegionsFromElements(elements);

      expect(regions.length).toBe(0);
    });

    it('should detect img elements', () => {
      setupDOM(`
        <img id="profile-photo" src="avatar.png" alt="User profile" />
      `);

      const elements = extractDOMElements();
      const regions = getVisualRegionsFromElements(elements);

      expect(regions.length).toBe(1);
      expect(regions[0].type).toBe('image');
      expect(regions[0].element.id).toBe('profile-photo');
    });

    it('should detect canvas elements', () => {
      setupDOM(`
        <canvas id="drawing" width="200" height="200"></canvas>
      `);

      const elements = extractDOMElements();
      const regions = getVisualRegionsFromElements(elements);

      expect(regions.length).toBe(1);
      expect(regions[0].type).toBe('canvas');
    });

    it('should detect video elements', () => {
      setupDOM(`
        <video id="video-player" src="video.mp4"></video>
      `);

      const elements = extractDOMElements();
      const regions = getVisualRegionsFromElements(elements);

      expect(regions.length).toBe(1);
      expect(regions[0].type).toBe('video');
    });

    it('should detect svg elements', () => {
      setupDOM(`
        <svg id="chart" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <rect x="10" y="10" width="80" height="80" fill="#ffdbac"/>
        </svg>
      `);

      const elements = extractDOMElements();
      const regions = getVisualRegionsFromElements(elements);

      expect(regions.length).toBe(1);
      expect(regions[0].type).toBe('svg');
    });

    it('should detect multiple visual elements', () => {
      setupDOM(`
        <img id="img1" src="photo1.png" />
        <canvas id="canvas1" width="100" height="100"></canvas>
        <video id="video1" src="video.mp4"></video>
        <svg id="svg1" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"></svg>
      `);

      const elements = extractDOMElements();
      const regions = getVisualRegionsFromElements(elements);

      expect(regions.length).toBe(4);
      const types = regions.map(r => r.type).sort();
      expect(types).toEqual(['canvas', 'image', 'svg', 'video']);
    });

    it('should skip hidden visual elements', () => {
      setupDOM(`
        <img id="visible-img" src="visible.png" />
        <img id="hidden-img" src="hidden.png" style="display: none;" />
        <canvas id="visible-canvas" width="100" height="100"></canvas>
        <canvas id="hidden-canvas" width="100" height="100" style="visibility: hidden;"></canvas>
      `);

      const elements = extractDOMElements();
      const regions = getVisualRegionsFromElements(elements);

      expect(regions.length).toBe(2);
      const ids = regions.map(r => r.element.id).sort();
      expect(ids).toEqual(['visible-canvas', 'visible-img']);
    });

it('should handle zero-size visual elements (JSDOM limitation: uses natural size)', () => {
    // JSDOM computes bounding box from natural size, not CSS width/height attributes
    // In real browser, width="0" height="0" would result in zero bounding box
    // This test documents the JSDOM limitation
    setupDOM(`
      <img id="normal-img" src="normal.png" width="100" height="100" />
      <img id="zero-img" src="zero.png" width="0" height="0" />
    `);

    const elements = extractDOMElements();
    const regions = getVisualRegionsFromElements(elements);

    // In JSDOM, both images have non-zero bounding boxes (from natural size)
    // In real browser, zero-size would be filtered out
    expect(regions.length).toBe(2); // JSDOM behavior
    const ids = regions.map(r => r.element.id).sort();
    expect(ids).toEqual(['normal-img', 'zero-img']);
  });
  });

  describe('evaluateVisionGate - DOM-only pages (should skip vision)', () => {
    it('should skip vision for standard login form', () => {
      setupDOM(`
        <form>
          <input type="email" id="email" autocomplete="email" value="test@example.com" />
          <input type="password" id="password" autocomplete="current-password" value="secret123" />
          <button type="submit" id="login-btn">Login</button>
        </form>
      `);

      const elements = extractDOMElements();
      const decision = evaluateVisionGate(elements);

      expect(decision.shouldRunVision).toBe(false);
      expect(decision.reason).toBe('no_visual_content_requiring_inspection');
      expect(decision.visualRegionsCount).toBe(0);
      expect(decision.signals.length).toBe(0);
    });

    it('should skip vision for registration form with name, email, phone, address', () => {
      setupDOM(`
        <form>
          <input type="text" id="name" autocomplete="name" value="John Doe" />
          <input type="email" id="email" autocomplete="email" value="john@example.com" />
          <input type="tel" id="phone" autocomplete="tel" value="+1-555-123-4567" />
          <input type="text" id="address" autocomplete="street-address" value="123 Main St" />
          <button type="submit">Register</button>
        </form>
      `);

      const elements = extractDOMElements();
      const decision = evaluateVisionGate(elements);

      expect(decision.shouldRunVision).toBe(false);
      expect(decision.reason).toBe('no_visual_content_requiring_inspection');
      expect(decision.visualRegionsCount).toBe(0);
    });

    it('should skip vision for payment form with credit card fields', () => {
      setupDOM(`
        <form>
          <input type="text" id="card-name" autocomplete="cc-name" value="John Doe" />
          <input type="text" id="card-number" autocomplete="cc-number" value="4242 4242 4242 4242" />
          <input type="text" id="card-exp" autocomplete="cc-exp" value="12/28" />
          <input type="text" id="card-cvc" autocomplete="cc-csc" value="123" />
          <button type="submit">Pay</button>
        </form>
      `);

      const elements = extractDOMElements();
      const decision = evaluateVisionGate(elements);

      expect(decision.shouldRunVision).toBe(false);
      expect(decision.reason).toBe('no_visual_content_requiring_inspection');
    });

    it('should skip vision for text content with regex-detectable PII', () => {
      setupDOM(`
        <div id="contact">Email: test@example.com, Phone: 555-123-4567</div>
        <p id="ssn-text">SSN: 123-45-6789</p>
      `);

      const elements = extractDOMElements();
      const decision = evaluateVisionGate(elements);

      expect(decision.shouldRunVision).toBe(false);
      expect(decision.reason).toBe('no_visual_content_requiring_inspection');
    });
  });

  describe('evaluateVisionGate - Visual content present (should run vision)', () => {
    it('should run vision for img element', () => {
      setupDOM(`
        <img id="photo" src="photo.png" alt="A photo" />
      `);

      const elements = extractDOMElements();
      const decision = evaluateVisionGate(elements);

      expect(decision.shouldRunVision).toBe(true);
      expect(decision.reason).toBe('visual_content_present');
      expect(decision.visualRegionsCount).toBe(1);
      expect(decision.signals.length).toBe(1);
      expect(decision.signals[0].type).toBe('image_element');
    });

    it('should run vision for canvas element', () => {
      setupDOM(`
        <canvas id="drawing" width="200" height="200"></canvas>
      `);

      const elements = extractDOMElements();
      const decision = evaluateVisionGate(elements);

      expect(decision.shouldRunVision).toBe(true);
      expect(decision.reason).toBe('visual_content_present');
      expect(decision.signals[0].type).toBe('canvas_element');
    });

    it('should run vision for video element', () => {
      setupDOM(`
        <video id="player" src="video.mp4"></video>
      `);

      const elements = extractDOMElements();
      const decision = evaluateVisionGate(elements);

      expect(decision.shouldRunVision).toBe(true);
      expect(decision.signals[0].type).toBe('video_element');
    });

    it('should run vision for svg element', () => {
      setupDOM(`
        <svg id="chart" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="40" fill="#ffdbac"/>
        </svg>
      `);

      const elements = extractDOMElements();
      const decision = evaluateVisionGate(elements);

      expect(decision.shouldRunVision).toBe(true);
      expect(decision.signals[0].type).toBe('svg_element');
    });
  });

  describe('evaluateVisionGate - Face/ID/Document keywords (should run vision with pii_indicators)', () => {
    it('should run vision for img with face keyword in alt', () => {
      setupDOM(`
        <img id="avatar" src="avatar.png" alt="User profile face photo" />
      `);

      const elements = extractDOMElements();
      const decision = evaluateVisionGate(elements);

      expect(decision.shouldRunVision).toBe(true);
      expect(decision.reason).toBe('visual_content_with_pii_indicators');
      const faceSignals = decision.signals.filter(s => s.type === 'face_keyword');
      expect(faceSignals.length).toBeGreaterThan(0);
    });

    it('should run vision for img with avatar class', () => {
      setupDOM(`
        <img id="profile-img" src="photo.png" class="avatar" />
      `);

      const elements = extractDOMElements();
      const decision = evaluateVisionGate(elements);

      expect(decision.shouldRunVision).toBe(true);
      expect(decision.reason).toBe('visual_content_with_pii_indicators');
      const faceSignals = decision.signals.filter(s => s.type === 'face_keyword');
      expect(faceSignals.length).toBeGreaterThan(0);
    });

    it('should run vision for SVG with face-like features (id-card)', () => {
      setupDOM(`
        <svg id="id-card-preview" viewBox="0 0 400 250" xmlns="http://www.w3.org/2000/svg">
          <rect x="0" y="0" width="400" height="250" fill="#f0f0f0"/>
          <circle cx="340" cy="125" r="35" fill="#ffdbac"/>
          <circle cx="330" cy="115" r="4" fill="#333"/>
          <circle cx="350" cy="115" r="4" fill="#333"/>
        </svg>
      `);

      const elements = extractDOMElements();
      const decision = evaluateVisionGate(elements);

      expect(decision.shouldRunVision).toBe(true);
      expect(decision.reason).toBe('visual_content_with_pii_indicators');
      const idSignals = decision.signals.filter(s => s.type === 'id_keyword');
      expect(idSignals.length).toBeGreaterThan(0);
    });

    it('should run vision for document upload keywords', () => {
      setupDOM(`
        <img id="doc-preview" src="document.png" class="document-upload" alt="KYC document" />
      `);

      const elements = extractDOMElements();
      const decision = evaluateVisionGate(elements);

      expect(decision.shouldRunVision).toBe(true);
      expect(decision.reason).toBe('visual_content_with_pii_indicators');
      const docSignals = decision.signals.filter(s => s.type === 'document_keyword');
      expect(docSignals.length).toBeGreaterThan(0);
    });
  });

  describe('evaluateVisionGate - Upload controls (should run vision)', () => {
    it('should run vision for file input accepting images', () => {
      setupDOM(`
        <input type="file" id="file-upload" accept="image/*" />
      `);

      const elements = extractDOMElements();
      const decision = evaluateVisionGate(elements);

      expect(decision.shouldRunVision).toBe(true);
      expect(decision.reason).toBe('document_upload_control_present');
      const uploadSignals = decision.signals.filter(s => s.type === 'upload_control');
      expect(uploadSignals.length).toBe(1);
    });

    it('should run vision for file input accepting video', () => {
      setupDOM(`
        <input type="file" id="video-upload" accept="video/*" />
      `);

      const elements = extractDOMElements();
      const decision = evaluateVisionGate(elements);

      expect(decision.shouldRunVision).toBe(true);
      expect(decision.reason).toBe('document_upload_control_present');
    });

    it('should run vision for file input accepting both image and video', () => {
      setupDOM(`
        <input type="file" id="media-upload" accept="image/*,video/*" />
      `);

      const elements = extractDOMElements();
      const decision = evaluateVisionGate(elements);

      expect(decision.shouldRunVision).toBe(true);
      expect(decision.reason).toBe('document_upload_control_present');
    });

    it('should NOT run vision for file input not accepting media', () => {
      setupDOM(`
        <input type="file" id="doc-upload" accept=".pdf,.doc" />
      `);

      const elements = extractDOMElements();
      const decision = evaluateVisionGate(elements);

      expect(decision.shouldRunVision).toBe(false);
      expect(decision.reason).toBe('no_visual_content_requiring_inspection');
    });
  });

  describe('evaluateVisionGate - Mixed DOM PII and visual content', () => {
    it('should run vision when DOM PII and visual content both present', () => {
      setupDOM(`
        <form>
          <input type="email" id="email" value="test@example.com" />
          <input type="password" id="password" value="secret" />
          <img id="profile-photo" src="avatar.png" alt="profile face" />
        </form>
      `);

      const elements = extractDOMElements();
      const decision = evaluateVisionGate(elements);

      expect(decision.shouldRunVision).toBe(true);
      expect(decision.reason).toBe('visual_content_with_pii_indicators');
      expect(decision.visualRegionsCount).toBe(1);
    });
  });

  describe('evaluateVisionGate - Ambiguous cases (privacy-preserving)', () => {
    it('should run vision for ambiguous visual content (privacy-preserving)', () => {
      setupDOM(`
        <img id="ambiguous" src="chart.png" alt="Sales chart" />
      `);

      const elements = extractDOMElements();
      const decision = evaluateVisionGate(elements);

      // Ambiguous visual content should trigger vision (privacy-preserving)
      expect(decision.shouldRunVision).toBe(true);
      expect(decision.reason).toBe('visual_content_present');
    });

    it('should run vision for canvas without clear indicators', () => {
      setupDOM(`
        <canvas id="canvas-generic" width="300" height="200"></canvas>
      `);

      const elements = extractDOMElements();
      const decision = evaluateVisionGate(elements);

      expect(decision.shouldRunVision).toBe(true);
      expect(decision.reason).toBe('visual_content_present');
    });
  });

  describe('VisionGateDecision structure', () => {
    it('should include all required fields', () => {
      setupDOM(`
        <img id="test-img" src="test.png" />
      `);

      const elements = extractDOMElements();
      const decision = evaluateVisionGate(elements);

      expect(decision).toHaveProperty('shouldRunVision');
      expect(decision).toHaveProperty('reason');
      expect(decision).toHaveProperty('signals');
      expect(decision).toHaveProperty('visualRegionsCount');
      expect(decision).toHaveProperty('timestamp');
      expect(typeof decision.timestamp).toBe('number');
      expect(decision.timestamp).toBeGreaterThan(0);
    });

    it('should have deterministic output for same input', () => {
      setupDOM(`
        <img id="test-img" src="test.png" />
      `);

      const elements = extractDOMElements();
      const decision1 = evaluateVisionGate(elements);
      const decision2 = evaluateVisionGate(elements);

      expect(decision1.shouldRunVision).toBe(decision2.shouldRunVision);
      expect(decision1.reason).toBe(decision2.reason);
      expect(decision1.signals.length).toBe(decision2.signals.length);
      expect(decision1.visualRegionsCount).toBe(decision2.visualRegionsCount);
    });

    it('should not make network calls', () => {
      setupDOM(`
        <img id="test-img" src="test.png" />
      `);

      const elements = extractDOMElements();
      
      // Spy on fetch to ensure no network calls
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() => 
        Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
      );

      evaluateVisionGate(elements);

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('should not inspect raw screenshot pixels', () => {
      setupDOM(`
        <img id="test-img" src="test.png" />
        <canvas id="test-canvas" width="100" height="100"></canvas>
      `);

      const elements = extractDOMElements();
      
      // Spy on canvas getContext and getImageData
      const canvas = document.getElementById('test-canvas') as HTMLCanvasElement;
      const getContextSpy = vi.spyOn(canvas, 'getContext');
      const getImageDataSpy = vi.fn();
      getContextSpy.mockReturnValue({ getImageData: getImageDataSpy } as unknown as CanvasRenderingContext2D);

      evaluateVisionGate(elements);

      expect(getContextSpy).not.toHaveBeenCalled();
      expect(getImageDataSpy).not.toHaveBeenCalled();
    });
  });

  describe('Signal structure', () => {
    it('should include all required signal fields', () => {
      setupDOM(`
        <img id="face-photo" src="face.png" alt="face portrait" />
      `);

      const elements = extractDOMElements();
      const decision = evaluateVisionGate(elements);

      expect(decision.signals.length).toBeGreaterThan(0);
      for (const signal of decision.signals) {
        expect(signal).toHaveProperty('type');
        expect(signal).toHaveProperty('elementId');
        expect(signal).toHaveProperty('selector');
        expect(signal).toHaveProperty('details');
        expect(typeof signal.type).toBe('string');
        expect(typeof signal.elementId).toBe('string');
        expect(typeof signal.selector).toBe('string');
        expect(typeof signal.details).toBe('string');
      }
    });
  });
});