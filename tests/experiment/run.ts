import { runExperiment, writeExperimentResults } from './experiment-runner';

console.log('Starting Phase 14 Experiment...');

try {
  const result = await runExperiment();
  writeExperimentResults(result, './experiment-results');
  
  console.log('\nExperiment completed successfully!');
  console.log('Results saved to experiment-results/');
  
  process.exit(0);
} catch (error) {
  console.error('Experiment failed:', error);
  process.exit(1);
}