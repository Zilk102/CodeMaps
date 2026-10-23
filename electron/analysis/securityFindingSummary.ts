import type { SecurityFinding } from './SecurityScanner';

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
