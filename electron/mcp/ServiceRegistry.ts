/** Process-wide registry that hands the MCP tool layer its analysis services by name. */

/** Singleton name-to-instance lookup for the analysis services, so every MCP session shares one set of analyzers instead of building its own. */
export class ServiceRegistry {
  private static instance: ServiceRegistry;
  private services = new Map<string, any>();

  private constructor() {}

  /** Returns the shared registry, creating it on first use. */
  static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  /** Stores `service` under `name`; registering the same name again replaces the earlier instance. */
  register<T>(name: string, service: T): void {
    this.services.set(name, service);
  }

  /** Returns the service registered as `name`, throwing when none exists. `T` is trusted, not checked at runtime. */
  get<T>(name: string): T {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service ${name} not found in registry`);
    }
    return service as T;
  }
}
