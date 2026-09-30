import { runFullEvaluation, writeEvaluationResults } from './runner';

console.log('Starting Phase 9 Evaluation...');
console.log('================================');

try {
  const result = runFullEvaluation();
  writeEvaluationResults(result);
  
  console.log('\nEvaluation completed successfully!');
  console.log(`Overall PII Precision: ${(result.summary.overallPrecision * 100).toFixed(2)}%`);
  console.log(`Overall PII Recall: ${(result.summary.overallRecall * 100).toFixed(2)}%`);
  console.log(`Overall PII F1: ${(result.summary.overallF1 * 100).toFixed(2)}%`);
  console.log(`Overall Redaction Precision: ${(result.summary.overallRedactionPrecision * 100).toFixed(2)}%`);
  console.log(`\nTotal samples: ${result.summary.totalSamples}`);
  console.log(`Evaluated: ${result.summary.totalEvaluated}`);
  console.log(`Deferred: ${result.summary.totalDeferred}`);
  
  process.exit(0);
} catch (error) {
  console.error('Evaluation failed:', error);
  process.exit(1);
}