import { describe, it, expect, beforeEach } from 'vitest';
import { ServiceRegistry } from '../ServiceRegistry';

describe('ServiceRegistry', () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    // Reset instance for isolated tests.
    // @ts-expect-error - testing singleton reset
    ServiceRegistry.instance = undefined;
    registry = ServiceRegistry.getInstance();
  });

  it('should follow the singleton pattern', () => {
    const anotherRegistry = ServiceRegistry.getInstance();
    expect(registry).toBe(anotherRegistry);
  });

  it('should register and retrieve a service', () => {
    const mockService = { doSomething: () => 'success' };
    registry.register('MockService', mockService);

    const retrievedService = registry.get<typeof mockService>('MockService');
    expect(retrievedService).toBe(mockService);
    expect(retrievedService.doSomething()).toBe('success');
  });

  it('should throw an error when getting an unregistered service', () => {
    expect(() => {
      registry.get('NonExistentService');
    }).toThrowError('Service NonExistentService not found in registry');
  });

  it('should overwrite a service if registered with the same name', () => {
    const service1 = { id: 1 };
    const service2 = { id: 2 };

    registry.register('TestService', service1);
    registry.register('TestService', service2);

    const retrieved = registry.get<{ id: number }>('TestService');
    expect(retrieved.id).toBe(2);
  });
});
