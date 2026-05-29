export * from './stackTopologySupport';

import { StackAdapter } from './stackTopologySupport';
import { BUILD_STACK_ADAPTERS } from './stackTopologyBuildAdapters';
import { FRAMEWORK_STACK_ADAPTERS } from './stackTopologyFrameworkAdapters';

export { BUILD_STACK_ADAPTERS } from './stackTopologyBuildAdapters';
export { FRAMEWORK_STACK_ADAPTERS } from './stackTopologyFrameworkAdapters';

export const BUILTIN_STACK_ADAPTERS: StackAdapter[] = [
  ...FRAMEWORK_STACK_ADAPTERS,
  ...BUILD_STACK_ADAPTERS,
];