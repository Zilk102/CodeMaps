/**
 * Heuristic security scan over the file nodes of the graph: suspicious file names and locations
 * plus a few regex rules on file content. It reports candidates for review, not proven vulnerabilities.
 */
import { GraphData } from '../store/types';
import { readFileWithinLimit } from '../parsing/fileLimits';

/** One suspected security issue; `nodeId` is the path of the file it was found in. */
export interface SecurityFinding {
  ruleId: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  nodeId: string;
  message: string;
}

/**
 * All findings of a scan with per-severity counts, so callers can show a summary without re-counting.
 */
export interface SecurityScanResult {
  findings: SecurityFinding[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

const SECRET_FILE_RE = /\.(env|pem|key|p12|pfx|crt|cert)$/i;
const SENSITIVE_NAME_RE =
  /(secret|token|password|passwd|credential|private[-_]?key|access[-_]?key)/i;
const INFRA_FILE_RE = /(dockerfile|docker-compose|compose\.ya?ml|k8s|helm|terraform|\.tf$)/i;
const RAW_CONTENT_RULES: Array<{
  ruleId: string;
  severity: SecurityFinding['severity'];
  pattern: RegExp;
  message: string;
}> = [
  {
    ruleId: 'hardcoded_secret',
    severity: 'high',
    pattern: /\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*['"`][^'"`\s]{8,}['"`]/i,
    message:
      'Looks like a hardcoded credential. Move the secret to environment variables and secret management.',
  },
];

const SANITIZED_CONTENT_RULES: Array<{
  ruleId: string;
  severity: SecurityFinding['severity'];
  pattern: RegExp;
  message: string;
}> = [
  {
    ruleId: 'browser_storage_auth',
    severity: 'critical',
    pattern: /\b(?:window\.)?(?:localStorage|sessionStorage)\s*(?:\.|\[)/,
    message:
      'Browser storage usage found. For auth and sensitive data, use HTTP-only Secure Cookies exclusively.',
  },
  {
    ruleId: 'dynamic_code_execution',
    severity: 'high',
    pattern: /\b(?:eval\s*\(|new Function\s*\()/,
    message: 'Dynamic code execution (`eval`/`Function`) found, increasing RCE/XSS risk.',
  },
  {
    ruleId: 'child_process_shell',
    severity: 'high',
    pattern: /\b(?:exec|execSync|spawn|spawnSync)\s*\(/,
    message:
      'Shell/process execution API found. Check sandboxing, argument validation, and blast radius.',
  },
];

const stripStringsAndComments = (content: string) => {
  const withoutBlockComments = content.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const withoutLineComments = withoutBlockComments.replace(/\/\/.*$/gm, ' ');
  return withoutLineComments.replace(
    /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g,
    '""'
  );
};

const BUILD_OUTPUT_RE = /(dist|dist-electron|dist-renderer|node_modules|build|out|coverage)\//;

type ContentRule = (typeof RAW_CONTENT_RULES)[number];

function toFinding(rule: ContentRule, nodeId: string): SecurityFinding {
  return { ruleId: rule.ruleId, severity: rule.severity, nodeId, message: rule.message };
}

/**
 * Path-only checks for a file node: secret-like names, secret files under `/public/`, and
 * infrastructure files inside `/src/`. Reads no file content.
 */
function scanPath(node: GraphData['nodes'][number]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const normalizedId = node.id.toLowerCase();
  const normalizedLabel = node.label.toLowerCase();

  if (SECRET_FILE_RE.test(normalizedId) || SENSITIVE_NAME_RE.test(normalizedLabel)) {
    findings.push({
      ruleId: 'sensitive_file_name',
      severity: normalizedLabel === '.env' ? 'high' : 'medium',
      nodeId: node.id,
      message: 'The file name looks like a potential carrier of a secret or key material.',
    });
  }

  if (normalizedId.includes('/public/') && SECRET_FILE_RE.test(normalizedId)) {
    findings.push({
      ruleId: 'public_secret_exposure',
      severity: 'critical',
      nodeId: node.id,
      message: 'A potentially sensitive file is located in a public directory.',
    });
  }

  if (normalizedId.includes('/src/') && INFRA_FILE_RE.test(normalizedId)) {
    findings.push({
      ruleId: 'infra_in_source_tree',
      severity: 'low',
      nodeId: node.id,
      message:
        'An infrastructure file is located inside the source tree; check the separation of runtime and delivery artifacts.',
    });
  }

  return findings;
}

/**
 * True when some line contains an `http://` URL that is not localhost, a template placeholder or an
 * XML/W3C namespace, i.e. a URL that probably should be HTTPS.
 */
function hasInsecureRemoteHttp(content: string): boolean {
  return content
    .split(/\r?\n/)
    .some(
      (line) =>
        /http:\/\//i.test(line) &&
        !/localhost|127\.0\.0\.1/i.test(line) &&
        !/\$\{/.test(line) &&
        !/xmlns\s*=|www\.w3\.org/i.test(line)
    );
}

/**
 * Content checks for one file. Code rules run on text with comments and string literals blanked out
 * (so a mention in a string is no finding); the credential rule runs on the raw text because it must
 * see the string value.
 */
function scanContent(nodeId: string, content: string): SecurityFinding[] {
  const sanitizedContent = stripStringsAndComments(content);
  const findings = [
    ...SANITIZED_CONTENT_RULES.filter((rule) => rule.pattern.test(sanitizedContent)),
    ...RAW_CONTENT_RULES.filter((rule) => rule.pattern.test(content)),
  ].map((rule) => toFinding(rule, nodeId));

  if (hasInsecureRemoteHttp(content)) {
    findings.push({
      ruleId: 'insecure_http_url',
      severity: 'medium',
      nodeId,
      message: 'Found an insecure HTTP URL outside of localhost.',
    });
  }
  return findings;
}

/** Counts findings in total and per severity. */
function summarizeFindings(findings: SecurityFinding[]): SecurityScanResult['summary'] {
  const count = (severity: SecurityFinding['severity']) =>
    findings.filter((finding) => finding.severity === severity).length;
  return {
    total: findings.length,
    critical: count('critical'),
    high: count('high'),
    medium: count('medium'),
    low: count('low'),
  };
}

/**
 * Findings for one file node: path checks first, then content checks. An unreadable or too large
 * file only loses its content checks.
 */
async function scanFileNode(node: GraphData['nodes'][number]): Promise<SecurityFinding[]> {
  const findings = scanPath(node);
  try {
    const content = await readFileWithinLimit(node.id);
    if (content !== null) findings.push(...scanContent(node.id, content));
  } catch {
    // Ignore unreadable files; path-based checks above still apply.
  }
  return findings;
}

/**
 * Scans every file node of a graph, skipping build output directories to avoid noise from compiled code.
 */
export class SecurityScanner {
  /**
   * Scans all non-generated file nodes of `graph` and returns the findings with a severity summary.
   */
  async analyze(graph: GraphData): Promise<SecurityScanResult> {
    const findings: SecurityFinding[] = [];

    for (const node of graph.nodes) {
      if (node.type !== 'file') {
        continue;
      }

      // Skip build output directories to avoid false positives from bundled/compiled code
      if (BUILD_OUTPUT_RE.test(node.id.replace(/\\/g, '/'))) {
        continue;
      }

      findings.push(...(await scanFileNode(node)));
    }

    return { findings, summary: summarizeFindings(findings) };
  }
}
