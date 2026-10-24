/**
 * The built-in path rules that map files and directories to architecture layers, plus loading and
 * validation of project-specific rules.
 */
import safeRegex from 'safe-regex';
import log from 'electron-log/main';
import { loadProjectArchitectureRuleRecords } from './projectArchitectureRuleLoader';
import { ArchitectureLayer, ArchitectureRule } from './architectureTypes';

/** A rule for files under any directory named in `directories` (a regex alternation). */
const dirRule = (
  directories: string,
  layer: ArchitectureLayer,
  reason: string
): ArchitectureRule => ({
  pattern: new RegExp(`(^|[\\\\/])(${directories})([\\\\/]|$)`, 'i'),
  layer,
  reason,
});

export const DEFAULT_ARCHITECTURE_RULES: ArchitectureRule[] = [
  {
    pattern:
      /(?:^|[\\/])(?:LICENSE(?:\.[A-Za-z0-9_-]+)?|CHANGELOG(?:\.[A-Za-z0-9_-]+)?|\.[^\\/]+)$|(?:^|[\\/])[^\\/]+\.config\.(?:[cm]?[jt]s)$|\.(?:test|spec)\.(?:[cm]?[jt]sx?)$|\.(?:json|ya?ml|md|toml|ini|env(?:\.[A-Za-z0-9._-]+)?|rc)$/i,
    layer: 'configuration',
    reason: 'config_or_doc_file',
  },
  {
    // Type-only contract modules are depended on by every layer, wherever they live.
    pattern: /(^|[\\/])(?:[^\\/]+\.)?types\.ts$/i,
    layer: 'shared',
    reason: 'type_contracts',
  },
  dirRule(
    'config|configs|settings|migrations|deploy|deployments|nginx|k8s',
    'configuration',
    'configuration_path'
  ),
  dirRule('scripts|\\.github|\\.husky', 'configuration', 'automation_scripts'),
  dirRule('test|__tests__|spec', 'configuration', 'test_or_support_path'),
  // Entry-point style folders own their templates and helpers, so they sit before the UI rules.
  dirRule(
    'setup|guard|cli|bootstrap|installers?|init|commands?|workflows?|pipelines?|jobs?|tasks?|runners?',
    'application',
    'application_entrypoint_path'
  ),
  dirRule(
    'components|views|pages|ui|screens|layouts|hooks|i18n|locales|handlers?|routers?|routes|endpoints|transport|rest|grpc|graphql|resolvers|middleware|templates',
    'presentation',
    'ui_layer'
  ),
  dirRule('assets|public|static', 'presentation', 'static_assets'),
  { pattern: /\.(css|scss|sass|less|styl)$/i, layer: 'presentation', reason: 'stylesheet_path' },
  dirRule('store|state|reducers|actions|context', 'state', 'state_management'),
  dirRule(
    'services?|usecases?|use_cases|interactors|application|features|controllers?',
    'application',
    'application_logic'
  ),
  dirRule('domain|models?|entit(?:y|ies)|dtos?|schemas?|core', 'domain', 'domain_logic'),
  dirRule(
    'infrastructure|db|database|api|clients?|repositor(?:y|ies)|repos?|dao|persistence|gateways?|storage|postgres|redis|mysql|mongo|cache|queues?|messaging|integration|bin|mcp',
    'integration',
    'infrastructure_integration'
  ),
  {
    pattern: /(^|[\\/])electron$|(^|[\\/])electron([\\/])[^\\/]+\.[A-Za-z0-9]+$/i,
    layer: 'integration',
    reason: 'electron_runtime_root',
  },
  {
    pattern: /(^|[\\/])(electron|main|preload|mcp)\.ts$/i,
    layer: 'integration',
    reason: 'entrypoint_or_adapter_path',
  },
  dirRule(
    'utils?|shared|helpers?|common|types|interfaces|pkg|lib|libs|support',
    'shared',
    'shared_utilities'
  ),
  { pattern: /\.d\.ts$/i, layer: 'shared', reason: 'type_declaration_path' },
  dirRule('analysis', 'analysis', 'analysis_path'),
  dirRule('parsing', 'parsing', 'parsing_path'),
  dirRule('oracle', 'application', 'orchestration_path'),
  // Fallbacks for conventions not covered above; they sit last so every rule above still wins.
  dirRule('resolution', 'application', 'resolution_pipeline'),
  dirRule(
    'extractors?|facts|catalogs?|policies|scoring|clones|detectors?|heuristics',
    'analysis',
    'analysis_support_path'
  ),
  {
    pattern: /(^|[\\/])(?:[^\\/]*[.-])?setup(?:tests?)?\.[cm]?[jt]sx?$/i,
    layer: 'configuration',
    reason: 'tooling_setup_file',
  },
  {
    pattern: /(^|[\\/])(?:app|main|index)\.[jt]sx$/i,
    layer: 'presentation',
    reason: 'ui_entrypoint',
  },
  {
    pattern: /\.(?:html?|png|jpe?g|gif|svg|ico|icns|webp|woff2?|ttf|otf)$/i,
    layer: 'presentation',
    reason: 'html_entry_or_root_asset',
  },
];

/**
 * Compiles a custom rule from the project config into a case-insensitive RegExp rule. Returns null
 * for patterns that are unsafe (catastrophic backtracking) or do not compile, so one bad rule
 * cannot hang indexing or break the rest.
 */
const toArchitectureRule = (rule: {
  pattern: string;
  layer: string;
  reason?: string;
}): ArchitectureRule | null => {
  // Patterns come from a project's checked-in .codemaps/architecture.json and are run
  // against every node path, so a catastrophically backtracking one would hang indexing.
  if (!safeRegex(rule.pattern)) {
    log.warn('[Architecture] Ignoring custom rule with unsafe pattern:', rule.pattern);
    return null;
  }

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

/**
 * Returns the rules to apply for a project: valid custom rules from its config placed before the
 * defaults, so they take priority while the defaults still cover everything else. Without usable
 * custom rules the defaults are returned.
 */
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
