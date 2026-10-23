export * from './stackTopologySupport';

import { StackAdapter } from './stackTopologySupport';
import { openApiAdapter, protobufAdapter } from './stackTopologyContractBuildAdapters';
import {
  viteAdapter,
  pnpmWorkspaceAdapter,
  nxWorkspaceAdapter,
  turborepoAdapter,
} from './stackTopologyJsWorkspaceAdapters';
import { bazelAdapter, pantsAdapter } from './stackTopologyMonorepoToolAdapters';
import {
  mavenAdapter,
  gradleBuildAdapter,
  cargoBuildAdapter,
  dotnetAdapter,
} from './stackTopologyPackageBuildAdapters';

export const BUILD_STACK_ADAPTERS: StackAdapter[] = [
  viteAdapter,
  pnpmWorkspaceAdapter,
  nxWorkspaceAdapter,
  turborepoAdapter,
  bazelAdapter,
  pantsAdapter,
  openApiAdapter,
  protobufAdapter,
  cargoBuildAdapter,
  mavenAdapter,
  gradleBuildAdapter,
  dotnetAdapter,
];
