import type { StackDefinition } from './stackCatalogTypes';
import { PACKAGE_MANAGER_STACKS } from './stackCatalogPackageManagers';
import { BUILD_SYSTEM_STACKS } from './stackCatalogBuildSystems';
import { WEB_FRAMEWORK_STACKS } from './stackCatalogWebFrameworks';
import { SERVER_FRAMEWORK_STACKS } from './stackCatalogServerFrameworks';
import { POLYGLOT_FRAMEWORK_STACKS } from './stackCatalogPolyglotFrameworks';

export type {
  StackCategory,
  StackConfidence,
  StackDefinition,
  StackDetectionRule,
} from './stackCatalogTypes';

export const BUILTIN_STACK_DEFINITIONS: StackDefinition[] = [
  ...PACKAGE_MANAGER_STACKS,
  ...BUILD_SYSTEM_STACKS,
  ...WEB_FRAMEWORK_STACKS,
  ...SERVER_FRAMEWORK_STACKS,
  ...POLYGLOT_FRAMEWORK_STACKS,
];
