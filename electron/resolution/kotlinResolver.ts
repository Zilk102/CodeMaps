import { PackageResolver } from './packageResolver';

/**
 * Kotlin packages work like Java's: `import a.b.Type`, `import a.b.*`, `import a.b.Type as T`,
 * and top-level functions are importable by name, which the type lookup covers because their
 * entities are plain names of the declaring file.
 */
export class KotlinResolver extends PackageResolver {
  constructor() {
    super('kotlin', ['java']);
  }
}
