export * from './stackTopologySupport';

import type { StackAdapter } from './stackTopologySupport';
import {
  djangoAdapter,
  fastApiAdapter,
  laravelAdapter,
  railsAdapter,
} from './stackTopologyScriptingFrameworkAdapters';
import { GO_RUST_FRAMEWORK_STACK_ADAPTERS } from './stackTopologyGoRustFrameworkAdapters';

export const POLYGLOT_FRAMEWORK_STACK_ADAPTERS: StackAdapter[] = [
  fastApiAdapter,
  djangoAdapter,
  railsAdapter,
  laravelAdapter,
  ...GO_RUST_FRAMEWORK_STACK_ADAPTERS,
];
