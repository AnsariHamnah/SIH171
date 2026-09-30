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
  runStrategy,
  createStrategyConfig,
  type ExperimentStrategy,
  type VisionExecutionMode,
  type StrategyResult,
} from '../../extension/src/shared/experiment-strategy';

import { detectLayer1 } from '../../extension/src/shared/layer1-detector';
import { detectLayer2 } from '../../extension/src/shared/layer2-detector';
import { detectLayer3 } from '../../extension/src/shared/layer3-visual-detector';
import { evaluateVisionGate } from '../../extension/src/shared/vision-gate';
import { buildSanitizedContext, buildStructuredSanitizedContext, validateSanitizedContext } from '../../extension/src/shared/sanitized-context';
import { groupDetectionsByElement } from '../../extension/src/shared/detection-pipeline';

import type { 
  SampleBenchmarkResult,
  BenchmarkConfig,
  BenchmarkSummary,
  FullBenchmarkResult,
  PipelineStage,
  ResourceMeasurement,
  VisionGateInfo,
} from '../benchmark/types';

import { computeStatistics } from '../benchmark/statistics';
import { getResourceMeasurement, getSystemInfo } from '../benchmark/resources';

const EXPERIMENT_CONFIG = {
  warmupIterations: 3,
  benchmarkIterations: 10,
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
  | 'layer3_detection'
  | 'detection_pipeline'
  | 'redaction'
  | 'sanitized_context'
  | 'structured_sanitized_context'
  | 'end_to_end';

const STRATEGIES: ExperimentStrategy[] = ['dom_only', 'unconditional_vision', 'dom_gated_vision'];
const EXECUTION_MODES: VisionExecutionMode[] = ['heuristic_fallback'];

const categoryNames: Record<number, string> = {
  1: 'Standard HTML Forms (DOM-sufficient)',
  2: 'Mislabeled / Custom-styled Fields',
  3: 'Canvas-rendered / Non-DOM Content',
  4: 'Visual PII (Faces, ID Cards)',
  5: 'Prompt Injection Test Pages',
  6: 'Mixed/Realistic Composite Pages',
};

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

interface ExperimentSampleResult {
  sampleId: string;
  category: number;
  categoryName: string;
  strategy: ExperimentStrategy;
  visionExecutionMode: VisionExecutionMode;
  elementCount: number;
  stages: Record<PipelineStageKey, number>;
  resources: ResourceMeasurement;
  detectionCount: number;
  redactionCount: number;
  visionGateInfo?: VisionGateInfo;
  modelInferenceSuccess?: boolean;
  modelInferenceError?: string;
}

async function runStrategyStages(
  sample: SyntheticSample,
  strategy: ExperimentStrategy,
  visionExecutionMode: VisionExecutionMode
): Promise<ExperimentSampleResult> {
  const { metadata } = sample;
  const html = loadSampleHTML(metadata.category, sample.metadata.id.replace('cat' + sample.metadata.category + '-', ''));
  if (!html) {
    throw new Error('Failed to load HTML for sample ' + metadata.id);
  }

  setupJSDOM(html, metadata.url_origin);

  const config = createStrategyConfig(strategy, visionExecutionMode);
  
  const stageTimings: Record<PipelineStageKey, number[]> = {
    dom_extraction: [],
    layer1_detection: [],
    layer2_detection: [],
    layer3_detection: [],
    detection_pipeline: [],
    redaction: [],
    sanitized_context: [],
    structured_sanitized_context: [],
    end_to_end: [],
  };

  for (let i = 0; i < EXPERIMENT_CONFIG.warmupIterations + EXPERIMENT_CONFIG.benchmarkIterations; i++) {
    const isWarmup = i < EXPERIMENT_CONFIG.warmupIterations;
    
    const extractedElements: ExtractedElement[] = timeStage('dom_extraction', () => extractDOMElements());
    
    const layer1Result = timeStage('layer1_detection', () => detectLayer1(extractedElements));
    
    const layer2Result = timeStage('layer2_detection', () => detectLayer2(extractedElements));
    
    const strategyResult = await timeStageAsync('detection_pipeline', async () => {
      return runStrategy(extractedElements, config);
    });

    timeStage('redaction', () => buildSanitizedContext(
      extractedElements.map((el) => toDOMElementMetadata(el, [])),
      sample.metadata.url_origin
    ));
    
    timeStage('sanitized_context', () => buildSanitizedContext(
      extractedElements.map((el) => toDOMElementMetadata(el, [])),
      sample.metadata.url_origin
    ));
    
    timeStage('structured_sanitized_context', () => buildStructuredSanitizedContext(
      extractedElements.map((el) => toDOMElementMetadata(el, [])),
      sample.metadata.url_origin,
      sample.metadata.title
    ));
    
    timeStage('end_to_end', () => {
      const sanitizedContext = buildSanitizedContext(
        extractedElements.map((el) => toDOMElementMetadata(el, [])),
        sample.metadata.url_origin
      );
      const structuredContext = buildStructuredSanitizedContext(
        extractedElements.map((el) => toDOMElementMetadata(el, [])),
        sample.metadata.url_origin,
        sample.metadata.title
      );
      validateSanitizedContext(sanitizedContext);
    });

    if (!isWarmup) {
      for (const stage of Object.keys(stageTimings) as PipelineStageKey[]) {
        if (stageTimings[stage].length > 0) {
          const lastTiming = stageTimings[stage][stageTimings[stage].length - 1];
          stageTimings[stage].push(lastTiming);
        }
      }
    }

    function timeStage<T>(stage: PipelineStageKey, fn: () => T): T {
      const start = performance.now();
      const result = fn();
      const duration = performance.now() - start;
      
      if (!stageTimings[stage]) {
        stageTimings[stage] = [];
      }
      stageTimings[stage].push(duration);
      return result;
    }

    async function timeStageAsync<T>(stage: PipelineStageKey, fn: () => Promise<T>): Promise<T> {
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

  const stages: Record<PipelineStageKey, number> = {
    dom_extraction: 0,
    layer1_detection: 0,
    layer2_detection: 0,
    layer3_detection: 0,
    detection_pipeline: 0,
    redaction: 0,
    sanitized_context: 0,
    structured_sanitized_context: 0,
    end_to_end: 0,
  };

  for (const stage of Object.keys(stages) as PipelineStageKey[]) {
    const values = stageTimings[stage];
    if (values.length > 0) {
      const stats = computeStatistics(values);
      stages[stage] = stats.mean;
    }
  }

  const resources = getResourceMeasurement();
  const extractedElements = extractDOMElements();
  const strategyConfig = createStrategyConfig(strategy, visionExecutionMode);
  const strategyResult = await runStrategy(extractedElements, strategyConfig);
  
  const detectionCount = strategyResult.detections.length;
  
  const detectionsMap = groupDetectionsByElement(extractedElements, strategyResult.detections);
  const domElements = extractedElements.map((el) => {
    const elementDetections = detectionsMap.get(el.element) || [];
    return toDOMElementMetadata(el, elementDetections);
  });
  const sanitizedContext = buildSanitizedContext(domElements, sample.metadata.url_origin);
  const redactionCount = sanitizedContext.redactions.length;

  const gateDecision = evaluateVisionGate(extractedElements);
  const visionGateInfo: VisionGateInfo = {
    gateDecision: gateDecision.shouldRunVision,
    gateReason: gateDecision.reason as VisionGateInfo['gateReason'],
    visualRegionsCount: gateDecision.visualRegionsCount,
    signalsCount: gateDecision.signals.length,
  };

  return {
    sampleId: sample.metadata.id,
    category: sample.metadata.category,
    categoryName: categoryNames[sample.metadata.category] ?? 'Category ' + sample.metadata.category,
    strategy,
    visionExecutionMode,
    elementCount: extractedElements.length,
    stages,
    resources: getResourceMeasurement(),
    detectionCount,
    redactionCount,
    visionGateInfo,
    modelInferenceSuccess: strategyResult.modelInferenceResult?.success,
    modelInferenceError: strategyResult.modelInferenceResult?.error,
  };
}

async function runExperiment(): Promise<{
  experiment: typeof EXPERIMENT_CONFIG;
  summary: {
    totalSamples: number;
    strategyResults: Record<ExperimentStrategy, {
      totalVisionInvocations: number;
      totalVisionSkips: number;
      visionInvocationRate: number;
      avgEndToEndLatency: number;
      avgDetectionCount: number;
      avgRedactionCount: number;
      modelInferenceSuccessRate: number;
    }>;
    perCategoryResults: Record<number, Record<ExperimentStrategy, {
      visionInvocations: number;
      visionSkips: number;
      visionInvocationRate: number;
      avgEndToEndLatency: number;
      avgDetectionCount: number;
    }>>;
  };
  samples: ExperimentSampleResult[];
  timestamp: string;
  environment: Awaited<ReturnType<typeof getSystemInfo>>;
}> {
  const dataset = getDataset();
  const allSampleResults: ExperimentSampleResult[] = [];

  console.log('Starting Phase 14 Experiment: DOM-gated vs Unconditional Vision');
  console.log('Dataset: ' + dataset.version + ', Samples: ' + dataset.samples.length);
  console.log('Strategies: ' + STRATEGIES.join(', '));
  console.log('Execution Modes: ' + EXECUTION_MODES.join(', '));
  console.log('Warmup: ' + EXPERIMENT_CONFIG.warmupIterations + ', Iterations: ' + EXPERIMENT_CONFIG.benchmarkIterations);

  for (const sample of dataset.samples) {
    console.log('  Experimenting: ' + sample.metadata.id);
    
    for (const strategy of STRATEGIES) {
      for (const mode of EXECUTION_MODES) {
        try {
          const result = await runStrategyStages(sample, strategy, mode);
          allSampleResults.push(result);
          console.log('    ' + strategy + ' (' + mode + '): ' + result.stages.end_to_end.toFixed(2) + 'ms, visionInvoked=' + result.visionGateInfo?.gateDecision);
        } catch (error) {
          console.error('    Failed: ' + sample.metadata.id + ' ' + strategy + ' ' + mode, error);
        }
      }
    }
  }

  const strategySummary: Record<ExperimentStrategy, {
    totalVisionInvocations: number;
    totalVisionSkips: number;
    visionInvocationRate: number;
    avgEndToEndLatency: number;
    avgDetectionCount: number;
    avgRedactionCount: number;
    modelInferenceSuccessRate: number;
  }> = {} as Record<ExperimentStrategy, any>;

  for (const strategy of STRATEGIES) {
    const strategyResults = allSampleResults.filter(r => r.strategy === strategy);
    const visionInvocations = strategyResults.filter(r => r.visionGateInfo?.gateDecision === true).length;
    const visionSkips = strategyResults.filter(r => r.visionGateInfo?.gateDecision === false).length;
    
    strategySummary[strategy] = {
      totalVisionInvocations: visionInvocations,
      totalVisionSkips: visionSkips,
      visionInvocationRate: strategyResults.length > 0 ? visionInvocations / strategyResults.length : 0,
      avgEndToEndLatency: strategyResults.length > 0 
        ? strategyResults.reduce((sum, r) => sum + r.stages.end_to_end, 0) / strategyResults.length 
        : 0,
      avgDetectionCount: strategyResults.length > 0
        ? strategyResults.reduce((sum, r) => sum + r.detectionCount, 0) / strategyResults.length
        : 0,
      avgRedactionCount: strategyResults.length > 0
        ? strategyResults.reduce((sum, r) => sum + r.redactionCount, 0) / strategyResults.length
        : 0,
      modelInferenceSuccessRate: strategyResults.length > 0
        ? strategyResults.filter(r => r.modelInferenceSuccess === true).length / strategyResults.length
        : 0,
    };
  }

  const perCategoryResults: Record<number, Record<ExperimentStrategy, {
    visionInvocations: number;
    visionSkips: number;
    visionInvocationRate: number;
    avgEndToEndLatency: number;
    avgDetectionCount: number;
  }>> = {} as Record<number, any>;

  for (const category of [1, 2, 3, 4, 5, 6]) {
    perCategoryResults[category] = {} as any;
    for (const strategy of STRATEGIES) {
      const catResults = allSampleResults.filter(r => r.category === category && r.strategy === strategy);
      const visionInvocations = catResults.filter(r => r.visionGateInfo?.gateDecision === true).length;
      const visionSkips = catResults.filter(r => r.visionGateInfo?.gateDecision === false).length;
      
      perCategoryResults[category][strategy] = {
        visionInvocations,
        visionSkips,
        visionInvocationRate: catResults.length > 0 ? visionInvocations / catResults.length : 0,
        avgEndToEndLatency: catResults.length > 0
          ? catResults.reduce((sum, r) => sum + r.stages.end_to_end, 0) / catResults.length
          : 0,
        avgDetectionCount: catResults.length > 0
          ? catResults.reduce((sum, r) => sum + r.detectionCount, 0) / catResults.length
          : 0,
      };
    }
  }

  return {
    experiment: EXPERIMENT_CONFIG,
    summary: {
      totalSamples: allSampleResults.length / (STRATEGIES.length * EXECUTION_MODES.length),
      strategyResults: strategySummary,
      perCategoryResults,
    },
    samples: allSampleResults,
    timestamp: new Date().toISOString(),
    environment: await getSystemInfo(),
  };
}

function writeExperimentResults(result: any, outputDir: string = './experiment-results'): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const jsonPath = path.join(outputDir, 'experiment-' + Date.now() + '.json');
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  console.log('Experiment results written to ' + jsonPath);

  const summaryPath = path.join(outputDir, 'experiment-summary-' + Date.now() + '.txt');
  const summaryText = generateSummaryText(result);
  fs.writeFileSync(summaryPath, summaryText);
  console.log('Summary written to ' + summaryPath);
}

function generateSummaryText(result: any): string {
  const summary = result.summary;
  const experiment = result.experiment;
  
  let text = 'SIH 26171 - Phase 14 Experiment: DOM-gated vs Unconditional Vision\n';
  text += '================================================================\n\n';
  text += 'Dataset Version: ' + experiment.datasetVersion + '\n';
  text += 'Timestamp: ' + result.timestamp + '\n';
  text += 'Runtime: ' + experiment.runtime + '\n';
  text += 'Node.js: ' + experiment.nodeVersion + '\n';
  text += 'Platform: ' + experiment.platform + ' (' + experiment.arch + ')\n\n';
  
  text += 'EXPERIMENT CONFIG:\n';
  text += '  Warmup Iterations: ' + experiment.warmupIterations + '\n';
  text += '  Benchmark Iterations: ' + experiment.benchmarkIterations + '\n\n';
  
  text += 'DATASET:\n';
  text += '  Total Unique Samples: ' + summary.totalSamples + '\n';
  text += '  Strategies Tested: ' + Object.keys(summary.strategyResults).join(', ') + '\n\n';
  
  text += 'AGGREGATE STRATEGY COMPARISON:\n';
  text += 'Strategy | Vision Calls | Vision Rate | Avg E2E (ms) | Avg Detections | Avg Redactions | Model Success\n';
  text += '---------|--------------|-------------|--------------|----------------|----------------|--------------\n';
  
  for (const [strategy, stats] of Object.entries(summary.strategyResults)) {
    const s = stats as {
      totalVisionInvocations: number;
      visionInvocationRate: number;
      avgEndToEndLatency: number;
      avgDetectionCount: number;
      avgRedactionCount: number;
      modelInferenceSuccessRate: number;
    };
    text += strategy + ' | ' + 
      s.totalVisionInvocations + ' | ' + 
      (s.visionInvocationRate * 100).toFixed(1) + '% | ' + 
      s.avgEndToEndLatency.toFixed(2) + ' | ' + 
      s.avgDetectionCount.toFixed(1) + ' | ' + 
      s.avgRedactionCount.toFixed(1) + ' | ' + 
      (s.modelInferenceSuccessRate * 100).toFixed(1) + '%\n';
  }
  text += '\n';
  
  text += 'PER-CATEGORY RESULTS:\n';
  for (const category of [1, 2, 3, 4, 5, 6]) {
    if (summary.perCategoryResults[category]) {
      text += '\nCategory ' + category + ' (' + categoryNames[category] + '):\n';
      text += '  Strategy | Vision Calls | Vision Rate | Avg E2E (ms) | Avg Detections\n';
      text += '  ---------|--------------|-------------|--------------|---------------\n';
      for (const strategy of ['dom_only', 'unconditional_vision', 'dom_gated_vision']) {
        const stats = summary.perCategoryResults[category][strategy];
        if (stats) {
          text += '  ' + strategy + ' | ' + 
            stats.visionInvocations + ' | ' + 
            (stats.visionInvocationRate * 100).toFixed(1) + '% | ' + 
            stats.avgEndToEndLatency.toFixed(2) + ' | ' + 
            stats.avgDetectionCount.toFixed(1) + '\n';
        }
      }
    }
  }
  text += '\n';
  
  text += 'GATE BEHAVIOR ANALYSIS:\n';
  const gatedResults = result.samples.filter((r: any) => r.strategy === 'dom_gated_vision');
  const totalGated = gatedResults.length;
  const gateTriggered = gatedResults.filter((r: any) => r.visionGateInfo?.gateDecision === true).length;
  const gateSkipped = gatedResults.filter((r: any) => r.visionGateInfo?.gateDecision === false).length;
  
  text += '  DOM-gated strategy:\n';
  text += '    Total samples: ' + totalGated + '\n';
  text += '    Gate triggered (vision invoked): ' + gateTriggered + ' (' + ((gateTriggered/totalGated)*100).toFixed(1) + '%)\n';
  text += '    Gate skipped (vision skipped): ' + gateSkipped + ' (' + ((gateSkipped/totalGated)*100).toFixed(1) + '%)\n';
  
  const gateReasons: Record<string, number> = {};
  for (const r of gatedResults) {
    if (r.visionGateInfo?.gateReason) {
      gateReasons[r.visionGateInfo.gateReason] = (gateReasons[r.visionGateInfo.gateReason] || 0) + 1;
    }
  }
  text += '    Gate reasons:\n';
  for (const [reason, count] of Object.entries(gateReasons)) {
    text += '      ' + reason + ': ' + count + '\n';
  }
  
  text += '\nMODEL INFERENCE:\n';
  for (const strategy of STRATEGIES) {
    const stats = summary.strategyResults[strategy];
    text += '  ' + strategy + ': Model success rate ' + (stats.modelInferenceSuccessRate * 100).toFixed(1) + '%\n';
  }
  
  text += '\nPER-SAMPLE DETAILS:\n';
  for (const sample of result.samples) {
    text += '  ' + sample.sampleId + ' (Cat ' + sample.category + ') [' + sample.strategy + ' (' + sample.visionExecutionMode + ')]: ' + 
      sample.stages.end_to_end.toFixed(2) + 'ms, detections=' + sample.detectionCount + 
      ', visionInvoked=' + sample.visionGateInfo?.gateDecision + '\n';
  }
  
  return text;
}

export { runExperiment, writeExperimentResults, EXPERIMENT_CONFIG };