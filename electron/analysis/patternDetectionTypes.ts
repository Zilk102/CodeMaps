/** Types of the detected patterns shared by the pattern detectors and their consumers. */

/** A concrete place that supports a pattern: the node and an explanation of what is wrong there. */
export interface PatternEvidence {
  nodeId: string;
  message: string;
}

/**
 * A finding of the pattern detection: a stable id, severity, human text, the nodes involved and
 * optional supporting evidence.
 */
export interface DetectedPattern {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  nodeIds: string[];
  evidence?: PatternEvidence[];
}

/** All patterns found in a graph, in the order the detectors ran. */
export interface PatternDetectionResult {
  patterns: DetectedPattern[];
}
