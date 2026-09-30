import { runBenchmark, writeBenchmarkResults } from './runner';

console.log('Starting Phase 10 Latency Benchmark...');

try {
  const result = await runBenchmark();
  writeBenchmarkResults(result, './benchmark-results');
  
  console.log('\nBenchmark completed successfully!');
  console.log(`Overall PII Precision: ${result.summary.overallLatencyMs.mean.toFixed(2)}ms`);
  
  process.exit(0);
} catch (error) {
  console.error('Benchmark failed:', error);
  process.exit(1);
}