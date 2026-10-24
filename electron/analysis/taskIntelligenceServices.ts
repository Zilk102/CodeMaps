/** Default wiring of the context services that task routing delegates to. */
import { ChangeCampaignService } from './ChangeCampaignService';
import { ChangeContextService } from './ChangeContextService';
import { ProjectInsightService } from './ProjectInsightService';
import { ReviewContextService } from './ReviewContextService';
import { createServices, type ServiceBundle } from './serviceWiring';

/** The context services task routing delegates to. */
const TASK_INTELLIGENCE_SERVICES = {
  projectInsight: ProjectInsightService,
  changeContext: ChangeContextService,
  reviewContext: ReviewContextService,
  changeCampaign: ChangeCampaignService,
};

/** The context services the task router needs (project, change, review and campaign). */
export type TaskIntelligenceServices = ServiceBundle<typeof TASK_INTELLIGENCE_SERVICES>;

/**
 * Creates the router's services, using real implementations except for the ones given in `overrides`.
 */
export const createTaskIntelligenceServices = (overrides: Partial<TaskIntelligenceServices> = {}) =>
  createServices(TASK_INTELLIGENCE_SERVICES, overrides);
