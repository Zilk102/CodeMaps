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

export type TaskIntelligenceServices = ServiceBundle<typeof TASK_INTELLIGENCE_SERVICES>;

export const createTaskIntelligenceServices = (overrides: Partial<TaskIntelligenceServices> = {}) =>
  createServices(TASK_INTELLIGENCE_SERVICES, overrides);
