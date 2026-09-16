import { describe, it, expect } from 'vitest';
import { SemanticSkeletonService } from '../SemanticSkeletonService';

describe('SemanticSkeletonService', () => {
  const service = new SemanticSkeletonService();

  describe('TypeScript / JavaScript (Compiler API)', () => {
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

  describe('Other Languages (Tree-Sitter)', () => {
    it('strips Python function and class bodies', async () => {
      const code = `
import os

class DatabaseHandler:
    def __init__(self, db_url):
        self.url = db_url
        print("Connected")

    def fetch_data(self, query: str) -> list:
        results = db.execute(query)
        return results

def standalone_func():
    os.exit(1)
      `;
      // Call private method directly for testing using any cast
      const skeleton = await (service as any).generateSkeletonWithTreeSitter(code, 'python');

      expect(skeleton).toContain('class DatabaseHandler:');
      expect(skeleton).toContain('def __init__(self, db_url):');
      expect(skeleton).toContain('def fetch_data(self, query: str) -> list:');
      expect(skeleton).toContain('def standalone_func():');

      expect(skeleton).not.toContain('print("Connected")');
      expect(skeleton).not.toContain('db.execute(query)');
      expect(skeleton).not.toContain('os.exit(1)');

      expect(skeleton).toContain('pass # implementation hidden');
    });

    it('strips Rust function bodies', async () => {
      const code = `
use std::fs;

struct User { id: String }

impl User {
    fn new(id: String) -> Self {
        println!("Creating");
        Self { id }
    }
}

pub fn standalone() {
    let x = 42;
}
      `;
      const skeleton = await (service as any).generateSkeletonWithTreeSitter(code, 'rust');

      expect(skeleton).toContain('struct User');
      expect(skeleton).toContain('fn new(id: String) -> Self');
      expect(skeleton).toContain('pub fn standalone()');

      expect(skeleton).not.toContain('println!("Creating")');
      expect(skeleton).not.toContain('let x = 42');

      expect(skeleton).toContain('{ /* implementation hidden */ }');
    });

    it('strips Java method bodies', async () => {
      const code = `
import java.util.List;

public class Service {
    public Service() {
        System.out.println("Init");
    }

    public List<String> getData() {
        return List.of("A", "B");
    }
}
      `;
      const skeleton = await (service as any).generateSkeletonWithTreeSitter(code, 'java');

      expect(skeleton).toContain('public class Service');
      expect(skeleton).toContain('public Service()');
      expect(skeleton).toContain('public List<String> getData()');

      expect(skeleton).not.toContain('System.out.println("Init")');
      expect(skeleton).not.toContain('return List.of("A", "B")');

      expect(skeleton).toContain('{ /* implementation hidden */ }');
    });
  });
});
