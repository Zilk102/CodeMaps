export interface PatternEvidence {
  nodeId: string;
  message: string;
}

export interface DetectedPattern {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  nodeIds: string[];
  evidence?: PatternEvidence[];
}

export interface PatternDetectionResult {
  patterns: DetectedPattern[];
}
