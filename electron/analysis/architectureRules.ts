import { loadProjectArchitectureRuleRecords } from './projectArchitectureRuleLoader';
import { ArchitectureLayer, ArchitectureRule } from './architectureTypes';

export const DEFAULT_ARCHITECTURE_RULES: ArchitectureRule[] = [
  {
    pattern: /(?:^|[\\/])(?:LICENSE(?:\.[A-Za-z0-9_-]+)?|CHANGELOG(?:\.[A-Za-z0-9_-]+)?|\.[^\\/]+)$|(?:^|[\\/])[^\\/]+\.config\.(?:[cm]?[jt]s)$|\.(?:test|spec)\.(?:[cm]?[jt]sx?)$|\.(?:json|ya?ml|md|toml|ini|env(?:\.[A-Za-z0-9._-]+)?|rc)$/i,
    layer: 'configuration',
    reason: 'config_or_doc_file',
  },
  { pattern: /(^|[\\/])(scripts|\.github|\.husky)([\\/]|$)/i, layer: 'configuration', reason: 'automation_scripts' },
  { pattern: /(^|[\\/])(test|__tests__|spec)([\\/]|$)/i, layer: 'configuration', reason: 'test_or_support_path' },
  { pattern: /(^|[\\/])(components|views|pages|ui|screens|layouts|hooks|i18n|locales)([\\/]|$)/i, layer: 'presentation', reason: 'ui_layer' },
  { pattern: /(^|[\\/])(assets|public|static)([\\/]|$)/i, layer: 'presentation', reason: 'static_assets' },
  { pattern: /\.(css|scss|sass|less|styl)$/i, layer: 'presentation', reason: 'stylesheet_path' },
  { pattern: /(^|[\\/])(store|state|reducers|actions|context)([\\/]|$)/i, layer: 'state', reason: 'state_management' },
  { pattern: /(^|[\\/])(services|usecases|application|features|controllers)([\\/]|$)/i, layer: 'application', reason: 'application_logic' },
  { pattern: /(^|[\\/])(domain|models|entities|core)([\\/]|$)/i, layer: 'domain', reason: 'domain_logic' },
  { pattern: /(^|[\\/])(infrastructure|db|database|api|clients|repositories|integration|bin|mcp)([\\/]|$)/i, layer: 'integration', reason: 'infrastructure_integration' },
  {
    pattern: /(^|[\\/])electron$|(^|[\\/])electron([\\/])[^\\/]+\.[A-Za-z0-9]+$/i,
    layer: 'integration',
    reason: 'electron_runtime_root',
  },
  { pattern: /(^|[\\/])(electron|main|preload|mcp)\.ts$/i, layer: 'integration', reason: 'entrypoint_or_adapter_path' },
  { pattern: /(^|[\\/])(utils|shared|helpers|common|types|interfaces)([\\/]|$)/i, layer: 'shared', reason: 'shared_utilities' },
  { pattern: /\.d\.ts$/i, layer: 'shared', reason: 'type_declaration_path' },
  { pattern: /(^|[\\/])(analysis)([\\/]|$)/i, layer: 'analysis', reason: 'analysis_path' },
  { pattern: /(^|[\\/])(parsing)([\\/]|$)/i, layer: 'parsing', reason: 'parsing_path' },
  { pattern: /(^|[\\/])(oracle)([\\/]|$)/i, layer: 'application', reason: 'orchestration_path' },
];

const toArchitectureRule = (
  rule: { pattern: string; layer: string; reason?: string }
): ArchitectureRule | null => {
  try {
    return {
      pattern: new RegExp(rule.pattern, 'i'),
      layer: rule.layer as ArchitectureLayer,
      reason: rule.reason || 'custom_rule',
    };
  } catch {
    return null;
  }
};

export const resolveArchitectureRules = (
  projectRoot: string,
  defaultRules: ArchitectureRule[]
): ArchitectureRule[] => {
  const customRuleRecords = loadProjectArchitectureRuleRecords(projectRoot);
  if (!customRuleRecords) {
    return defaultRules;
  }

  const customRules = customRuleRecords
    .map(toArchitectureRule)
    .filter((rule): rule is ArchitectureRule => Boolean(rule));

  if (customRules.length === 0) {
    return defaultRules;
  }

  // Custom rules win on priority, but default rules remain as safe fallback coverage.
  return [...customRules, ...defaultRules];
};
