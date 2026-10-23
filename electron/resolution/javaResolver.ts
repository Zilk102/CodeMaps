import { PackageResolver } from './packageResolver';

/** Java packages; Kotlin files share them, so each language can import the other's classes. */
export class JavaResolver extends PackageResolver {
  constructor() {
    super('java', ['kotlin']);
  }
}
