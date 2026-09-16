import { describe, it, expect } from 'vitest';
import { SemanticSkeletonService } from '../SemanticSkeletonService';

describe('SemanticSkeletonService', () => {
  const service = new SemanticSkeletonService();

  it('strips function and method bodies', () => {
    const code = `
      import { something } from 'somewhere';
      
      export interface User {
        id: string;
      }

      export class UserService {
        private users: User[] = [];

        constructor() {
          this.users = [];
        }

        public async getUser(id: string): Promise<User> {
          const user = this.users.find(u => u.id === id);
          if (!user) throw new Error('Not found');
          return user;
        }

        private get helper() {
          return true;
        }
      }

      export function standalone(a: number, b: number): number {
        return a + b;
      }

      const arrow = (a: string) => {
        console.log(a);
      };
      
      const inlineArrow = () => 42;
    `;

    const skeleton = service.generateSkeletonFromCode(code, 'test.ts');

    // Check what is preserved
    expect(skeleton).toContain('export interface User');
    expect(skeleton).toContain('export class UserService');
    expect(skeleton).toContain('public async getUser(id: string): Promise<User>');
    expect(skeleton).toContain('export function standalone(a: number, b: number): number');

    // Check what is stripped
    expect(skeleton).not.toContain("throw new Error('Not found')");
    expect(skeleton).not.toContain('return a + b');
    expect(skeleton).not.toContain('console.log(a)');
    expect(skeleton).not.toContain('return true');
    expect(skeleton).not.toContain('42');

    // Ensure function bodies are replaced with empty blocks
    expect(skeleton).toContain('constructor() { }');
    expect(skeleton).toContain('public async getUser(id: string): Promise<User> { }');
    expect(skeleton).toContain('export function standalone(a: number, b: number): number { }');
  });
});
