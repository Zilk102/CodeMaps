/** Typed bundle of the analysis services that MCP tool registrations depend on. */

import { BlastRadiusAnalyzer } from '../analysis/BlastRadiusAnalyzer';
import { HealthScoreAnalyzer } from '../analysis/HealthScoreAnalyzer';
import { PatternDetectionAnalyzer } from '../analysis/PatternDetectionAnalyzer';
import { SecurityScanner } from '../analysis/SecurityScanner';
import { SignatureSearchService } from '../analysis/SignatureSearchService';
import { ArchitectureInsightService } from '../analysis/ArchitectureInsightService';
import { ChangeContextService } from '../analysis/ChangeContextService';
import { ReviewContextService } from '../analysis/ReviewContextService';
import { ProjectInsightService } from '../analysis/ProjectInsightService';
import { TaskIntelligenceService } from '../analysis/TaskIntelligenceService';
import { ChangeCampaignService } from '../analysis/ChangeCampaignService';
import { ServiceRegistry } from './ServiceRegistry';

/** The analysis services available to tool handlers, one field per registry entry created in `bootstrap.ts`. */
export interface McpToolContext {
  blastRadiusAnalyzer: BlastRadiusAnalyzer;
  healthScoreAnalyzer: HealthScoreAnalyzer;
  patternDetectionAnalyzer: PatternDetectionAnalyzer;
  securityScanner: SecurityScanner;
  signatureSearchService: SignatureSearchService;
  architectureInsightService: ArchitectureInsightService;
  changeContextService: ChangeContextService;
  reviewContextService: ReviewContextService;
  projectInsightService: ProjectInsightService;
  taskIntelligenceService: TaskIntelligenceService;
  changeCampaignService: ChangeCampaignService;
}

/** Looks every service up in `registry` and returns them as a typed context. Throws if one was not registered, so call it only after bootstrap registered them all. */
export const resolveMcpToolContext = (registry: ServiceRegistry): McpToolContext => ({
  blastRadiusAnalyzer: registry.get<BlastRadiusAnalyzer>('blastRadiusAnalyzer'),
  healthScoreAnalyzer: registry.get<HealthScoreAnalyzer>('healthScoreAnalyzer'),
  patternDetectionAnalyzer: registry.get<PatternDetectionAnalyzer>('patternDetectionAnalyzer'),
  securityScanner: registry.get<SecurityScanner>('securityScanner'),
  signatureSearchService: registry.get<SignatureSearchService>('signatureSearchService'),
  architectureInsightService: registry.get<ArchitectureInsightService>(
    'architectureInsightService'
  ),
  changeContextService: registry.get<ChangeContextService>('changeContextService'),
  reviewContextService: registry.get<ReviewContextService>('reviewContextService'),
  projectInsightService: registry.get<ProjectInsightService>('projectInsightService'),
  taskIntelligenceService: registry.get<TaskIntelligenceService>('taskIntelligenceService'),
  changeCampaignService: registry.get<ChangeCampaignService>('changeCampaignService'),
});
