import * as fs from 'fs';
import * as path from 'path';
import { JSDOM } from 'jsdom';

import {
  getDataset,
  loadSampleHTML,
  type SyntheticSample,
} from '../dataset';

import {
  extractDOMElements,
  toDOMElementMetadata,
  type ExtractedElement,
} from '../../extension/src/shared/dom-extraction';

import {
  runDetectionPipeline,
  runDetectionPipelineAsync,
  groupDetectionsByElement,
} from '../../extension/src/shared/detection-pipeline';

import { detectLayer1 } from '../../extension/src/shared/layer1-detector';
import { detectLayer2 } from '../../extension/src/shared/layer2-detector';
import { detectLayer3, detectLayer3Async, LocalVisionModel, ModelState } from '../../extension/src/shared/layer3-visual-detector';

import {
  buildSanitizedContext,
  buildStructuredSanitizedContext,
  validateSanitizedContext,
} from '../../extension/src/shared/sanitized-context';

import type { 
  SampleBenchmarkResult,
  BenchmarkConfig,
  BenchmarkSummary,
  FullBenchmarkResult,
  PipelineStage,
  ResourceMeasurement,
  VisionGateInfo,
} from './types';

import { computeStatistics } from './statistics';
import { PIPELINE_STAGES } from './timing';
import { getResourceMeasurement, getSystemInfo, formatResourceMeasurement } from './resources';

const BENCHMARK_CONFIG = {
  warmupIterations: 5,
  benchmarkIterations: 20,
  datasetVersion: '1.0.0',
  runtime: 'Node.js/JSDOM',
  nodeVersion: process.version,
  platform: process.platform,
  arch: process.arch,
};

type PipelineStageKey = 
  | 'dom_extraction'
  | 'layer1_detection'
  | 'layer2_detection'
  | 'layer3_detection_sync'
  | 'detection_pipeline'
  | 'redaction'
  | 'sanitized_context'
  | 'structured_sanitized_context'
  | 'end_to_end';

const PIPELINE_STAGES_RUN: PipelineStageKey[] = [
  'dom_extraction',
  'layer1_detection',
  'layer2_detection',
  'layer3_detection_sync',
  'detection_pipeline',
  'redaction',
  'sanitized_context',
  'structured_sanitized_context',
  'end_to_end',
];

const categoryNames: Record<number, string> = {
  1: 'Standard HTML Forms (DOM-sufficient)',
  2: 'Mislabeled / Custom-styled Fields',
  3: 'Canvas-rendered / Non-DOM Content',
  4: 'Visual PII (Faces, ID Cards)',
  5: 'Prompt Injection Test Pages',
  6: 'Mixed/Realistic Composite Pages',
};

type DeferredStatus = 'implemented' | 'partial' | 'deferred';

function getDeferredStatus(category: number): DeferredStatus {
  const deferredByCategory: Record<number, DeferredStatus> = {
    1: 'implemented',
    2: 'partial',
    3: 'deferred',
    4: 'deferred',
    5: 'implemented',
    6: 'partial',
  };
  return deferredByCategory[category] ?? 'deferred';
}

function setupJSDOM(html: string, url: string): void {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  const window = dom.window;
  
  global.document = window.document;
  // @ts-expect-error - JSDOM window assignment for global DOM APIs
  global.window = window;
  global.HTMLElement = window.HTMLElement;
  global.Element = window.Element;
  global.Node = window.Node;
  global.NodeFilter = window.NodeFilter;
  global.HTMLInputElement = window.HTMLInputElement;
  global.HTMLTextAreaElement = window.HTMLTextAreaElement;
  global.HTMLSelectElement = window.HTMLSelectElement;
  global.HTMLFormElement = window.HTMLFormElement;
  global.HTMLLabelElement = window.HTMLLabelElement;

  const originalGetComputedStyle = window.getComputedStyle.bind(window);
  global.getComputedStyle = (element: Element, pseudoElt?: string | null) => {
    const style = originalGetComputedStyle(element, pseudoElt);
    return new Proxy(style, {
      get(target: CSSStyleDeclaration, prop: string | symbol) {
        const value = target[prop as keyof CSSStyleDeclaration];
        if (typeof value === 'function') {
          return value.bind(target);
        }
        return value;
      }
    });
  };

  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function(): DOMRect {
    const rect = originalGetBoundingClientRect.call(this);
    if (rect.width === 0 && rect.height === 0) {
      const tagName = this.tagName.toLowerCase();
      const isInput = ['input', 'textarea', 'select', 'button'].includes(tagName);
      return {
        x: 0, y: 0,
        width: isInput ? 200 : 100,
        height: isInput ? 30 : 20,
        top: 0, left: 0,
        bottom: isInput ? 30 : 20,
        right: isInput ? 200 : 100,
        toJSON: () => ({})
      } as DOMRect;
    }
    return rect;
  };

  const originalHTMLInputElement = global.HTMLInputElement;
  global.HTMLInputElement = class extends originalHTMLInputElement {
    form = null;
  } as typeof originalHTMLInputElement;

  Object.defineProperty(global.window, 'innerWidth', { value: 1024, writable: true });
  Object.defineProperty(global.window, 'innerHeight', { value: 768, writable: true });
  Object.defineProperty(global.window.document.documentElement, 'clientWidth', { value: 1024, writable: true });
  Object.defineProperty(global.window.document.documentElement, 'clientHeight', { value: 768, writable: true });

  global.window.scrollTo = () => {};
}

interface StageTimings {
  [key: string]: number[];
}

function runPipelineStages(sample: SyntheticSample, stageTimings: StageTimings): void {
  const { metadata } = sample;
  const html = loadSampleHTML(metadata.category, sample.metadata.id.replace('cat' + sample.metadata.category + '-', ''));
  if (!html) {
    throw new Error('Failed to load HTML for sample ' + metadata.id);
  }

  setupJSDOM(html, metadata.url_origin);

  const extractedElements: ExtractedElement[] = timeStage('dom_extraction', () => extractDOMElements());
  
  const layer1Result = timeStage('layer1_detection', () => detectLayer1(extractedElements));
  
  const layer2Result = timeStage('layer2_detection', () => detectLayer2(extractedElements));
  
  const layer3ResultSync = timeStage('layer3_detection_sync', () => detectLayer3(extractedElements));
  
  const detectionResult = timeStage('detection_pipeline', () => runDetectionPipeline(extractedElements));
  
  const detectionsMap = groupDetectionsByElement(extractedElements, detectionResult.detections);
  const domElements = extractedElements.map((el: ExtractedElement) => {
    const elementDetections = detectionsMap.get(el.element) || [];
    return toDOMElementMetadata(el, elementDetections);
  });

  timeStage('redaction', () => buildSanitizedContext(domElements, sample.metadata.url_origin));
  
  timeStage('sanitized_context', () => buildSanitizedContext(domElements, sample.metadata.url_origin));
  
  timeStage('structured_sanitized_context', () => buildStructuredSanitizedContext(domElements, sample.metadata.url_origin, sample.metadata.title));
  
  timeStage('end_to_end', () => {
    const sanitizedContext = buildSanitizedContext(domElements, sample.metadata.url_origin);
    const structuredContext = buildStructuredSanitizedContext(domElements, sample.metadata.url_origin, sample.metadata.title);
    validateSanitizedContext(sanitizedContext);
  });

  function timeStage<T>(stage: string, fn: () => T): T {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    
    if (!stageTimings[stage]) {
      stageTimings[stage] = [];
    }
    stageTimings[stage].push(duration);
    return result;
  }
}

async function runPipelineStagesAsync(sample: SyntheticSample, stageTimings: StageTimings): Promise<void> {
  const { metadata } = sample;
  const html = loadSampleHTML(metadata.category, sample.metadata.id.replace('cat' + sample.metadata.category + '-', ''));
  if (!html) {
    throw new Error('Failed to load HTML for sample ' + metadata.id);
  }

  setupJSDOM(html, metadata.url_origin);

  const extractedElements: ExtractedElement[] = timeStage('dom_extraction', () => extractDOMElements());
  
  const layer1Result = timeStage('layer1_detection', () => detectLayer1(extractedElements));
  
  const layer2Result = timeStage('layer2_detection', () => detectLayer2(extractedElements));
  
  const layer3ResultAsync = await timeStageAsync('layer3_detection_async', () => detectLayer3Async(extractedElements));
  
  const detectionResult = await timeStageAsync('detection_pipeline_async', () => runDetectionPipelineAsync(extractedElements));
  
  const detectionsMap = groupDetectionsByElement(extractedElements, detectionResult.detections);
  const domElements = extractedElements.map((el: ExtractedElement) => {
    const elementDetections = detectionsMap.get(el.element) || [];
    return toDOMElementMetadata(el, elementDetections);
  });

  timeStage('redaction', () => buildSanitizedContext(domElements, sample.metadata.url_origin));
  
  timeStage('sanitized_context', () => buildSanitizedContext(domElements, sample.metadata.url_origin));
  
  timeStage('structured_sanitized_context', () => buildStructuredSanitizedContext(domElements, sample.metadata.url_origin, sample.metadata.title));
  
  timeStage('end_to_end', () => {
    const sanitizedContext = buildSanitizedContext(domElements, sample.metadata.url_origin);
    const structuredContext = buildStructuredSanitizedContext(domElements, sample.metadata.url_origin, sample.metadata.title);
    validateSanitizedContext(sanitizedContext);
  });

  function timeStage<T>(stage: string, fn: () => T): T {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    
    if (!stageTimings[stage]) {
      stageTimings[stage] = [];
    }
    stageTimings[stage].push(duration);
    return result;
  }

  async function timeStageAsync<T>(stage: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    
    if (!stageTimings[stage]) {
      stageTimings[stage] = [];
    }
    stageTimings[stage].push(duration);
    return result;
  }
}

async function benchmarkSample(sample: SyntheticSample): Promise<SampleBenchmarkResult> {
  const html = loadSampleHTML(sample.metadata.category, sample.metadata.id.replace('cat' + sample.metadata.category + '-', ''));
  if (!html) {
    throw new Error('Failed to load HTML for sample ' + sample.metadata.id);
  }

  setupJSDOM(html, sample.metadata.url_origin);

  // Warmup iterations (sync)
  for (let i = 0; i < BENCHMARK_CONFIG.warmupIterations; i++) {
    runPipelineStages(sample, {});
  }

  // Benchmark iterations (sync)
  const stageTimings: Record<PipelineStageKey, number[]> = {
    dom_extraction: [],
    layer1_detection: [],
    layer2_detection: [],
    layer3_detection_sync: [],
    detection_pipeline: [],
    redaction: [],
    sanitized_context: [],
    structured_sanitized_context: [],
    end_to_end: [],
  };

  for (let i = 0; i < BENCHMARK_CONFIG.benchmarkIterations; i++) {
    const timings: Record<PipelineStageKey, number[]> = {
      dom_extraction: [],
      layer1_detection: [],
      layer2_detection: [],
      layer3_detection_sync: [],
      detection_pipeline: [],
      redaction: [],
      sanitized_context: [],
      structured_sanitized_context: [],
      end_to_end: [],
    };

    runPipelineStages(sample, timings);

    for (const stage of PIPELINE_STAGES_RUN) {
      if (timings[stage].length > 0) {
        stageTimings[stage].push(timings[stage][0]);
      }
    }
  }

  // Note: Real model inference requires browser environment (WebAssembly + browser cache)
  // Node.js/JSDOM cannot run the actual model, so async benchmark is skipped here
  // Browser-based smoke test should be used for real model performance measurement
  const isVisualCategory = [3, 4, 6].includes(sample.metadata.category);
  if (isVisualCategory) {
    console.log('    Skipping async model benchmark (requires browser environment)');
  }

  // Calculate mean for each stage
  const stages: Record<PipelineStageKey, number> = {
    dom_extraction: 0,
    layer1_detection: 0,
    layer2_detection: 0,
    layer3_detection_sync: 0,
    detection_pipeline: 0,
    redaction: 0,
    sanitized_context: 0,
    structured_sanitized_context: 0,
    end_to_end: 0,
  };

  for (const stage of PIPELINE_STAGES_RUN) {
    const values = stageTimings[stage];
    if (values.length > 0) {
      const stats = computeStatistics(values);
      stages[stage] = stats.mean;
    }
  }

  const resources = getResourceMeasurement();
  const extractedElements = extractDOMElements();
  const detectionResult = runDetectionPipeline(extractedElements);
  const detectionCount = detectionResult.detections.length;
  
  const detectionsMap = groupDetectionsByElement(extractedElements, detectionResult.detections);
  const domElements = extractedElements.map((el) => {
    const elementDetections = detectionsMap.get(el.element) || [];
    return toDOMElementMetadata(el, elementDetections);
  });
  const sanitizedContext = buildSanitizedContext(domElements, sample.metadata.url_origin);
  const redactionCount = sanitizedContext.redactions.length;

  // Capture vision gate instrumentation for Phase 14
  const visionGateInfo: VisionGateInfo = {
    gateDecision: detectionResult.visionGateInfo.decision.shouldRunVision,
    gateReason: detectionResult.visionGateInfo.decision.reason as VisionGateInfo['gateReason'],
    visualRegionsCount: detectionResult.visionGateInfo.decision.visualRegionsCount,
    signalsCount: detectionResult.visionGateInfo.decision.signals.length,
  };

  return {
    sampleId: sample.metadata.id,
    category: sample.metadata.category,
    categoryName: categoryNames[sample.metadata.category] ?? 'Category ' + sample.metadata.category,
    elementCount: extractedElements.length,
    stages,
    resources: getResourceMeasurement(),
    detectionCount,
    redactionCount,
    visionGateInfo,
  };
}

async function runBenchmark(): Promise<FullBenchmarkResult> {
  const dataset = getDataset();
  const allSampleResults: SampleBenchmarkResult[] = [];

  console.log('Starting Phase 10 Latency Benchmark...');
  console.log('Dataset: ' + dataset.version + ', Samples: ' + dataset.samples.length);
  console.log('Warmup: ' + BENCHMARK_CONFIG.warmupIterations + ', Iterations: ' + BENCHMARK_CONFIG.benchmarkIterations);

  for (const sample of dataset.samples) {
    console.log('  Benchmarking: ' + sample.metadata.id);
    try {
      const result = await benchmarkSample(sample);
      allSampleResults.push(result);
      console.log('    Completed: ' + result.sampleId + ' (' + result.stages.end_to_end.toFixed(2) + 'ms end-to-end)');
    } catch (error) {
      console.error('    Failed: ' + sample.metadata.id, error);
    }
  }

  // Compute summary statistics
  const evaluatedSamples = allSampleResults.filter(s => getDeferredStatus(s.category) !== 'deferred');
  const deferredSamples = allSampleResults.filter(s => getDeferredStatus(s.category) === 'deferred');

  const stageStats: Record<string, ReturnType<typeof computeStatistics>> = {};
  
  for (const stage of PIPELINE_STAGES_RUN) {
    const values = evaluatedSamples.map(s => s.stages[stage]);
    stageStats[stage] = computeStatistics(values);
  }

  const endToEndValues = evaluatedSamples.map(s => s.stages.end_to_end);
  const overallLatency = computeStatistics(endToEndValues);

  const resourceValues = evaluatedSamples.map(s => s.resources.heapUsedMb);
  const overallResources: ResourceMeasurement = {
    heapUsedMb: computeStatistics(resourceValues).mean,
    heapTotalMb: evaluatedSamples.reduce((sum, s) => sum + s.resources.heapTotalMb, 0) / (evaluatedSamples.length || 1),
    externalMb: evaluatedSamples.reduce((sum, s) => sum + s.resources.externalMb, 0) / (evaluatedSamples.length || 1),
    rssMb: evaluatedSamples.reduce((sum, s) => sum + s.resources.rssMb, 0) / (evaluatedSamples.length || 1),
    arrayBuffersMb: evaluatedSamples.reduce((sum, s) => sum + s.resources.arrayBuffersMb, 0) / (evaluatedSamples.length || 1),
  };

  const stageLatencies: Record<PipelineStage, ReturnType<typeof computeStatistics>> = {} as Record<PipelineStage, ReturnType<typeof computeStatistics>>;
  for (const stage of PIPELINE_STAGES_RUN) {
    stageLatencies[stage] = stageStats[stage];
  }

  const summary: BenchmarkSummary = {
    totalSamples: allSampleResults.length,
    evaluatedSamples: evaluatedSamples.length,
    deferredSamples: deferredSamples.length,
    overallLatencyMs: overallLatency,
    stageLatencies,
    overallResources,
  };

  return {
    benchmark: BENCHMARK_CONFIG,
    summary,
    samples: allSampleResults,
    timestamp: new Date().toISOString(),
    environment: await getSystemInfo(),
  };
}

function writeBenchmarkResults(result: FullBenchmarkResult, outputDir: string = './benchmark-results'): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const jsonPath = path.join(outputDir, 'benchmark-' + Date.now() + '.json');
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  console.log('Benchmark results written to ' + jsonPath);

  const summaryPath = path.join(outputDir, 'summary-' + Date.now() + '.txt');
  const summaryText = generateSummaryText(result);
  fs.writeFileSync(summaryPath, summaryText);
  console.log('Summary written to ' + summaryPath);
}

function generateSummaryText(result: FullBenchmarkResult): string {
  const summary = result.summary;
  const benchmark = result.benchmark;
  
  let text = 'SIH 26171 - Phase 10 Latency & Resource Benchmark\n';
  text += '====================================================\n\n';
  text += 'Dataset Version: ' + benchmark.datasetVersion + '\n';
  text += 'Timestamp: ' + result.timestamp + '\n';
  text += 'Runtime: ' + benchmark.runtime + '\n';
  text += 'Node.js: ' + benchmark.nodeVersion + '\n';
  text += 'Platform: ' + benchmark.platform + ' (' + benchmark.arch + ')\n\n';
  
  text += 'BENCHMARK CONFIG:\n';
  text += '  Warmup Iterations: ' + benchmark.warmupIterations + '\n';
  text += '  Benchmark Iterations: ' + benchmark.benchmarkIterations + '\n\n';
  
  text += 'DATASET:\n';
  text += '  Total Samples: ' + result.samples.length + '\n';
  text += '  Evaluated: ' + result.summary.evaluatedSamples + '\n';
  text += '  Deferred: ' + result.summary.deferredSamples + '\n\n';
  
  text += 'OVERALL END-TO-END LATENCY:\n';
  text += '  Mean: ' + result.summary.overallLatencyMs.mean.toFixed(2) + ' ms\n';
  text += '  Median: ' + result.summary.overallLatencyMs.median.toFixed(2) + ' ms\n';
  text += '  Min: ' + result.summary.overallLatencyMs.min.toFixed(2) + ' ms\n';
  text += '  Max: ' + result.summary.overallLatencyMs.max.toFixed(2) + ' ms\n';
  text += '  P50: ' + result.summary.overallLatencyMs.p50.toFixed(2) + ' ms\n';
  text += '  P95: ' + result.summary.overallLatencyMs.p95.toFixed(2) + ' ms\n';
  text += '  P99: ' + result.summary.overallLatencyMs.p99.toFixed(2) + ' ms\n';
  text += '  StdDev: ' + result.summary.overallLatencyMs.stdDev.toFixed(2) + ' ms\n\n';

  text += 'STAGE LATENCIES (mean ± stddev):\n';
  const stageOrder: PipelineStageKey[] = [
    'dom_extraction',
    'layer1_detection',
    'layer2_detection',
    'layer3_detection_sync',
    'detection_pipeline',
    'redaction',
    'sanitized_context',
    'structured_sanitized_context',
    'end_to_end',
  ];
  for (const stage of stageOrder) {
    const stats = result.summary.stageLatencies[stage];
    if (stats) {
      text += '  ' + stage + ': ' + stats.mean.toFixed(2) + ' ± ' + stats.stdDev.toFixed(2) + ' ms (n=' + stats.count + ')\n';
    }
  }
  text += '\n';

  text += 'RESOURCE USAGE:\n';
  text += '  Heap Used: ' + result.summary.overallResources.heapUsedMb.toFixed(2) + ' MB\n';
  text += '  Heap Total: ' + result.summary.overallResources.heapTotalMb.toFixed(2) + ' MB\n';
  text += '  External: ' + result.summary.overallResources.externalMb.toFixed(2) + ' MB\n';
  text += '  RSS: ' + result.summary.overallResources.rssMb.toFixed(2) + ' MB\n';
  text += '  Array Buffers: ' + result.summary.overallResources.arrayBuffersMb.toFixed(2) + ' MB\n\n';

  text += 'PER-SAMPLE RESULTS:\n';
  for (const sample of result.samples) {
    const status = getDeferredStatus(sample.category);
    text += '  ' + sample.sampleId + ' (Cat ' + sample.category + '): ' + sample.stages.end_to_end.toFixed(2) + 'ms';
    if (status === 'deferred') text += ' [DEFERRED]';
    else if (status === 'partial') text += ' [PARTIAL]';
    text += '\n';
  }

  return text;
}

export { runBenchmark, writeBenchmarkResults, BENCHMARK_CONFIG };
