import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { 
  SyntheticSample, 
  DatasetIndex, 
  SampleMetadata,
  ExpectedDetection,
  ExpectedRedaction,
  ExpectedHiddenElement,
  ExpectedActionOutcome,
  GroundTruthAnnotation
} from './types';

const __filename = fileURLToPath(import.meta.url);
const DATASET_ROOT = path.dirname(__filename);
const CATEGORIES = [1, 2, 3, 4, 5, 6];

function loadSample(category: number, sampleId: string): SyntheticSample | null {
  const categoryDir = path.join(DATASET_ROOT, `category${category}`);
  const jsonPath = path.join(categoryDir, `${sampleId}.json`);
  
  if (!fs.existsSync(jsonPath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(jsonPath, 'utf-8');
    return JSON.parse(content) as SyntheticSample;
  } catch (error) {
    console.error(`Failed to load sample ${sampleId} from category ${category}:`, error);
    return null;
  }
}

function getSampleIds(category: number): string[] {
  const categoryDir = path.join(DATASET_ROOT, `category${category}`);
  if (!fs.existsSync(categoryDir)) {
    return [];
  }
  
  return fs.readdirSync(categoryDir)
    .filter(file => file.endsWith('.json'))
    .map(file => file.replace('.json', ''))
    .sort();
}

function loadHTML(category: number, sampleId: string): string | null {
  const categoryDir = path.join(DATASET_ROOT, `category${category}`);
  const htmlPath = path.join(categoryDir, `${sampleId}.html`);
  
  if (!fs.existsSync(htmlPath)) {
    return null;
  }
  
  return fs.readFileSync(htmlPath, 'utf-8');
}

function buildDatasetIndex(): DatasetIndex {
  const categories: DatasetIndex['categories'] = {};
  const samples: SyntheticSample[] = [];
  
  for (const category of CATEGORIES) {
    const sampleIds = getSampleIds(category);
    const categorySamples: SyntheticSample[] = [];
    
    for (const sampleId of sampleIds) {
      const sample = loadSample(category, sampleId);
      if (sample) {
        samples.push(sample);
        categorySamples.push(sample);
      }
    }
    
    const categoryNames: Record<number, string> = {
      1: 'Standard HTML Forms (DOM-sufficient)',
      2: 'Mislabeled / Custom-styled Fields',
      3: 'Canvas-rendered / Non-DOM Content',
      4: 'Visual PII (Faces, ID Cards)',
      5: 'Prompt Injection Test Pages',
      6: 'Mixed/Realistic Composite Pages'
    };
    
    const categoryDescriptions: Record<number, string> = {
      1: 'Pages built with real, correctly-typed HTML: type="password", type="email", autocomplete="cc-number", etc.',
      2: 'Pages where a sensitive field is implemented without a declaring type (e.g., div styled as password box).',
      3: 'Pages that render form-like content inside canvas or as static images rather than real DOM elements.',
      4: 'Pages containing synthetic face images and ID cards for Layer 3 face detection testing.',
      5: 'Pages containing hidden elements with text instructing the reasoning step to perform sensitive actions.',
      6: 'Pages combining several categories within one page for end-to-end testing.'
    };
    
    categories[category] = {
      name: categoryNames[category],
      description: categoryDescriptions[category],
      samples: categorySamples.map(s => s.metadata.id)
    };
  }
  
  return {
    version: '1.0.0',
    created: new Date().toISOString(),
    categories,
    samples
  };
}

export function getDataset(): DatasetIndex {
  return buildDatasetIndex();
}

export function getSamplesByCategory(category: number): SyntheticSample[] {
  const index = buildDatasetIndex();
  return index.samples.filter(s => s.metadata.category === category);
}

export function getSampleById(id: string): SyntheticSample | undefined {
  const index = buildDatasetIndex();
  return index.samples.find(s => s.metadata.id === id);
}

export function getAllSampleIds(): string[] {
  const index = buildDatasetIndex();
  return index.samples.map(s => s.metadata.id);
}

export function getCategorySampleIds(category: number): string[] {
  return getSampleIds(category);
}

export function loadSampleHTML(category: number, sampleId: string): string | null {
  return loadHTML(category, sampleId);
}

export function validateDataset(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const index = buildDatasetIndex();
  
  // Check for duplicate IDs
  const ids = index.samples.map(s => s.metadata.id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    errors.push('Duplicate sample IDs found');
  }
  
  // Validate each sample
  for (const sample of index.samples) {
    const meta = sample.metadata;
    
    if (!meta.id || !meta.category || !meta.html_file) {
      errors.push(`Sample ${meta.id} missing required metadata fields`);
    }
    
    // Check HTML file exists
    const htmlPath = path.join(DATASET_ROOT, `category${meta.category}`, meta.html_file);
    if (!fs.existsSync(htmlPath)) {
      errors.push(`Sample ${meta.id}: HTML file not found at ${htmlPath}`);
    }
    
    // Validate ground truth annotations
    for (const gt of sample.ground_truth) {
      if (!gt.element_id || !gt.type || !gt.expected_layer) {
        errors.push(`Sample ${meta.id}: Invalid ground truth annotation ${JSON.stringify(gt)}`);
      }
    }
    
    // Validate expected detections
    for (const det of sample.expected_detections) {
      if (!det.element_id || !det.pii_type || !det.detection_layer) {
        errors.push(`Sample ${meta.id}: Invalid expected detection ${JSON.stringify(det)}`);
      }
    }
    
    // Validate expected redactions
    for (const red of sample.expected_redactions) {
      if (!red.element_id || !red.pii_type || !red.expected_placeholder || !red.original_value) {
        errors.push(`Sample ${meta.id}: Invalid expected redaction ${JSON.stringify(red)}`);
      }
    }
    
    // Validate hidden elements
    for (const hidden of sample.expected_hidden_elements) {
      if (!hidden.element_id || !hidden.hidden_method) {
        errors.push(`Sample ${meta.id}: Invalid hidden element ${JSON.stringify(hidden)}`);
      }
    }
    
    // Validate action outcomes
    for (const action of sample.expected_action_outcomes) {
      if (!action.target_selector || !action.action_type || !action.expected_validation) {
        errors.push(`Sample ${meta.id}: Invalid action outcome ${JSON.stringify(action)}`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

export type { 
  SyntheticSample, 
  DatasetIndex, 
  SampleMetadata,
  ExpectedDetection,
  ExpectedRedaction,
  ExpectedHiddenElement,
  ExpectedActionOutcome,
  GroundTruthAnnotation
} from './types';