import type { StackDefinition } from './stackCatalogTypes';

export const WEB_FRAMEWORK_STACKS: StackDefinition[] = [
  {
    id: 'react',
    displayName: 'React',
    category: 'framework',
    ecosystem: 'frontend',
    confidence: 'high',
    rules: [
      {
        type: 'json_dependency',
        file: 'package.json',
        sections: ['dependencies', 'devDependencies'],
        anyOf: ['react'],
      },
    ],
  },
  {
    id: 'nextjs',
    displayName: 'Next.js',
    category: 'framework',
    ecosystem: 'frontend',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      {
        type: 'json_dependency',
        file: 'package.json',
        sections: ['dependencies', 'devDependencies'],
        anyOf: ['next'],
      },
      { type: 'basename', anyOf: ['next.config.js', 'next.config.mjs', 'next.config.ts'] },
    ],
  },
  {
    id: 'vue',
    displayName: 'Vue',
    category: 'framework',
    ecosystem: 'frontend',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      {
        type: 'json_dependency',
        file: 'package.json',
        sections: ['dependencies', 'devDependencies'],
        anyOf: ['vue'],
      },
      { type: 'suffix', anyOf: ['.vue'] },
    ],
  },
  {
    id: 'angular',
    displayName: 'Angular',
    category: 'framework',
    ecosystem: 'frontend',
    confidence: 'high',
    rules: [
      {
        type: 'json_dependency',
        file: 'package.json',
        sections: ['dependencies', 'devDependencies'],
        anyOf: ['@angular/core'],
      },
    ],
  },
  {
    id: 'nestjs',
    displayName: 'NestJS',
    category: 'framework',
    ecosystem: 'backend',
    confidence: 'high',
    rules: [
      {
        type: 'json_dependency',
        file: 'package.json',
        sections: ['dependencies', 'devDependencies'],
        anyOf: ['@nestjs/core'],
      },
    ],
  },
];
