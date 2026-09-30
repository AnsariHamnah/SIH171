import * as fs from 'fs';
import * as path from 'path';
import { JSDOM } from 'jsdom';
import {
  getDataset,
  loadSampleHTML,
} from '../dataset';

import {
  extractDOMElements,
  toDOMElementMetadata,
} from '../../extension/src/shared/dom-extraction';

import {
  runDetectionPipeline,
  groupDetectionsByElement
} from '../../extension/src/shared/detection-pipeline';

import {
  buildSanitizedContext,
  buildStructuredSanitizedContext,
  validateSanitizedContext
} from '../../extension/src/shared/sanitized-context';

import {
  validateAction,
  createValidationContext
} from '../../extension/src/shared/action-validator';

import type { 
  SyntheticSample, 
  ExpectedDetection, 
  ExpectedRedaction,
  ExpectedHiddenElement,
  ExpectedActionOutcome,
  GroundTruthAnnotation,
  ActualDetection,
  SampleEvaluationResult,
  RedactionEvaluationResult,
  SecurityEvaluationResult,
  CategoryEvaluationResult,
  EvaluationSummary,
  FullEvaluationResult,
  PIIType,
  DetectionLayer,
  CapabilityStatus,
} from './types';

import { PII_TYPES, DETECTION_LAYERS } from './types';

import { matchDetections, calculateMetrics, sourceToLayer } from './matcher';
import { evaluateRedaction } from './redaction-evaluator';
import { evaluateSecurity } from './security-evaluator';

const DEFERRED_CAPABILITIES: Record<number, CapabilityStatus> = {
  1: 'implemented',
  2: 'partial',
  3: 'partial',
  4: 'partial',
  5: 'implemented',
  6: 'partial',
};

const DEFERRED_REASONS: Record<number, string> = {
  1: '',
  2: 'Layer 2 regex detection implemented; Layer 3 visual detection requires browser for real model inference (heuristic fallback available in JSDOM)',
  3: 'Canvas/non-DOM content requires Layer 3 vision; real BlazeFace model requires browser environment (WASM + Cache API); heuristic fallback available in JSDOM',
  4: 'Face detection requires Layer 3 real model inference in browser; heuristic fallback available in JSDOM; government_id OCR not implemented (Layer 4 deferred)',
  5: '',
  6: 'Composite pages contain visual content requiring Layer 3; real model inference requires browser environment',
};

function getDeferredStatus(category: number): CapabilityStatus {
  return DEFERRED_CAPABILITIES[category] || 'deferred';
}

function getDeferredReason(category: number): string {
  return DEFERRED_REASONS[category] || 'Capability not implemented';
}

function convertDetectionsToActual(detections: any[]): ActualDetection[] {
  return detections.map(d => ({
    elementId: d.location.selector?.replace('#', '') || 'unknown',
    type: d.type as PIIType,
    source: d.source,
    layer: sourceToLayer(d.source) as DetectionLayer,
    selector: d.location.selector,
    textContent: d.originalValue,
    severity: d.severity,
  }));
}

function runSampleEvaluation(sample: SyntheticSample): {
  sampleResult: SampleEvaluationResult;
  redactionResult: RedactionEvaluationResult;
  securityResult: SecurityEvaluationResult;
} {
  const { metadata, ground_truth, expected_detections, expected_redactions, expected_hidden_elements, expected_action_outcomes } = sample;
  
  const capabilityStatus = getDeferredStatus(metadata.category);
  const deferredReason = capabilityStatus === 'deferred' ? getDeferredReason(metadata.category) : undefined;

  const html = loadSampleHTML(metadata.category, metadata.id.replace(`cat${metadata.category}-`, ''));
  if (!html) {
    throw new Error(`Failed to load HTML for sample ${metadata.id}`);
  }

const dom = new JSDOM(html, { url: metadata.url_origin, pretendToBeVisual: true });
  global.document = dom.window.document;
  global.window = dom.window as any;
  global.HTMLElement = dom.window.HTMLElement;
  global.Element = dom.window.Element;
  global.Node = dom.window.Node;
  global.NodeFilter = dom.window.NodeFilter;
  global.HTMLInputElement = dom.window.HTMLInputElement;
  global.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
  global.HTMLSelectElement = dom.window.HTMLSelectElement;
  global.HTMLFormElement = dom.window.HTMLFormElement;
  global.HTMLLabelElement = dom.window.HTMLLabelElement;

  // Mock getComputedStyle to return proper values
  const originalGetComputedStyle = dom.window.getComputedStyle;
  global.getComputedStyle = (element: Element, pseudoElt?: string | null) => {
    const style = originalGetComputedStyle(element, pseudoElt ?? undefined);
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
  global.window.scrollTo = () => {};

  const extractedElements = extractDOMElements();
  const detectionResult = runDetectionPipeline(extractedElements);
  const detectionsMap = groupDetectionsByElement(extractedElements, detectionResult.detections);
  
  const domElements = extractedElements.map(el => {
    const elementDetections = detectionsMap.get(el.element) || [];
    return toDOMElementMetadata(el, elementDetections);
  });

  const sanitizedContext = buildSanitizedContext(domElements, metadata.url_origin);
  const structuredContext = buildStructuredSanitizedContext(domElements, metadata.url_origin, metadata.title);
  
  const sanitizedValid = validateSanitizedContext(sanitizedContext);
  if (!sanitizedValid) {
    console.warn(`Sample ${metadata.id}: Sanitization validation failed`);
  }

  const actualDetections = convertDetectionsToActual(detectionResult.detections);
  const groundTruth = ground_truth.filter(gt => gt.type !== 'none');

  const { matches, falsePositives } = matchDetections(groundTruth, actualDetections);
  const metrics = calculateMetrics(matches, falsePositives, PII_TYPES, DETECTION_LAYERS);

  const sampleResult: SampleEvaluationResult = {
    sampleId: metadata.id,
    category: metadata.category,
    capabilityStatus,
    matches,
    actualDetections,
    falsePositives,
    precision: metrics.overallPrecision,
    recall: metrics.overallRecall,
    f1: metrics.overallF1,
    perTypeMetrics: metrics.perTypeMetrics,
    perLayerMetrics: metrics.perLayerMetrics,
    deferredReason,
  };

  const redactionResult = evaluateRedaction(
    metadata.id,
    metadata.category,
    expected_redactions,
    sanitizedContext
  );

  const extractedForSecurity = extractedElements.map(el => ({
    id: el.attributes.id || '',
    isVisible: el.isVisible,
    element: el.element,
  }));

  const validationContext = createValidationContext(metadata.url_origin, domElements);
  const validationResults = expected_action_outcomes.map(action => {
    const validAction = {
      action: action.action_type,
      target: action.target_selector,
      reasoning_id: 'eval-reasoning-id',
    };
    const result = validateAction(validAction, validationContext);
    return {
      target: action.target_selector,
      valid: result.valid,
      reason: result.reason,
    };
  });

  const securityResult = evaluateSecurity({
    sampleId: metadata.id,
    category: metadata.category,
    hiddenElements: expected_hidden_elements,
    expectedActionOutcomes: expected_action_outcomes,
    extractedElements: extractedForSecurity,
    validationResults,
  });

  return { sampleResult, redactionResult, securityResult };
}

const categoryNames: Record<number, string> = {
  1: 'Standard HTML Forms (DOM-sufficient)',
  2: 'Mislabeled / Custom-styled Fields',
  3: 'Canvas-rendered / Non-DOM Content',
  4: 'Visual PII (Faces, ID Cards)',
  5: 'Prompt Injection Test Pages',
  6: 'Mixed/Realistic Composite Pages',
};

function aggregateCategoryResults(
  category: number,
  sampleResults: SampleEvaluationResult[],
  redactionResults: RedactionEvaluationResult[],
  securityResults: SecurityEvaluationResult[]
): CategoryEvaluationResult {
  const evaluated = sampleResults.filter(s => s.capabilityStatus === 'implemented' || s.capabilityStatus === 'partial');
  const deferred = sampleResults.filter(s => s.capabilityStatus === 'deferred');

  const evaluatedCount = evaluated.length;
  const deferredCount = deferred.length;

  const aggPrecision = evaluated.length > 0 
    ? evaluated.reduce((sum, s) => sum + s.precision, 0) / evaluated.length 
    : 0;
  const aggRecall = evaluated.length > 0 
    ? evaluated.reduce((sum, s) => sum + s.recall, 0) / evaluated.length 
    : 0;
  const aggF1 = evaluated.length > 0 
    ? evaluated.reduce((sum, s) => sum + s.f1, 0) / evaluated.length 
    : 0;

  const perTypeAggregate: Record<string, { precision: number; recall: number; f1: number }> = {};
  const perLayerAggregate: Record<number, { precision: number; recall: number; f1: number }> = {};

  for (const pt of PII_TYPES) {
    let totalPrecision = 0;
    let totalRecall = 0;
    let totalF1 = 0;
    let count = 0;
    for (const s of evaluated) {
      const m = s.perTypeMetrics[pt];
      if (m && (m.tp + m.fp + m.fn > 0)) {
        totalPrecision += m.precision;
        totalRecall += m.recall;
        totalF1 += m.f1;
        count++;
      }
    }
    perTypeAggregate[pt] = count > 0 
      ? { precision: totalPrecision / count, recall: totalRecall / count, f1: totalF1 / count }
      : { precision: 0, recall: 0, f1: 0 };
  }

  for (const dl of DETECTION_LAYERS) {
    let totalPrecision = 0;
    let totalRecall = 0;
    let totalF1 = 0;
    let count = 0;
    for (const s of evaluated) {
      const m = s.perLayerMetrics[dl];
      if (m && (m.tp + m.fp + m.fn > 0)) {
        totalPrecision += m.precision;
        totalRecall += m.recall;
        totalF1 += m.f1;
        count++;
      }
    }
    perLayerAggregate[dl] = count > 0
      ? { precision: totalPrecision / count, recall: totalRecall / count, f1: totalF1 / count }
      : { precision: 0, recall: 0, f1: 0 };
  }

  const catRedactionResults = redactionResults.filter(r => r.category === category);
  const redactionPrecision = catRedactionResults.length > 0
    ? catRedactionResults.reduce((sum, r) => sum + r.precision, 0) / catRedactionResults.length
    : 1;

  const catSecurityResults = securityResults.filter(s => s.category === category);
  const securityPassRate = catSecurityResults.length > 0
    ? catSecurityResults.filter(s => s.hiddenInjectionsFiltered && s.maliciousActionsRejected && s.rejectedActionsNotExecuted).length / catSecurityResults.length
    : undefined;

  return {
    category,
    categoryName: categoryNames[category] || `Category ${category}`,
    samplesEvaluated: evaluatedCount,
    samplesDeferred: deferredCount,
    aggregatePrecision: aggPrecision,
    aggregateRecall: aggRecall,
    aggregateF1: aggF1,
    perTypeAggregate,
    perLayerAggregate,
    redactionPrecision,
    securityPassRate,
  };
}

export function runFullEvaluation(): FullEvaluationResult {
  const dataset = getDataset();
  const allSampleResults: SampleEvaluationResult[] = [];
  const allRedactionResults: RedactionEvaluationResult[] = [];
  const allSecurityResults: SecurityEvaluationResult[] = [];

  for (const sample of dataset.samples) {
    console.log(`Evaluating sample: ${sample.metadata.id}`);
    try {
      const { sampleResult, redactionResult, securityResult } = runSampleEvaluation(sample);
      allSampleResults.push(sampleResult);
      allRedactionResults.push(redactionResult);
      allSecurityResults.push(securityResult);
    } catch (error) {
      console.error(`Failed to evaluate sample ${sample.metadata.id}:`, error);
    }
  }

  const categoryResults: CategoryEvaluationResult[] = [];
  for (const category of [1, 2, 3, 4, 5, 6]) {
    const catSampleResults = allSampleResults.filter(s => s.category === category);
    const catRedactionResults = allRedactionResults.filter(r => r.category === category);
    const catSecurityResults = allSecurityResults.filter(s => s.category === category);
    
    if (catSampleResults.length > 0) {
      categoryResults.push(aggregateCategoryResults(category, catSampleResults, catRedactionResults, catSecurityResults));
    }
  }

  const evaluatedSamples = allSampleResults.filter(s => s.capabilityStatus !== 'deferred');
  const deferredSamples = allSampleResults.filter(s => s.capabilityStatus === 'deferred');

  const overallPrecision = evaluatedSamples.length > 0
    ? evaluatedSamples.reduce((sum, s) => sum + s.precision, 0) / evaluatedSamples.length
    : 0;
  const overallRecall = evaluatedSamples.length > 0
    ? evaluatedSamples.reduce((sum, s) => sum + s.recall, 0) / evaluatedSamples.length
    : 0;
  const overallF1 = evaluatedSamples.length > 0
    ? evaluatedSamples.reduce((sum, s) => sum + s.f1, 0) / evaluatedSamples.length
    : 0;

  const allRedactionPrecisions = allRedactionResults.map(r => r.precision);
  const overallRedactionPrecision = allRedactionPrecisions.length > 0
    ? allRedactionPrecisions.reduce((sum, p) => sum + p, 0) / allRedactionPrecisions.length
    : 1;

  const summary: EvaluationSummary = {
    datasetVersion: '1.0.0',
    totalSamples: allSampleResults.length + deferredSamples.length,
    totalEvaluated: evaluatedSamples.length,
    totalDeferred: deferredSamples.length,
    overallPrecision,
    overallRecall,
    overallF1,
    overallRedactionPrecision,
    categoryResults,
    timestamp: new Date().toISOString(),
    evaluatorVersion: '1.0.0',
  };

  return {
    summary,
    sampleResults: allSampleResults,
    redactionResults: allRedactionResults,
    securityResults: allSecurityResults,
  };
}

export function writeEvaluationResults(result: FullEvaluationResult, outputDir: string = './evaluation-results') {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const jsonPath = path.join(outputDir, `evaluation-${Date.now()}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  console.log(`Evaluation results written to ${jsonPath}`);

  const summaryPath = path.join(outputDir, `summary-${Date.now()}.txt`);
  const summaryText = generateSummaryText(result);
  fs.writeFileSync(summaryPath, summaryText);
  console.log(`Summary written to ${summaryPath}`);
}

function generateSummaryText(result: FullEvaluationResult): string {
  const { summary } = result;
  const categoryResults = summary.categoryResults;
  
  let text = `SIH 26171 - Phase 9 Evaluation Results\n`;
  text += `========================================\n\n`;
  text += `Dataset Version: ${summary.datasetVersion}\n`;
  text += `Timestamp: ${summary.timestamp}\n`;
  text += `Evaluator Version: ${summary.evaluatorVersion}\n\n`;
  text += `Total Samples: ${summary.totalSamples}\n`;
  text += `Evaluated: ${summary.totalEvaluated}\n`;
  text += `Deferred: ${summary.totalDeferred}\n\n`;
  text += `OVERALL METRICS (DOM-only, implemented capabilities):\n`;
  text += `  PII Precision: ${(summary.overallPrecision * 100).toFixed(2)}%\n`;
  text += `  PII Recall:    ${(summary.overallRecall * 100).toFixed(2)}%\n`;
  text += `  PII F1:        ${(summary.overallF1 * 100).toFixed(2)}%\n`;
  text += `  Redaction Precision: ${(summary.overallRedactionPrecision * 100).toFixed(2)}%\n\n`;
  text += `CATEGORY BREAKDOWN:\n`;
  
  for (const cat of categoryResults) {
    text += `\n  ${cat.categoryName} (Cat ${cat.category}):\n`;
    text += `    Samples Evaluated: ${cat.samplesEvaluated}, Deferred: ${cat.samplesDeferred}\n`;
    text += `    PII Precision: ${(cat.aggregatePrecision * 100).toFixed(2)}%\n`;
    text += `    PII Recall:    ${(cat.aggregateRecall * 100).toFixed(2)}%\n`;
    text += `    PII F1:        ${(cat.aggregateF1 * 100).toFixed(2)}%\n`;
    text += `    Redaction Precision: ${(cat.redactionPrecision * 100).toFixed(2)}%\n`;
    if (cat.securityPassRate !== undefined) {
      text += `    Security Pass Rate: ${(cat.securityPassRate * 100).toFixed(2)}%\n`;
    }
    text += `    Per-Type:\n`;
    for (const pt of PII_TYPES) {
      const m = cat.perTypeAggregate[pt];
      if (m.precision > 0 || m.recall > 0 || m.f1 > 0) {
        text += `      ${pt}: P=${(m.precision*100).toFixed(1)}% R=${(m.recall*100).toFixed(1)}% F1=${(m.f1*100).toFixed(1)}%\n`;
      }
    }
    text += `    Per-Layer:\n`;
    for (const dl of DETECTION_LAYERS) {
      const m = cat.perLayerAggregate[dl];
      if (m.precision > 0 || m.recall > 0 || m.f1 > 0) {
        text += `      Layer ${dl}: P=${(m.precision*100).toFixed(1)}% R=${(m.recall*100).toFixed(1)}% F1=${(m.f1*100).toFixed(1)}%\n`;
      }
    }
  }

  return text;
}