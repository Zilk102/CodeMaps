import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { OracleService } from '../../oracle';
import { SecurityScanner } from '../SecurityScanner';
import { PatternDetectionAnalyzer } from '../PatternDetectionAnalyzer';
import { HealthScoreAnalyzer } from '../HealthScoreAnalyzer';
import { ArchitectureInsightService } from '../ArchitectureInsightService';
import { ChangeContextService } from '../ChangeContextService';
import { ProjectInsightService } from '../ProjectInsightService';
import { TaskIntelligenceService } from '../TaskIntelligenceService';
import { ChangeCampaignService } from '../ChangeCampaignService';
import { SignatureSearchService } from '../SignatureSearchService';
import { DecompositionGuidanceService } from '../DecompositionGuidanceService';
import { QualityGovernanceService } from '../QualityGovernanceService';
import { GraphData, oracleStore } from '../../store';
import { GraphBuilder } from '../../oracle/GraphBuilder';
import { getLanguageById } from '../../parsing/languageRegistry';
import { extractWithTypeScriptSemantic } from '../../parsing/extractors/typescriptSemanticExtractor';

describe('Analyzers (Zero Mock Policy)', () => {
  let testProjectDir: string;
  let graphData: GraphData;

  beforeAll(async () => {
    testProjectDir = path.join(os.tmpdir(), 'codemaps-analyzers-test');
    if (fs.existsSync(testProjectDir)) {
      fs.rmSync(testProjectDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testProjectDir, { recursive: true });

    // Create files that will trigger different analyzers
    
    // 1. A file with high fan-out (App.tsx depends on many)
    fs.writeFileSync(path.join(testProjectDir, 'App.tsx'), `
import { util1 } from './utils1';
import { util2 } from './utils2';
import { util3 } from './utils3';
import { util4 } from './utils4';
import { util5 } from './utils5';
import { util6 } from './utils6';
import { util7 } from './utils7';
import { util8 } from './utils8';
import { util9 } from './utils9';
import { util10 } from './utils10';
import { util11 } from './utils11';
import { util12 } from './utils12';
import { util13 } from './utils13';

export function App() {
  eval("console.log('danger')"); // triggers SecurityScanner dynamic_code_execution
  document.cookie = "token=secret; Secure; HttpOnly"; // use Secure Cookies instead of localStorage
  const t\u006Fken = "super_secret_token_123456789"; // triggers SecurityScanner hardcoded_secret
}
`);

    // Generate utils to be imported
    for (let i = 1; i <= 13; i++) {
      fs.writeFileSync(path.join(testProjectDir, `utils${i}.ts`), `export function util${i}() { return ${i}; }`);
    }

    const longMethodBody = Array.from(
      { length: 90 },
      (_, index) =>
        `    if (input > ${index}) {\n      total += input + ${index};\n    } else if (input === ${index}) {\n      total += ${index};\n    }`
    ).join('\n');
    const helperFunctions = Array.from(
      { length: 8 },
      (_, index) =>
        `export function helper${index + 1}(value: number) {\n  return value + ${index + 1};\n}\n`
    ).join('\n');
    const classMethods = Array.from(
      { length: 9 },
      (_, index) =>
        `  public step${index + 1}(value: number) {\n    return helper${(index % 8) + 1}(value);\n  }\n`
    ).join('\n');

    fs.writeFileSync(
      path.join(testProjectDir, 'MonsterService.ts'),
      `
import { util1 } from './utils1';
import { util2 } from './utils2';
import { util3 } from './utils3';
import { util4 } from './utils4';
import { util5 } from './utils5';
import { util6 } from './utils6';
import { util7 } from './utils7';
import { util8 } from './utils8';
import { util9 } from './utils9';
import { util10 } from './utils10';

${helperFunctions}

export class MonsterService {
${classMethods}

  public orchestrate(input: number) {
    let total = util1() + util2() + util3() + util4() + util5() + util6() + util7() + util8() + util9() + util10();
${longMethodBody}
    return total;
  }
}
`
    );

    fs.mkdirSync(path.join(testProjectDir, 'app', 'api', 'health'), { recursive: true });
    fs.writeFileSync(
      path.join(testProjectDir, 'app', 'layout.tsx'),
      'export default function RootLayout({ children }: { children: React.ReactNode }) { return children; }'
    );
    fs.writeFileSync(
      path.join(testProjectDir, 'app', 'page.tsx'),
      'export default function HomePage() { return <div>Home</div>; }'
    );
    fs.writeFileSync(
      path.join(testProjectDir, 'app', 'api', 'health', 'route.ts'),
      'export async function GET() { return Response.json({ ok: true }); }'
    );
    fs.writeFileSync(path.join(testProjectDir, 'vite.config.ts'), 'export default {};');

    // A secret file
    fs.writeFileSync(path.join(testProjectDir, 'secret.key'), 'super_secret_key_material');

    // A deeply nested structure
    const deepDir = path.join(testProjectDir, 'a', 'b', 'c', 'd', 'e', 'f');
    fs.mkdirSync(deepDir, { recursive: true });
    fs.writeFileSync(path.join(deepDir, 'deep.ts'), 'export const deep = true;');

    // Project manifests for stack detection
    fs.writeFileSync(
      path.join(testProjectDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test',
          packageManager: 'pnpm@10.0.0',
          dependencies: {
            react: '^19.0.0',
            next: '^15.0.0',
          },
          devDependencies: {
            vite: '^8.0.0',
          },
        },
        null,
        2
      )
    );

    const oracle = new OracleService();
    graphData = await oracle.analyzeProject(testProjectDir);
  });

  afterAll(() => {
    if (fs.existsSync(testProjectDir)) {
      fs.rmSync(testProjectDir, { recursive: true, force: true });
    }
  });

  it('SecurityScanner detects security issues', async () => {
    const scanner = new SecurityScanner();
    const result = await scanner.analyze(graphData);
    
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.some(f => f.ruleId === 'sensitive_file_name')).toBe(true);
    // Note: other regex-based file content scans aren't easily triggered via graphData nodes alone unless the scanner reads the files.
    // SecurityScanner reads file contents for node.type === 'file'
    expect(result.findings.some(f => f.ruleId === 'dynamic_code_execution')).toBe(true);
    expect(result.findings.some(f => f.ruleId === 'hardcoded_secret')).toBe(true);
  });

  it('PatternDetectionAnalyzer detects architectural patterns', () => {
    const analyzer = new PatternDetectionAnalyzer();
    const result = analyzer.analyze(graphData);
    
    expect(result.patterns.length).toBeGreaterThan(0);
    // App.tsx has 13 imports -> high fan-out
    expect(result.patterns.some(p => p.id === 'high_fan_out_files')).toBe(true);
    // The deep.ts file is nested 6 levels deep -> deep nesting
    expect(result.patterns.some(p => p.id === 'deep_nesting')).toBe(true);
    expect(result.patterns.some(p => p.id === 'god_classes')).toBe(true);
    expect(result.patterns.some(p => p.id === 'long_methods')).toBe(true);
    expect(result.patterns.some(p => p.id === 'complex_methods')).toBe(true);
    expect(result.patterns.some(p => p.id === 'mixed_responsibility_modules')).toBe(true);
    expect(
      result.patterns
        .filter((p) => ['god_classes', 'long_methods', 'complex_methods'].includes(p.id))
        .some((pattern) => (pattern.evidence?.length || 0) > 0)
    ).toBe(true);
    expect(
      result.patterns
        .flatMap((pattern) => pattern.evidence || [])
        .some((item) => item.message.includes('L'))
    ).toBe(true);
  });

  it('HealthScoreAnalyzer calculates health score and identifies issues', () => {
    const analyzer = new HealthScoreAnalyzer();
    const result = analyzer.analyze(graphData);
    
    expect(result.score).toBeDefined();
    expect(typeof result.score).toBe('number');
    expect(result.grade).toBeDefined();
    expect(result.issues).toBeInstanceOf(Array);
    expect(result.summary.totalNodes).toBeGreaterThan(0);
    expect(result.summary.godClasses).toBeGreaterThan(0);
    expect(result.summary.longMethods).toBeGreaterThan(0);
    expect(result.summary.complexMethods).toBeGreaterThan(0);
    expect(result.summary.mixedResponsibilityModules).toBeGreaterThan(0);
    expect(result.summary.avgDesignSmellScore).toBeGreaterThan(0);
    expect(result.summary.maintainabilityScore).toBeGreaterThanOrEqual(0);
    expect(result.summary.solidScore).toBeGreaterThanOrEqual(0);
    expect(result.issues.some(issue => issue.code === 'god_classes')).toBe(true);
    expect(result.issues.some(issue => issue.code === 'long_methods')).toBe(true);
    expect(result.issues.some(issue => issue.code === 'complex_methods')).toBe(true);
    expect(result.issues.some(issue => issue.code === 'mixed_responsibility_modules')).toBe(true);
    expect(
      result.issues.some((issue) =>
        ['maintainability_score', 'solid_score'].includes(issue.code)
      )
    ).toBe(true);
  });

  it('DecompositionGuidanceService produces ranked extraction candidates', () => {
    const service = new DecompositionGuidanceService();
    const result = service.prepareGuidance(graphData, { limit: 10 });

    expect(result.summary.candidateCount).toBeGreaterThan(0);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.some((candidate) => candidate.targetType === 'class')).toBe(true);
    expect(result.candidates.some((candidate) => candidate.targetType === 'method')).toBe(true);
    expect(
      result.candidates.some(
        (candidate) =>
          Boolean(candidate.lineRange) &&
          (candidate.action === 'extract_class' || candidate.action === 'reduce_complexity')
      )
    ).toBe(true);
  });

  it('GraphBuilder preserves symbol-level source locations from parser output', () => {
    const filePath = path.join(testProjectDir, 'MonsterService.ts').replace(/\\/g, '/');
    const text = fs.readFileSync(path.join(testProjectDir, 'MonsterService.ts'), 'utf-8');
    const definition = getLanguageById('typescript');
    expect(definition).toBeDefined();

    const result = extractWithTypeScriptSemantic(filePath, text, definition!, undefined, testProjectDir);
    const graphBuilder = new GraphBuilder();
    const store = oracleStore.getState();
    store.clear();
    store.setBaseDir(testProjectDir.replace(/\\/g, '/'));
    graphBuilder.applyParsedFile(filePath, testProjectDir, 1, result);

    const directGraph = store.getValidGraph();
    const classNode = directGraph.nodes.find((node) => node.id.endsWith('MonsterService.ts#MonsterService'));
    const methodNode = directGraph.nodes.find((node) => node.id.endsWith('MonsterService.ts#orchestrate'));
    const fileNode = directGraph.nodes.find((node) => node.id.endsWith('MonsterService.ts'));

    expect(classNode?.sourceLocation?.startLine).toBeGreaterThan(0);
    expect(classNode?.sourceLocation?.endLine).toBeGreaterThanOrEqual(
      classNode?.sourceLocation?.startLine || 0
    );
    expect(methodNode?.sourceLocation?.startLine).toBeGreaterThan(0);
    expect(methodNode?.sourceLocation?.startColumn).toBeGreaterThan(0);
    expect(fileNode?.language).toBe('typescript');
  });

  it('QualityGovernanceService builds quality budget and refactoring waves', () => {
    const decompositionGuidance = new DecompositionGuidanceService().prepareGuidance(graphData, {
      limit: 10,
    });
    const patterns = new PatternDetectionAnalyzer().analyze(graphData).patterns;
    const health = new HealthScoreAnalyzer().analyze(graphData);
    const governance = new QualityGovernanceService();

    const budget = governance.buildBudget({
      health,
      patterns,
      decompositionGuidance,
    });
    const waves = governance.buildRefactoringWaves(graphData, decompositionGuidance, 3);
    const dashboard = governance.buildDashboard(budget, decompositionGuidance, waves);

    expect(budget.overallScore).toBeGreaterThanOrEqual(0);
    expect(['healthy', 'warning', 'critical']).toContain(budget.overallStatus);
    expect(budget.dimensions.some((dimension) => dimension.name === 'maintainability')).toBe(true);
    expect(waves.length).toBeGreaterThan(0);
    expect(waves.some((wave) => wave.title.includes('Boundary'))).toBe(true);
    expect(waves.every((wave) => Array.isArray(wave.exitCriteria))).toBe(true);
    expect(dashboard.gates.length).toBeGreaterThan(0);
    expect(dashboard.focusCandidates.length).toBeGreaterThan(0);
  });

  it('ArchitectureInsightService classifies layers and generates overview', () => {
    const service = new ArchitectureInsightService();
    const result = service.analyze(graphData);
    
    expect(result.layers).toBeDefined();
    expect(result.classifications.length).toBeGreaterThan(0);
    expect(result.summary.classifiedNodes).toBe(graphData.nodes.length);
  });

  it('SignatureSearchService finds code signatures', async () => {
    const service = new SignatureSearchService();
    const result = await service.search(graphData, 'util1', { limit: 10, caseSensitive: false, regex: false });
    
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0].nodeId).toBeDefined();
    expect(result.matches[0].preview).toContain('util1');
  });

  it('ChangeContextService prepares change context', async () => {
    const service = new ChangeContextService();
    const result = await service.prepareChangeContext(graphData, {
      target: 'App.tsx',
      changeIntent: 'Fix security issues',
      taskMode: 'bugfix'
    });
    
    expect(result.target.node).toBeDefined();
    expect(result.target.node.label).toBe('App.tsx');
    expect(result.taskMode).toBe('bugfix');
    expect(result.changeIntent).toBe('Fix security issues');
  });

  it('ProjectInsightService prepares high-level project context', async () => {
    const service = new ProjectInsightService();
    const result = await service.prepareContext(graphData, { 
      limit: 10, 
      includeClassifications: true, 
      includeSecurityFindings: true 
    });
    
    expect(result.graphSummary).toBeDefined();
    expect(result.projectProfile).toBeDefined();
    expect(result.projectProfile.languageSupportSummary.length).toBeGreaterThan(0);
    expect(
      result.projectProfile.languageSupportSummary.some(
        (entry) => entry.id === 'typescript' && entry.supportTier === 'semantic'
      )
    ).toBe(true);
    expect(
      result.projectProfile.stackProfile.packageManagers.some((entry) => entry.id === 'pnpm')
    ).toBe(true);
    expect(
      result.projectProfile.stackProfile.buildSystems.some((entry) => entry.id === 'vite')
    ).toBe(true);
    expect(
      result.projectProfile.stackProfile.frameworks.some((entry) => entry.id === 'react')
    ).toBe(true);
    expect(
      result.projectProfile.stackProfile.frameworks.some((entry) => entry.id === 'nextjs')
    ).toBe(true);
    expect(result.projectProfile.stackTopology.frameworkInsights.length).toBeGreaterThan(0);
    expect(result.projectProfile.stackTopology.buildInsights.length).toBeGreaterThan(0);
    expect(
      result.projectProfile.stackTopology.frameworkInsights.some(
        (entry) =>
          entry.adapterId === 'nextjs-topology' &&
          entry.routes.some((route) => route === 'app/page.tsx') &&
          entry.modules.some((route) => route === 'app/api/health/route.ts')
      )
    ).toBe(true);
    expect(
      result.projectProfile.stackTopology.buildInsights.some(
        (entry) =>
          entry.adapterId === 'vite-build-topology' &&
          entry.configFiles.some((file) => file === 'vite.config.ts')
      )
    ).toBe(true);
    expect(result.architecture).toBeDefined();
    expect(result.security).toBeDefined();
    expect(result.qualityBudget).toBeDefined();
    expect(result.qualityDashboard).toBeDefined();
    expect(result.refactoringWaves.length).toBeGreaterThan(0);
    expect(result.decompositionGuidance.candidates.length).toBeGreaterThan(0);
    expect(result.operationalTelemetry.watcher.flushCount).toBeGreaterThanOrEqual(0);
    expect(result.operationalTelemetry.enrichment.rebuiltRefreshes).toBeGreaterThanOrEqual(0);
  });

  it('TaskIntelligenceService infers task intent and plans route', async () => {
    const service = new TaskIntelligenceService();
    const result = await service.prepareContext(graphData, {
      userRequest: 'We need to migrate App.tsx to use HTTP-only cookies instead of localStorage',
    });
    
    expect(result.inferredIntent).toBeDefined();
    expect(['bugfix', 'refactor', 'security']).toContain(result.inferredIntent.taskKind);
    expect(result.route.initialTool).toBe('prepare_task_context');
    expect(result.route.selectedCompositeTool).toBeDefined();
  });

  it('ChangeCampaignService plans a large-scale refactor campaign', async () => {
    const service = new ChangeCampaignService();
    const result = await service.prepareContext(graphData, {
      userRequest: 'Remove all local storage usage',
      candidateQueries: ['localStorage'],
    });
    
    expect(result.scope.seedTargets.length).toBeGreaterThanOrEqual(0);
    expect(result.executionPlan.waves).toBeInstanceOf(Array);
    expect(result.executionPlan.refactoringWaves.length).toBeGreaterThanOrEqual(0);
    expect(result.qualityBudget).toBeDefined();
    expect(result.qualityDashboard).toBeDefined();
    expect(result.executionPlan.preferredExecutionMode).toBe('multi_target_campaign');
  });
});
