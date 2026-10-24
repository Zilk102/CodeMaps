/**
 * Tiny dependency-injection helper: builds a bundle of services from classes so tests can swap members.
 */

type ServiceClasses = Record<string, new () => object>;

/** The instances a map of service classes builds. */
export type ServiceBundle<C extends ServiceClasses> = { [K in keyof C]: InstanceType<C[K]> };

/** Drops undefined members so optional constructor arguments never override the default wiring. */
export const withoutUndefined = <T extends object>(value: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Partial<T>;

/** Builds every service with its default class; any member can be replaced (tests, embedding). */
export const createServices = <C extends ServiceClasses>(
  classes: C,
  overrides: Partial<ServiceBundle<C>> = {}
): ServiceBundle<C> => {
  const built = Object.fromEntries(
    Object.entries(classes).map(([name, ServiceClass]) => [name, new ServiceClass()])
  );
  return { ...built, ...overrides } as ServiceBundle<C>;
};
