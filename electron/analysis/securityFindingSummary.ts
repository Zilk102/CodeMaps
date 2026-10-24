/**
 * Severity counting for security findings, shared by the scanner and the tools that report its results.
 */
import type { SecurityFinding } from './SecurityScanner';

/** Number of security findings in total and for each severity level. */
export interface SecurityFindingSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

/** How many findings there are in total and per severity. */
export function summarizeSecurityFindings(findings: SecurityFinding[]): SecurityFindingSummary {
  const countOf = (severity: SecurityFinding['severity']) =>
    findings.filter((finding) => finding.severity === severity).length;
  return {
    total: findings.length,
    critical: countOf('critical'),
    high: countOf('high'),
    medium: countOf('medium'),
    low: countOf('low'),
  };
}
