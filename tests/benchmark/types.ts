export type PipelineStage = 
  | 'dom_extraction'
  | 'layer1_detection'
  | 'layer2_detection'
  | 'layer3_detection_sync'
  | 'detection_pipeline'
  | 'redaction'
  | 'sanitized_context'
  | 'structured_sanitized_context'
  | 'end_to_end';

export interface LatencyMeasurement {
  min: number;
  max: number;
  mean: number;
  median: number;
  p50: number;
  p95: number;
  p99: number;
  stdDev: number;
  count: number;
  values: number[];
}

export interface StageLatencyResult {
  stage: PipelineStage;
  latencyMs: LatencyMeasurement;
}

export interface ResourceMeasurement {
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  rssMb: number;
  arrayBuffersMb: number;
}

export type VisionGateReason = 
  | 'no_visual_content_requiring_inspection'
  | 'visual_content_present'
  | 'visual_content_with_pii_indicators'
  | 'document_upload_control_present';

export interface VisionGateInfo {
  gateDecision: boolean;
  gateReason: VisionGateReason;
  visualRegionsCount: number;
  signalsCount: number;
}

export interface SampleBenchmarkResult {
  sampleId: string;
  category: number;
  categoryName: string;
  elementCount: number;
  stages: Record<PipelineStage, number>;
  resources: ResourceMeasurement;
  detectionCount: number;
  redactionCount: number;
  visionGateInfo?: VisionGateInfo;
}

export interface BenchmarkConfig {
  warmupIterations: number;
  benchmarkIterations: number;
  datasetVersion: string;
  runtime: string;
  nodeVersion: string;
  platform: string;
  arch: string;
}

export interface BenchmarkSummary {
  totalSamples: number;
  evaluatedSamples: number;
  deferredSamples: number;
  overallLatencyMs: LatencyMeasurement;
  stageLatencies: Record<PipelineStage, LatencyMeasurement>;
  overallResources: ResourceMeasurement;
}

export interface FullBenchmarkResult {
  benchmark: BenchmarkConfig;
  summary: BenchmarkSummary;
  samples: SampleBenchmarkResult[];
  timestamp: string;
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
    cpus: number;
    totalMemoryGb: number;
  };
}

export type StatisticFn = (values: number[]) => number;

export interface StageTimingConfig {
  stage: PipelineStage;
  fn: () => Promise<unknown> | unknown;
}