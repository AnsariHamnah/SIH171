import type { ExtractedElement } from './dom-extraction';
import type { PIIDetection } from './types';
import { detectLayer1, Layer1DetectionResult } from './layer1-detector';
import { detectLayer2, Layer2DetectionResult } from './layer2-detector';
import { detectLayer3, detectLayer3AsyncForExperiment, VisualDetectionResult, ModelInferenceResult, ModelState, VisionBackend, BackendSelectionMode } from './layer3-visual-detector';
import { evaluateVisionGate, VisionGateDecision } from './vision-gate';
import { buildSanitizedContext, buildStructuredSanitizedContext } from './sanitized-context';
import { toDOMElementMetadata } from './dom-extraction';
import { groupDetectionsByElement } from './detection-pipeline';
import { validateSanitizedContext } from './sanitized-context';

export type ExperimentStrategy = 'dom_only' | 'unconditional_vision' | 'dom_gated_vision';

export type VisionExecutionMode = 
  | 'heuristic_fallback'    // Phase 11 deterministic heuristic (synchronous, Node/JSDOM compatible)
  | 'local_model_wasm'      // Phase 12 BlazeFace via Transformers.js + ONNX Runtime Web WASM (browser only)
  | 'local_model_webgpu'    // Phase 15 BlazeFace via Transformers.js + ONNX Runtime Web WebGPU (browser only)
  | 'local_model_auto';     // Phase 15 Auto: WebGPU if available/working, otherwise WASM

export interface StrategyResult {
  strategy: ExperimentStrategy;
  visionExecutionMode: VisionExecutionMode;
  detections: PIIDetection[];
  layer1Result: Layer1DetectionResult;
  layer2Result: Layer2DetectionResult;
  layer3Result: VisualDetectionResult;
  modelInferenceResult?: ModelInferenceResult;
  visionGateInfo?: {
    decision: VisionGateDecision;
    visionInvoked: boolean;
    visionSkipped: boolean;
  };
  sanitizedContext: ReturnType<typeof buildSanitizedContext>;
  structuredContext: ReturnType<typeof buildStructuredSanitizedContext>;
  backendInfo?: {
    activeBackend: VisionBackend;
    requestedBackend: BackendSelectionMode;
    webgpuAvailable: boolean;
    webgpuInitializationSuccess: boolean;
    wasmFallback: boolean;
    fallbackReason?: string;
    initializationTimeMs?: number;
  };
}

export interface StrategyRunConfig {
  strategy: ExperimentStrategy;
  visionExecutionMode: VisionExecutionMode;
  faceDetectionConfig?: Partial<{
    confidenceThreshold: number;
    minFaceSize: number;
    maxFaceSize: number;
  }>;
}

function runLayer1(extractedElements: ExtractedElement[]): Layer1DetectionResult {
  return detectLayer1(extractedElements);
}

function runLayer2(extractedElements: ExtractedElement[]): Layer2DetectionResult {
  return detectLayer2(extractedElements);
}

function runLayer3Heuristic(
  extractedElements: ExtractedElement[],
  config?: StrategyRunConfig['faceDetectionConfig']
): VisualDetectionResult {
  return detectLayer3(extractedElements, config);
}

async function runLayer3LocalModelForExperiment(
  extractedElements: ExtractedElement[],
  config?: StrategyRunConfig['faceDetectionConfig'],
  backendMode?: BackendSelectionMode
): Promise<ModelInferenceResult> {
  return detectLayer3AsyncForExperiment(extractedElements, config, backendMode);
}

export async function runStrategy(
  extractedElements: ExtractedElement[],
  config: StrategyRunConfig
): Promise<StrategyResult> {
  const layer1Result = runLayer1(extractedElements);
  const layer2Result = runLayer2(extractedElements);

  let layer3Result: VisualDetectionResult;
  let visionGateInfo: StrategyResult['visionGateInfo'];
  let modelInferenceResult: StrategyResult['modelInferenceResult'];
  let backendInfo: StrategyResult['backendInfo'];

  const backendMode = config.visionExecutionMode === 'local_model_webgpu' ? 'webgpu'
    : config.visionExecutionMode === 'local_model_wasm' ? 'wasm'
    : config.visionExecutionMode === 'local_model_auto' ? 'auto'
    : undefined;

  switch (config.strategy) {
    case 'dom_only': {
      layer3Result = { detections: [] };
      visionGateInfo = {
        decision: { shouldRunVision: false, reason: 'dom_only_strategy', signals: [], visualRegionsCount: 0, timestamp: Date.now() },
        visionInvoked: false,
        visionSkipped: true,
      };
      modelInferenceResult = undefined;
      backendInfo = undefined;
      break;
    }

    case 'unconditional_vision': {
      const gateDecision = evaluateVisionGate(extractedElements);
      
      if (config.visionExecutionMode === 'local_model_wasm' || 
          config.visionExecutionMode === 'local_model_webgpu' ||
          config.visionExecutionMode === 'local_model_auto') {
        const inferenceResult = await runLayer3LocalModelForExperiment(extractedElements, config.faceDetectionConfig, backendMode);
        layer3Result = { detections: inferenceResult.detections };
        modelInferenceResult = inferenceResult;
        backendInfo = {
          activeBackend: inferenceResult.backend ?? 'wasm',
          requestedBackend: backendMode ?? 'wasm',
          webgpuAvailable: inferenceResult.webgpuAvailable ?? false,
          webgpuInitializationSuccess: inferenceResult.webgpuInitializationSuccess ?? false,
          wasmFallback: inferenceResult.wasmFallback ?? false,
          fallbackReason: inferenceResult.fallbackReason,
          initializationTimeMs: inferenceResult.initializationTimeMs,
        };
      } else {
        layer3Result = runLayer3Heuristic(extractedElements, config.faceDetectionConfig);
        modelInferenceResult = { success: true, detections: layer3Result.detections, modelState: ModelState.READY };
        backendInfo = undefined;
      }
      
      visionGateInfo = {
        decision: gateDecision,
        visionInvoked: true,
        visionSkipped: false,
      };
      break;
    }

    case 'dom_gated_vision': {
      const gateDecision = evaluateVisionGate(extractedElements);
      
      if (gateDecision.shouldRunVision) {
        if (config.visionExecutionMode === 'local_model_wasm' || 
            config.visionExecutionMode === 'local_model_webgpu' ||
            config.visionExecutionMode === 'local_model_auto') {
          const inferenceResult = await runLayer3LocalModelForExperiment(extractedElements, config.faceDetectionConfig, backendMode);
          layer3Result = { detections: inferenceResult.detections };
          modelInferenceResult = inferenceResult;
          backendInfo = {
            activeBackend: inferenceResult.backend ?? 'wasm',
            requestedBackend: backendMode ?? 'wasm',
            webgpuAvailable: inferenceResult.webgpuAvailable ?? false,
            webgpuInitializationSuccess: inferenceResult.webgpuInitializationSuccess ?? false,
            wasmFallback: inferenceResult.wasmFallback ?? false,
            fallbackReason: inferenceResult.fallbackReason,
            initializationTimeMs: inferenceResult.initializationTimeMs,
          };
        } else {
          layer3Result = runLayer3Heuristic(extractedElements, config.faceDetectionConfig);
          modelInferenceResult = { success: true, detections: layer3Result.detections, modelState: ModelState.READY };
          backendInfo = undefined;
        }
        visionGateInfo = {
          decision: gateDecision,
          visionInvoked: true,
          visionSkipped: false,
        };
      } else {
        layer3Result = { detections: [] };
        visionGateInfo = {
          decision: gateDecision,
          visionInvoked: false,
          visionSkipped: true,
        };
        modelInferenceResult = undefined;
        backendInfo = undefined;
      }
      break;
    }

    default: {
      const _exhaustive: never = config.strategy;
      throw new Error(`Unknown strategy: ${_exhaustive}`);
    }
  }

  const allDetections: PIIDetection[] = [
    ...layer1Result.detections,
    ...layer2Result.detections,
    ...layer3Result.detections,
  ];

  const detectionsMap = groupDetectionsByElement(extractedElements, allDetections);
  const domElements = extractedElements.map((el) => {
    const elementDetections = detectionsMap.get(el.element) || [];
    return toDOMElementMetadata(el, elementDetections);
  });

  const sanitizedContext = buildSanitizedContext(domElements, window.location.origin);
  const structuredContext = buildStructuredSanitizedContext(domElements, window.location.origin, document.title);
  
  validateSanitizedContext(sanitizedContext);

  return {
    strategy: config.strategy,
    visionExecutionMode: config.visionExecutionMode,
    detections: allDetections,
    layer1Result,
    layer2Result,
    layer3Result,
    modelInferenceResult,
    visionGateInfo,
    sanitizedContext,
    structuredContext,
    backendInfo,
  };
}

export function createStrategyConfig(
  strategy: ExperimentStrategy,
  visionExecutionMode: VisionExecutionMode,
  faceDetectionConfig?: StrategyRunConfig['faceDetectionConfig']
): StrategyRunConfig {
  return { strategy, visionExecutionMode, faceDetectionConfig };
}