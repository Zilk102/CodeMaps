import { describe, expect, it } from 'vitest';
import { GraphData } from '../../store';
import { ArchitectureInsightService } from '../ArchitectureInsightService';
import { BlastRadiusAnalyzer } from '../BlastRadiusAnalyzer';
import { ChangeCampaignService } from '../ChangeCampaignService';
import { ChangeContextService } from '../ChangeContextService';
import { HealthScoreAnalyzer } from '../HealthScoreAnalyzer';
import { PatternDetectionAnalyzer } from '../PatternDetectionAnalyzer';
import { ProjectInsightService } from '../ProjectInsightService';
import { ReviewContextService } from '../ReviewContextService';
import { TaskIntelligenceService } from '../TaskIntelligenceService';

const projectRoot = 'd:/virtual/polyglot-app';

const graphData: GraphData = {
  projectRoot,
  nodes: [
    {
      id: `${projectRoot}/vite.config.ts`,
      label: 'vite.config.ts',
      type: 'file',
      group: 1,
      churn: 1,
      parentId: projectRoot,
    },
    {
      id: `${projectRoot}/src/components/App.tsx`,
      label: 'App.tsx',
      type: 'file',
      group: 1,
      churn: 2,
      parentId: `${projectRoot}/src/components`,
    },
    {
      id: `${projectRoot}/src/components/Layout.tsx`,
      label: 'Layout.tsx',
      type: 'file',
      group: 1,
      churn: 2,
      parentId: `${projectRoot}/src/components`,
    },
    {
      id: `${projectRoot}/src/components/Page.tsx`,
      label: 'Page.tsx',
      type: 'file',
      group: 1,
      churn: 3,
      parentId: `${projectRoot}/src/components`,
    },
    {
      id: `${projectRoot}/src/components/RouteA.tsx`,
      label: 'RouteA.tsx',
      type: 'file',
      group: 1,
      churn: 1,
      parentId: `${projectRoot}/src/components`,
    },
    {
      id: `${projectRoot}/src/components/RouteB.tsx`,
      label: 'RouteB.tsx',
      type: 'file',
      group: 1,
      churn: 1,
      parentId: `${projectRoot}/src/components`,
    },
    {
      id: `${projectRoot}/src/services/DataService.ts`,
      label: 'DataService.ts',
      type: 'file',
      group: 1,
      churn: 4,
      parentId: `${projectRoot}/src/services`,
    },
    {
      id: `${projectRoot}/src/backend/Program.cs`,
      label: 'Program.cs',
      type: 'file',
      group: 1,
      churn: 1,
      parentId: `${projectRoot}/src/backend`,
    },
    {
      id: `${projectRoot}/src/backend/IUserService.cs`,
      label: 'IUserService.cs',
      type: 'file',
      group: 1,
      churn: 1,
      parentId: `${projectRoot}/src/backend`,
    },
    {
      id: `${projectRoot}/src/backend/UserService.cs`,
      label: 'UserService.cs',
      type: 'file',
      group: 1,
      churn: 2,
      parentId: `${projectRoot}/src/backend`,
    },
  ],
  links: [
    {
      source: `${projectRoot}/vite.config.ts`,
      target: `${projectRoot}/src/components/App.tsx`,
      value: 1,
      type: 'build',
      reason: 'vite_config_entry',
    },
    {
      source: `${projectRoot}/src/components/Layout.tsx`,
      target: `${projectRoot}/src/components/Page.tsx`,
      value: 1,
      type: 'framework',
      reason: 'nextjs_layout_route',
    },
    {
      source: `${projectRoot}/src/components/Layout.tsx`,
      target: `${projectRoot}/src/components/RouteA.tsx`,
      value: 1,
      type: 'framework',
      reason: 'nextjs_layout_route',
    },
    {
      source: `${projectRoot}/src/components/Layout.tsx`,
      target: `${projectRoot}/src/components/RouteB.tsx`,
      value: 1,
      type: 'framework',
      reason: 'nextjs_layout_route',
    },
    {
      source: `${projectRoot}/src/components/Layout.tsx`,
      target: `${projectRoot}/src/components/App.tsx`,
      value: 1,
      type: 'framework',
      reason: 'nextjs_route_handler',
    },
    {
      source: `${projectRoot}/src/backend/Program.cs`,
      target: `${projectRoot}/src/backend/IUserService.cs`,
      value: 1,
      type: 'framework',
      reason: 'aspnet_service_contract',
    },
    {
      source: `${projectRoot}/src/backend/Program.cs`,
      target: `${projectRoot}/src/backend/UserService.cs`,
      value: 1,
      type: 'framework',
      reason: 'aspnet_service_registration',
    },
    {
      source: `${projectRoot}/src/components/App.tsx`,
      target: `${projectRoot}/src/services/DataService.ts`,
      value: 1,
      type: 'import',
    },
  ],
  refreshTelemetry: {
    watcher: {
      flushCount: 3,
      batchedEventCount: 5,
      coalescedFlushes: 1,
      maxBatchSize: 2,
      lastBatchSize: 2,
      lastEvent: 'change',
      recentBatchSizes: [1, 1, 2, 2, 3],
    },
    enrichment: {
      skippedRefreshes: 1,
      rebuiltRefreshes: 2,
      runtimePriorityRebuilds: 1,
      directoryTriggeredRebuilds: 0,
      avgRefreshLatencyMs: 18,
      lastRefreshMode: 'rebuilt',
      lastRefreshReason: 'stack_runtime_path_changed',
      recentLatencyMs: [12, 14, 18, 21, 26],
      recentModes: ['rebuilt', 'rebuilt', 'skipped', 'rebuilt', 'rebuilt'],
    },
    trends: {
      watcher: {
        coalescingRatio: 1 / 3,
        batchSizeTrend: 'improving',
      },
      enrichment: {
        skipRate: 1 / 3,
        runtimePriorityRate: 1 / 3,
        latencyTrend: 'degrading',
        degraded: true,
      },
    },
  },
};

const contractProjectRoot = 'd:/virtual/contracts-app';

const contractGraphData: GraphData = {
  projectRoot: contractProjectRoot,
  nodes: [
    {
      id: `${contractProjectRoot}/contracts/openapi.yaml`,
      label: 'openapi.yaml',
      type: 'file',
      group: 1,
      churn: 1,
      parentId: `${contractProjectRoot}/contracts`,
    },
    {
      id: `${contractProjectRoot}/src/generated/openapi/client.ts`,
      label: 'client.ts',
      type: 'file',
      group: 1,
      churn: 1,
      parentId: `${contractProjectRoot}/src/generated/openapi`,
    },
    {
      id: `${contractProjectRoot}/src/generated/openapi/client.ts#listUsers`,
      label: 'listUsers',
      type: 'function',
      group: 1,
      churn: 1,
      parentId: `${contractProjectRoot}/src/generated/openapi/client.ts`,
    },
    {
      id: `${contractProjectRoot}/src/handlers/users.ts`,
      label: 'users.ts',
      type: 'file',
      group: 1,
      churn: 2,
      parentId: `${contractProjectRoot}/src/handlers`,
    },
    {
      id: `${contractProjectRoot}/src/handlers/users.ts#listUsers`,
      label: 'listUsers',
      type: 'function',
      group: 1,
      churn: 2,
      parentId: `${contractProjectRoot}/src/handlers/users.ts`,
    },
    {
      id: `${contractProjectRoot}/proto/user.proto`,
      label: 'user.proto',
      type: 'file',
      group: 1,
      churn: 1,
      parentId: `${contractProjectRoot}/proto`,
    },
    {
      id: `${contractProjectRoot}/gen/ts/user.connect.ts`,
      label: 'user.connect.ts',
      type: 'file',
      group: 1,
      churn: 1,
      parentId: `${contractProjectRoot}/gen/ts`,
    },
    {
      id: `${contractProjectRoot}/gen/ts/user.connect.ts#UserService`,
      label: 'UserService',
      type: 'class',
      group: 1,
      churn: 1,
      parentId: `${contractProjectRoot}/gen/ts/user.connect.ts`,
    },
    {
      id: `${contractProjectRoot}/src/clients/connectClient.ts`,
      label: 'connectClient.ts',
      type: 'file',
      group: 1,
      churn: 2,
      parentId: `${contractProjectRoot}/src/clients`,
    },
    {
      id: `${contractProjectRoot}/src/clients/connectClient.ts#client`,
      label: 'client',
      type: 'function',
      group: 1,
      churn: 2,
      parentId: `${contractProjectRoot}/src/clients/connectClient.ts`,
    },
    {
      id: `${contractProjectRoot}/grpc_server.go`,
      label: 'grpc_server.go',
      type: 'file',
      group: 1,
      churn: 2,
      parentId: contractProjectRoot,
    },
    {
      id: `${contractProjectRoot}/grpc_server.go#startGrpc`,
      label: 'startGrpc',
      type: 'function',
      group: 1,
      churn: 2,
      parentId: `${contractProjectRoot}/grpc_server.go`,
    },
  ],
  links: [
    {
      source: `${contractProjectRoot}/contracts/openapi.yaml`,
      target: `${contractProjectRoot}/src/generated/openapi/client.ts#listUsers`,
      value: 1,
      type: 'build',
      reason: 'openapi_operation_symbol',
    },
    {
      source: `${contractProjectRoot}/contracts/openapi.yaml`,
      target: `${contractProjectRoot}/src/handlers/users.ts#listUsers`,
      value: 1,
      type: 'framework',
      reason: 'openapi_operation_runtime_binding',
    },
    {
      source: `${contractProjectRoot}/proto/user.proto`,
      target: `${contractProjectRoot}/gen/ts/user.connect.ts#UserService`,
      value: 1,
      type: 'build',
      reason: 'proto_service_symbol',
    },
    {
      source: `${contractProjectRoot}/proto/user.proto`,
      target: `${contractProjectRoot}/src/clients/connectClient.ts#client`,
      value: 1,
      type: 'framework',
      reason: 'connectrpc_client_symbol',
    },
    {
      source: `${contractProjectRoot}/proto/user.proto`,
      target: `${contractProjectRoot}/grpc_server.go#startGrpc`,
      value: 1,
      type: 'framework',
      reason: 'proto_server_symbol',
    },
  ],
};

const smellProjectRoot = 'd:/virtual/smell-app';
const oversizedModuleFile = `${smellProjectRoot}/src/analysis/StackTopologyService.ts`;
const oversizedModuleChildren = Array.from({ length: 32 }, (_, index) => ({
  id: `${oversizedModuleFile}#symbol${index + 1}`,
  label: `symbol${index + 1}`,
  type: (index % 4 === 0 ? 'class' : 'function') as 'class' | 'function',
  group: 1,
  churn: 1,
  parentId: oversizedModuleFile,
}));
const oversizedModuleDependencies = Array.from({ length: 12 }, (_, index) => ({
  id: `${smellProjectRoot}/src/adapters/Adapter${index + 1}.ts`,
  label: `Adapter${index + 1}.ts`,
  type: 'file' as const,
  group: 1,
  churn: 2,
  parentId: `${smellProjectRoot}/src/adapters`,
}));

const smellGraphData: GraphData = {
  projectRoot: smellProjectRoot,
  nodes: [
    {
      id: oversizedModuleFile,
      label: 'StackTopologyService.ts',
      type: 'file',
      group: 1,
      churn: 12,
      parentId: `${smellProjectRoot}/src/analysis`,
    },
    ...oversizedModuleChildren,
    ...oversizedModuleDependencies,
  ],
  links: oversizedModuleDependencies.map((node, index) => ({
    source: oversizedModuleFile,
    target: node.id,
    value: 1,
    type: index % 2 === 0 ? 'framework' : 'import',
    reason: index % 2 === 0 ? 'stack_adapter_path' : undefined,
  })),
};

describe('Stack-aware analyzers', () => {
  it('BlastRadiusAnalyzer follows framework/build links as architectural dependencies', () => {
    const analyzer = new BlastRadiusAnalyzer();

    const pageBlastRadius = analyzer.analyze(graphData, `${projectRoot}/src/components/Page.tsx`);
    expect(pageBlastRadius.affectedNodes.some((node) => node.id.endsWith('/Layout.tsx'))).toBe(true);
    expect(pageBlastRadius.confidence).toBe('high');

    const appBlastRadius = analyzer.analyze(graphData, `${projectRoot}/src/components/App.tsx`);
    expect(appBlastRadius.affectedNodes.some((node) => node.id.endsWith('/vite.config.ts'))).toBe(true);
  });

  it('Architecture and health analyzers account for stack-aware links', () => {
    const architecture = new ArchitectureInsightService().analyze(graphData);
    const health = new HealthScoreAnalyzer().analyze(graphData);

    expect(
      architecture.dependencies.some(
        (entry) => entry.sourceLayer === 'configuration' && entry.targetLayer === 'presentation'
      )
    ).toBe(true);
    expect(health.summary.stackAwareLinks).toBe(7);
    expect(health.summary.diRuntimeLinks).toBe(2);
    expect(health.summary.watcherCoalescedFlushes).toBe(1);
    expect(health.summary.skippedRefreshes).toBe(1);
    expect(health.summary.runtimePriorityRebuilds).toBe(1);
    expect(health.summary.refreshSkipRate).toBeCloseTo(1 / 3, 5);
    expect(health.summary.refreshLatencyTrend).toBe('degrading');
    expect(health.summary.refreshPipelineDegraded).toBe(true);
    expect(health.issues.some((issue) => issue.code === 'refresh_pipeline_degradation')).toBe(true);
  });

  it('Pattern detection and review context surface stack-aware runtime paths', async () => {
    const patterns = new PatternDetectionAnalyzer().analyze(graphData);
    expect(patterns.patterns.some((pattern) => pattern.id === 'stack_orchestration_hubs')).toBe(true);
    expect(patterns.patterns.some((pattern) => pattern.id === 'di_runtime_contract_hubs')).toBe(true);

    const reviewContext = await new ReviewContextService().prepareReviewContext(graphData, {
      includeSecurityFindings: false,
      taskMode: 'architecture',
    });

    expect(
      reviewContext.reviewPriorities.some((priority) => priority.title === 'Stack-Aware Runtime Paths')
    ).toBe(true);
    expect(
      reviewContext.reviewPriorities.some((priority) => priority.title === 'DI Runtime Contracts')
    ).toBe(true);
    expect(
      reviewContext.reviewPriorities.some(
        (priority) => priority.title === 'Incremental Refresh Pipeline'
      )
    ).toBe(true);
    expect(
      reviewContext.nextSteps.some((step) => step.includes('framework/build dependency paths'))
    ).toBe(true);
    expect(
      reviewContext.nextSteps.some((step) => step.includes('Inspect DI runtime contracts separately'))
    ).toBe(true);
    expect(
      reviewContext.nextSteps.some((step) => step.includes('incremental refresh telemetry'))
    ).toBe(true);
  });

  it('Project insight surfaces runtime composition roots and DI workflows', async () => {
    const projectInsight = await new ProjectInsightService().prepareContext(graphData, {
      includeSecurityFindings: false,
      limit: 10,
    });

    expect(
      projectInsight.mentalModel.runtimeCompositionRoots.some((node) => node.id.endsWith('/Program.cs'))
    ).toBe(true);
    expect(
      projectInsight.autopilotPlan.recommendedStartingNodes.some((nodeId) => nodeId.endsWith('/Program.cs'))
    ).toBe(true);
    expect(
      projectInsight.mentalModel.likelyWorkflows.some((workflow) => workflow.includes('Runtime DI contracts'))
    ).toBe(true);
    expect(
      projectInsight.nextSteps.some((step) => step.includes('runtime composition roots'))
    ).toBe(true);
    expect(projectInsight.operationalTelemetry.watcher.coalescedFlushes).toBe(1);
    expect(projectInsight.operationalTelemetry.enrichment.runtimePriorityRebuilds).toBe(1);
    expect(
      projectInsight.nextSteps.some((step) => step.includes('watcher batching metrics'))
    ).toBe(true);
  });

  it('Change context surfaces DI runtime contracts in risks and inspection plan', async () => {
    const changeContext = await new ChangeContextService().prepareChangeContext(graphData, {
      target: 'Program.cs',
      taskMode: 'refactor',
      includeSecurityFindings: false,
    });

    expect(changeContext.dependencies.runtimeContractLinks).toHaveLength(2);
    expect(
      changeContext.dependencies.runtimeContractNodes.some((node) => node.id.endsWith('/IUserService.cs'))
    ).toBe(true);
    expect(
      changeContext.recommendedFilesToInspect.some((fileId) => fileId.endsWith('/UserService.cs'))
    ).toBe(true);
    expect(
      changeContext.risks.some((risk) => risk.includes('runtime DI wiring'))
    ).toBe(true);
    expect(
      changeContext.nextSteps.some((step) => step.includes('Inspect DI runtime contracts separately'))
    ).toBe(true);
    expect(changeContext.autopilotPlan.preferredNextAction).toBe('review_dependencies');
  });

  it('Change campaign treats runtime composition roots as first-class campaign scope', async () => {
    const campaign = await new ChangeCampaignService().prepareContext(graphData, {
      userRequest: 'Refactor DI wiring for user services',
      candidateQueries: ['Program', 'UserService'],
      taskMode: 'refactor',
      includeSecurityFindings: false,
      depth: 2,
      maxFiles: 10,
    });

    expect(
      campaign.scope.runtimeCompositionRoots.some((node) => node.id.endsWith('/Program.cs'))
    ).toBe(true);
    expect(
      campaign.executionPlan.waves.some(
        (wave) =>
          wave.title === 'Wave 0: Runtime Contracts' &&
          wave.fileIds.some((fileId) => fileId.endsWith('/Program.cs'))
      )
    ).toBe(true);
    expect(
      campaign.risks.some((risk) => risk.includes('runtime composition roots'))
    ).toBe(true);
    expect(
      campaign.nextSteps.some((step) => step.includes('runtime composition roots'))
    ).toBe(true);
    expect(campaign.executionPlan.shouldFallbackToLowLevelTools).toBe(false);
  });

  it('Task intelligence routes focused DI changes to change context', async () => {
    const taskContext = await new TaskIntelligenceService().prepareContext(graphData, {
      userRequest: 'Refactor DI registration in Program.cs for IUserService',
      includeSecurityFindings: false,
      limit: 10,
    });

    expect(taskContext.route.selectedCompositeTool).toBe('prepare_change_context');
    expect(taskContext.selectedContext?.kind).toBe('change');
    expect(taskContext.focus.targetCandidates.some((node) => node.id.endsWith('/Program.cs'))).toBe(true);
    expect(
      taskContext.nextSteps.some((step) => step.includes('runtime DI wiring'))
    ).toBe(true);
  });

  it('Task intelligence routes broad DI rewiring to campaign context', async () => {
    const taskContext = await new TaskIntelligenceService().prepareContext(graphData, {
      userRequest: 'Refactor provider bindings and service registrations across user services',
      includeSecurityFindings: false,
      limit: 10,
    });

    expect(taskContext.route.selectedCompositeTool).toBe('prepare_change_campaign');
    expect(taskContext.selectedContext?.kind).toBe('campaign');
    expect(
      taskContext.nextSteps.some((step) => step.includes('runtime composition roots'))
    ).toBe(true);
    expect(
      taskContext.selectedContext?.kind === 'campaign' &&
        taskContext.selectedContext.context.scope.runtimeCompositionRoots.some((node) =>
          node.id.endsWith('/Program.cs')
        )
    ).toBe(true);
  });

  it('Task intelligence routes refresh-pipeline degradation to review context', async () => {
    const taskContext = await new TaskIntelligenceService().prepareContext(graphData, {
      userRequest: 'Review watcher batching and incremental refresh latency in the pipeline',
      includeSecurityFindings: false,
      limit: 10,
    });

    expect(taskContext.route.selectedCompositeTool).toBe('prepare_review_context');
    expect(taskContext.selectedContext?.kind).toBe('review');
    expect(taskContext.route.rationale).toContain('incremental refresh behavior');
    expect(
      taskContext.selectedContext?.kind === 'review' &&
        taskContext.selectedContext.context.reviewPriorities.some(
          (priority) => priority.title === 'Incremental Refresh Pipeline'
        )
    ).toBe(true);
    expect(
      taskContext.nextSteps.some((step) => step.includes('watcher batching'))
    ).toBe(true);
  });

  it('Contract-aware analyzers surface OpenAPI/proto runtime bindings in review, project, and change contexts', async () => {
    const health = new HealthScoreAnalyzer().analyze(contractGraphData);
    expect(health.summary.contractSemanticLinks).toBe(5);

    const patterns = new PatternDetectionAnalyzer().analyze(contractGraphData);
    expect(
      patterns.patterns.some((pattern) => pattern.id === 'contract_runtime_binding_hubs')
    ).toBe(true);

    const reviewContext = await new ReviewContextService().prepareReviewContext(contractGraphData, {
      includeSecurityFindings: false,
      taskMode: 'architecture',
    });
    expect(
      reviewContext.reviewPriorities.some(
        (priority) => priority.title === 'Contract Runtime Bindings'
      )
    ).toBe(true);
    expect(
      reviewContext.nextSteps.some((step) =>
        step.includes('Inspect API contract bindings separately')
      )
    ).toBe(true);

    const projectInsight = await new ProjectInsightService().prepareContext(contractGraphData, {
      includeSecurityFindings: false,
      limit: 10,
    });
    expect(
      projectInsight.mentalModel.contractSurfaces.some((node) =>
        node.id.endsWith('/contracts/openapi.yaml')
      )
    ).toBe(true);
    expect(
      projectInsight.mentalModel.contractSurfaces.some((node) => node.id.endsWith('/proto/user.proto'))
    ).toBe(true);
    expect(
      projectInsight.mentalModel.likelyWorkflows.some((workflow) =>
        workflow.includes('API contract -> generated/runtime')
      )
    ).toBe(true);
    expect(
      projectInsight.nextSteps.some((step) => step.includes('API contract surfaces'))
    ).toBe(true);

    const changeContext = await new ChangeContextService().prepareChangeContext(contractGraphData, {
      target: 'user.proto',
      taskMode: 'refactor',
      includeSecurityFindings: false,
    });
    expect(changeContext.dependencies.contractBindingLinks).toHaveLength(3);
    expect(
      changeContext.dependencies.contractBindingNodes.some((node) =>
        node.id.endsWith('/src/clients/connectClient.ts')
      )
    ).toBe(true);
    expect(
      changeContext.recommendedFilesToInspect.some((fileId) => fileId.endsWith('/grpc_server.go'))
    ).toBe(true);
    expect(
      changeContext.risks.some((risk) => risk.includes('API contract/runtime bindings'))
    ).toBe(true);
    expect(
      changeContext.nextSteps.some((step) =>
        step.includes('Inspect API contract bindings separately')
      )
    ).toBe(true);
    expect(changeContext.autopilotPlan.preferredNextAction).toBe('review_dependencies');

    const taskContext = await new TaskIntelligenceService().prepareContext(contractGraphData, {
      userRequest: 'Update user.proto contract and bound ConnectRPC client implementation',
      includeSecurityFindings: false,
      limit: 10,
    });
    expect(taskContext.route.selectedCompositeTool).toBe('prepare_change_context');
    expect(taskContext.selectedContext?.kind).toBe('change');
    expect(
      taskContext.route.rationale.includes('API contract/runtime bindings')
    ).toBe(true);
    expect(
      taskContext.nextSteps.some((step) =>
        step.includes('schema roots, generated modules, and bound handlers/clients')
      )
    ).toBe(true);
  });

  it('Architectural smell analyzers surface oversized modules and god files', async () => {
    const health = new HealthScoreAnalyzer().analyze(smellGraphData);
    expect(health.summary.oversizedModules).toBe(1);
    expect(health.summary.godFiles).toBe(1);
    expect(health.issues.some((issue) => issue.code === 'oversized_modules')).toBe(true);
    expect(health.issues.some((issue) => issue.code === 'god_files')).toBe(true);

    const patterns = new PatternDetectionAnalyzer().analyze(smellGraphData);
    expect(patterns.patterns.some((pattern) => pattern.id === 'oversized_modules')).toBe(true);
    expect(patterns.patterns.some((pattern) => pattern.id === 'god_files')).toBe(true);

    const reviewContext = await new ReviewContextService().prepareReviewContext(smellGraphData, {
      includeSecurityFindings: false,
      taskMode: 'architecture',
    });
    expect(
      reviewContext.reviewPriorities.some((priority) => priority.title === 'Oversized Modules')
    ).toBe(true);
    expect(
      reviewContext.nextSteps.some((step) => step.includes('Inspect oversized modules separately'))
    ).toBe(true);

    const projectInsight = await new ProjectInsightService().prepareContext(smellGraphData, {
      includeSecurityFindings: false,
      limit: 10,
    });
    expect(
      projectInsight.nextSteps.some((step) => step.includes('Prioritize decomposition of oversized modules'))
    ).toBe(true);

    const changeContext = await new ChangeContextService().prepareChangeContext(smellGraphData, {
      target: 'StackTopologyService',
      taskMode: 'refactor',
      includeSecurityFindings: false,
    });
    expect(
      changeContext.risks.some((risk) => risk.includes('oversized or god-file module'))
    ).toBe(true);
    expect(
      changeContext.nextSteps.some((step) =>
        step.includes('prefer extracting responsibilities')
      )
    ).toBe(true);

    const campaign = await new ChangeCampaignService().prepareContext(smellGraphData, {
      userRequest: 'Refactor StackTopologyService adapter orchestration',
      candidateQueries: ['StackTopologyService'],
      taskMode: 'refactor',
      includeSecurityFindings: false,
      depth: 2,
      maxFiles: 10,
    });
    expect(
      campaign.risks.some((risk) => risk.includes('oversized/god modules'))
    ).toBe(true);
    expect(
      campaign.nextSteps.some((step) => step.includes('extraction boundaries'))
    ).toBe(true);
  });
});
