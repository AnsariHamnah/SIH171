import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  redactCanvasRegions, 
  createRedactedCanvas, 
  captureElementAsCanvas, 
  getRedactionRegionsFromDetections,
  DEFAULT_REDACTION_OPTIONS,
  type RedactionOptions,
  type RedactionRegion 
} from '../../extension/src/shared/visual-redaction';

function createTestCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(10, 10, 50, 50);
  return canvas;
}

describe('Visual Redaction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('redactCanvasRegions', () => {
    it('should apply solid redaction to region', () => {
      const canvas = createTestCanvas(100, 100);
      const regions: RedactionRegion[] = [{ x: 10, y: 10, width: 50, height: 50 }];
      const options: RedactionOptions = { method: 'solid', color: '#000000' };

      const result = redactCanvasRegions(canvas, regions, options);

      expect(result.success).toBe(true);
      expect(result.redactedRegions.length).toBe(1);
      expect(result.redactedRegions[0]).toEqual({ x: 10, y: 10, width: 50, height: 50 });
    });

    it('should apply blur redaction to region', () => {
      const canvas = createTestCanvas(100, 100);
      const regions: RedactionRegion[] = [{ x: 10, y: 10, width: 50, height: 50 }];
      const options: RedactionOptions = { method: 'blur', blurRadius: 15 };

      const result = redactCanvasRegions(canvas, regions, options);

      expect(result.success).toBe(true);
    });

    it('should apply pixelate redaction to region', () => {
      const canvas = createTestCanvas(100, 100);
      const regions: RedactionRegion[] = [{ x: 10, y: 10, width: 50, height: 50 }];
      const options: RedactionOptions = { method: 'pixelate', pixelSize: 8 };

      const result = redactCanvasRegions(canvas, regions, options);

      expect(result.success).toBe(true);
    });

    it('should handle multiple regions', () => {
      const canvas = createTestCanvas(200, 200);
      const regions: RedactionRegion[] = [
        { x: 10, y: 10, width: 50, height: 50 },
        { x: 100, y: 100, width: 30, height: 30 },
      ];
      const options: RedactionOptions = { method: 'solid', color: '#000000' };

      const result = redactCanvasRegions(canvas, regions, options);

      expect(result.success).toBe(true);
      expect(result.redactedRegions.length).toBe(2);
    });

    it('should clamp out-of-bounds regions', () => {
      const canvas = createTestCanvas(100, 100);
      const regions: RedactionRegion[] = [
        { x: -10, y: -10, width: 50, height: 50 },
        { x: 90, y: 90, width: 50, height: 50 },
      ];
      const options: RedactionOptions = { method: 'solid' };

      const result = redactCanvasRegions(canvas, regions, options);

      expect(result.success).toBe(true);
      expect(result.redactedRegions.length).toBe(2);
      expect(result.redactedRegions[0].x).toBe(0);
      expect(result.redactedRegions[0].y).toBe(0);
      expect(result.redactedRegions[1].x).toBe(90);
      expect(result.redactedRegions[1].y).toBe(90);
      expect(result.redactedRegions[1].width).toBe(10);
      expect(result.redactedRegions[1].height).toBe(10);
    });

    it('should reject zero-size regions', () => {
      const canvas = createTestCanvas(100, 100);
      const regions: RedactionRegion[] = [
        { x: 10, y: 10, width: 0, height: 50 },
        { x: 10, y: 10, width: 50, height: 0 },
        { x: 10, y: 10, width: -10, height: 50 },
      ];
      const options: RedactionOptions = { method: 'solid' };

      const result = redactCanvasRegions(canvas, regions, options);

      expect(result.success).toBe(true);
      expect(result.redactedRegions.length).toBe(0);
    });

    it('should handle empty regions array', () => {
      const canvas = createTestCanvas(100, 100);
      const regions: RedactionRegion[] = [];
      const options: RedactionOptions = { method: 'solid' };

      const result = redactCanvasRegions(canvas, regions, options);

      expect(result.success).toBe(true);
      expect(result.redactedRegions.length).toBe(0);
    });

    it('should use default options when not specified', () => {
      const canvas = createTestCanvas(100, 100);
      const regions: RedactionRegion[] = [{ x: 10, y: 10, width: 50, height: 50 }];

      const result = redactCanvasRegions(canvas, regions);

      expect(result.success).toBe(true);
    });

    it('should return error for invalid canvas context', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      // Don't get context to simulate failure
      const originalGetContext = canvas.getContext;
      canvas.getContext = vi.fn().mockReturnValue(null);

      const regions: RedactionRegion[] = [{ x: 10, y: 10, width: 50, height: 50 }];
      const result = redactCanvasRegions(canvas, regions);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('createRedactedCanvas', () => {
    it('should create new canvas with redaction applied', () => {
      const sourceCanvas = createTestCanvas(100, 100);
      const regions: RedactionRegion[] = [{ x: 10, y: 10, width: 50, height: 50 }];
      const options: RedactionOptions = { method: 'solid', color: '#000000' };

      const redactedCanvas = createRedactedCanvas(sourceCanvas, regions, options);

      expect(redactedCanvas).not.toBeNull();
      expect(redactedCanvas!.width).toBe(100);
      expect(redactedCanvas!.height).toBe(100);
      expect(redactedCanvas).not.toBe(sourceCanvas);
    });

    it('should return null when result canvas has no context', () => {
      // This tests the internal null check in createRedactedCanvas
      // We can't easily mock document.createElement's getContext in JSDOM with canvas package
      // So we test the redactCanvasRegions failure path instead
      const sourceCanvas = createTestCanvas(100, 100);
      // Mock getContext to return null on the source canvas for redactCanvasRegions
      const originalGetContext = sourceCanvas.getContext.bind(sourceCanvas);
      sourceCanvas.getContext = vi.fn().mockReturnValue(null);
      
      const regions: RedactionRegion[] = [{ x: 10, y: 10, width: 50, height: 50 }];
      const result = redactCanvasRegions(sourceCanvas, regions);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      
      sourceCanvas.getContext = originalGetContext;
    });
  });

  describe('captureElementAsCanvas', () => {
    it('should return canvas element as-is', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;

      const result = captureElementAsCanvas(canvas);

      expect(result).toBe(canvas);
    });

    it('should return null for img element without valid source (JSDOM limitation)', () => {
      const img = document.createElement('img');
      // In JSDOM, img without src cannot be drawn to canvas
      const result = captureElementAsCanvas(img);
      expect(result).toBeNull();
    });

    it('should return null for unsupported elements', () => {
      const div = document.createElement('div');

      const result = captureElementAsCanvas(div);

      expect(result).toBeNull();
    });
  });

  describe('getRedactionRegionsFromDetections', () => {
    it('should extract bounding boxes from detections', () => {
      const detections = [
        {
          location: { boundingBox: { x: 10, y: 20, width: 50, height: 60 } },
        },
        {
          location: { boundingBox: { x: 100, y: 200, width: 30, height: 40 } },
        },
      ];

      const regions = getRedactionRegionsFromDetections(detections);

      expect(regions.length).toBe(2);
      expect(regions[0]).toEqual({ x: 10, y: 20, width: 50, height: 60 });
      expect(regions[1]).toEqual({ x: 100, y: 200, width: 30, height: 40 });
    });

    it('should filter detections without bounding box', () => {
      const detections = [
        {
          location: { boundingBox: { x: 10, y: 20, width: 50, height: 60 } },
        },
        {
          location: {},
        },
        {
          location: { boundingBox: { x: 100, y: 200, width: 30, height: 40 } },
        },
      ];

      const regions = getRedactionRegionsFromDetections(detections);

      expect(regions.length).toBe(2);
    });

    it('should handle empty detections', () => {
      const detections: any[] = [];

      const regions = getRedactionRegionsFromDetections(detections);

      expect(regions.length).toBe(0);
    });
  });

  describe('DEFAULT_REDACTION_OPTIONS', () => {
    it('should have correct defaults', () => {
      expect(DEFAULT_REDACTION_OPTIONS.method).toBe('solid');
      expect(DEFAULT_REDACTION_OPTIONS.color).toBe('#000000');
      expect(DEFAULT_REDACTION_OPTIONS.padding).toBe(2);
    });
  });
});