import * as fs from 'fs/promises';
import { GraphData } from '../store';

export interface SecurityFinding {
  ruleId: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  nodeId: string;
  message: string;
}

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
      'Найдено использование browser storage. Для auth и чувствительных данных используйте только HTTP-only Secure Cookies.',
  },
  {
    ruleId: 'dynamic_code_execution',
    severity: 'high',
    pattern: /\b(?:eval\s*\(|new Function\s*\()/,
    message:
      'Найдено динамическое выполнение кода (`eval`/`Function`), что увеличивает риск RCE/XSS.',
  },
  {
    ruleId: 'child_process_shell',
    severity: 'high',
    pattern: /\b(?:exec|execSync|spawn|spawnSync)\s*\(/,
    message:
      'Найден shell/process execution API. Проверьте sandboxing, валидацию аргументов и blast radius.',
  },
  {
    ruleId: 'hardcoded_secret',
    severity: 'high',
    pattern: /\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*['"`][^'"`\s]{8,}['"`]/i,
    message:
      'Похоже на hardcoded credential. Вынесите секрет в переменные окружения и secret management.',
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

export class SecurityScanner {
  async analyze(graph: GraphData): Promise<SecurityScanResult> {
    const findings: SecurityFinding[] = [];

    for (const node of graph.nodes) {
      if (node.type !== 'file') {
        continue;
      }

      // Skip build output directories to avoid false positives from bundled/compiled code
      const normalizedPath = node.id.replace(/\\/g, '/');
      if (
        /(dist|dist-electron|dist-renderer|node_modules|build|out|coverage)\//.test(normalizedPath)
      ) {
        continue;
      }

      const normalizedId = node.id.toLowerCase();
      const normalizedLabel = node.label.toLowerCase();

      if (SECRET_FILE_RE.test(normalizedId) || SENSITIVE_NAME_RE.test(normalizedLabel)) {
        findings.push({
          ruleId: 'sensitive_file_name',
          severity: normalizedLabel === '.env' ? 'high' : 'medium',
          nodeId: node.id,
          message: 'Имя файла выглядит как потенциальный носитель секрета или ключевого материала.',
        });
      }

      if (normalizedId.includes('/public/') && SECRET_FILE_RE.test(normalizedId)) {
        findings.push({
          ruleId: 'public_secret_exposure',
          severity: 'critical',
          nodeId: node.id,
          message: 'Потенциально чувствительный файл расположен в публичном каталоге.',
        });
      }

      if (normalizedId.includes('/src/') && INFRA_FILE_RE.test(normalizedId)) {
        findings.push({
          ruleId: 'infra_in_source_tree',
          severity: 'low',
          nodeId: node.id,
          message:
            'Инфраструктурный файл находится внутри source tree; проверьте разделение runtime и delivery-артефактов.',
        });
      }

      try {
        const content = await fs.readFile(node.id, 'utf-8');
        const sanitizedContent = stripStringsAndComments(content);

        for (const rule of SANITIZED_CONTENT_RULES) {
          if (rule.pattern.test(sanitizedContent)) {
            findings.push({
              ruleId: rule.ruleId,
              severity: rule.severity,
              nodeId: node.id,
              message: rule.message,
            });
          }
        }

        const hasInsecureRemoteHttp = content
          .split(/\r?\n/)
          .some(
            (line) =>
              /http:\/\//i.test(line) &&
              !/localhost|127\.0\.0\.1/i.test(line) &&
              !/\$\{/.test(line) &&
              !/xmlns\s*=|www\.w3\.org/i.test(line)
          );

        if (hasInsecureRemoteHttp) {
          findings.push({
            ruleId: 'insecure_http_url',
            severity: 'medium',
            nodeId: node.id,
            message: 'Найден незащищенный HTTP URL вне localhost.',
          });
        }
      } catch {
        // Ignore unreadable files; path-based checks above still apply.
      }
    }

    return {
      findings,
      summary: {
        total: findings.length,
        critical: findings.filter((finding) => finding.severity === 'critical').length,
        high: findings.filter((finding) => finding.severity === 'high').length,
        medium: findings.filter((finding) => finding.severity === 'medium').length,
        low: findings.filter((finding) => finding.severity === 'low').length,
      },
    };
  }
}
