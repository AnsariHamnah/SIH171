import type { PipelineStage, StageTimingConfig } from './types';

export interface TimingResult {
  stage: PipelineStage;
  durationMs: number;
  result: unknown;
}

export async function measureStage<T>(config: StageTimingConfig): Promise<TimingResult> {
  const start = performance.now();
  const result = await config.fn();
  const end = performance.now();
  const durationMs = end - start;

  return {
    stage: config.stage,
    durationMs,
    result,
  };
}

export async function measureStageSync<T>(config: StageTimingConfig): Promise<TimingResult> {
  const start = performance.now();
  const result = config.fn();
  const end = performance.now();
  const durationMs = end - start;

  return {
    stage: config.stage,
    durationMs,
    result,
  };
}

export function createStageTimer(stage: PipelineStage) {
  let startTime = 0;

  return {
    start(): void {
      startTime = performance.now();
    },
    stop(): number {
      const endTime = performance.now();
      return endTime - startTime;
    },
    getStage(): PipelineStage {
      return stage;
    },
  };
}

export class BenchmarkTimer {
  private stages: Map<PipelineStage, number[]> = new Map();
  private currentStage: PipelineStage | null = null;
  private stageStart: number = 0;

  startStage(stage: PipelineStage): void {
    this.currentStage = stage;
    this.stageStart = performance.now();
  }

  endStage(): number {
    if (this.currentStage === null) {
      throw new Error('No stage started');
    }
    const duration = performance.now() - this.stageStart;
    
    const existing = this.stages.get(this.currentStage) || [];
    existing.push(duration);
    this.stages.set(this.currentStage, existing);
    
    const stage = this.currentStage;
    this.currentStage = null;
    return duration;
  }

  getStageDurations(stage: PipelineStage): number[] {
    return this.stages.get(stage) || [];
  }

  getAllDurations(): Record<string, number[]> {
    const result: Record<string, number[]> = {};
    for (const [stage, durations] of this.stages.entries()) {
      result[stage] = durations;
    }
    return result;
  }

  reset(): void {
    this.stages.clear();
    this.currentStage = null;
    this.stageStart = 0;
  }
}

export const PIPELINE_STAGES: PipelineStage[] = [
  'dom_extraction',
  'layer1_detection',
  'layer2_detection',
  'detection_pipeline',
  'redaction',
  'sanitized_context',
  'structured_sanitized_context',
  'end_to_end',
];

export function isDeferredStage(stage: PipelineStage, category: number): boolean {
  const deferredStagesByCategory: Record<number, PipelineStage[]> = {
    3: ['layer2_detection', 'detection_pipeline', 'redaction', 'sanitized_context', 'structured_sanitized_context'],
    4: ['layer2_detection', 'detection_pipeline', 'redaction', 'sanitized_context', 'structured_sanitized_context'],
  };
  
  const deferred = deferredStagesByCategory[category] || [];
  return deferred.includes(stage);
}