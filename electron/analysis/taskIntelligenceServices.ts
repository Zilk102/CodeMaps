import { ChangeCampaignService } from './ChangeCampaignService';
import { ChangeContextService } from './ChangeContextService';
import { ProjectInsightService } from './ProjectInsightService';
import { ReviewContextService } from './ReviewContextService';

/** The context services task routing delegates to. */
export interface TaskIntelligenceServices {
  projectInsight: ProjectInsightService;
  changeContext: ChangeContextService;
  reviewContext: ReviewContextService;
  changeCampaign: ChangeCampaignService;
}

export const createTaskIntelligenceServices = (
  overrides: Partial<TaskIntelligenceServices> = {}
): TaskIntelligenceServices => ({
  projectInsight: new ProjectInsightService(),
  changeContext: new ChangeContextService(),
  reviewContext: new ReviewContextService(),
  changeCampaign: new ChangeCampaignService(),
  ...overrides,
});
