/**
 * Catalog entries for server frameworks of Python, JVM and .NET (Django, FastAPI, Spring Boot, Ktor, ASP.NET Core, ...).
 */
import type { StackDefinition } from './stackCatalogTypes';

export const SERVER_FRAMEWORK_STACKS: StackDefinition[] = [
  {
    id: 'django',
    displayName: 'Django',
    category: 'framework',
    ecosystem: 'backend',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'text_contains', file: 'requirements.txt', anyOf: ['django'] },
      { type: 'text_contains', file: 'pyproject.toml', anyOf: ['django'] },
    ],
  },
  {
    id: 'fastapi',
    displayName: 'FastAPI',
    category: 'framework',
    ecosystem: 'backend',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'text_contains', file: 'requirements.txt', anyOf: ['fastapi'] },
      { type: 'text_contains', file: 'pyproject.toml', anyOf: ['fastapi'] },
    ],
  },
  {
    id: 'spring-boot',
    displayName: 'Spring Boot',
    category: 'framework',
    ecosystem: 'backend',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      {
        type: 'text_contains',
        file: 'pom.xml',
        anyOf: ['spring-boot', 'org.springframework.boot'],
      },
      {
        type: 'text_contains',
        file: 'build.gradle',
        anyOf: ['spring-boot', 'org.springframework.boot'],
      },
      {
        type: 'text_contains',
        file: 'build.gradle.kts',
        anyOf: ['spring-boot', 'org.springframework.boot'],
      },
    ],
  },
  {
    id: 'ktor',
    displayName: 'Ktor',
    category: 'framework',
    ecosystem: 'backend',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      {
        type: 'text_contains',
        file: 'pom.xml',
        anyOf: ['io.ktor', 'ktor-server-core', 'ktor-server-netty'],
      },
      {
        type: 'text_contains',
        file: 'build.gradle',
        anyOf: ['io.ktor', 'ktor-server-core', 'ktor-server-netty'],
      },
      {
        type: 'text_contains',
        file: 'build.gradle.kts',
        anyOf: ['io.ktor', 'ktor-server-core', 'ktor-server-netty'],
      },
      {
        type: 'text_contains_in_suffix',
        suffixes: ['.kt'],
        anyOf: ['embeddedServer(', 'routing {', 'fun Application.module'],
      },
    ],
  },
  {
    id: 'micronaut',
    displayName: 'Micronaut',
    category: 'framework',
    ecosystem: 'backend',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      {
        type: 'text_contains',
        file: 'pom.xml',
        anyOf: ['io.micronaut', 'micronaut-http-server-netty', 'micronaut-runtime'],
      },
      {
        type: 'text_contains',
        file: 'build.gradle',
        anyOf: ['io.micronaut', 'micronaut-http-server-netty', 'micronaut-runtime'],
      },
      {
        type: 'text_contains',
        file: 'build.gradle.kts',
        anyOf: ['io.micronaut', 'micronaut-http-server-netty', 'micronaut-runtime'],
      },
      {
        type: 'text_contains_in_suffix',
        suffixes: ['.java', '.kt'],
        anyOf: ['Micronaut.run(', '@Controller', '@Singleton'],
      },
    ],
  },
  {
    id: 'quarkus',
    displayName: 'Quarkus',
    category: 'framework',
    ecosystem: 'backend',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      {
        type: 'text_contains',
        file: 'pom.xml',
        anyOf: ['io.quarkus', 'quarkus-resteasy', 'quarkus-arc'],
      },
      {
        type: 'text_contains',
        file: 'build.gradle',
        anyOf: ['io.quarkus', 'quarkus-resteasy', 'quarkus-arc'],
      },
      {
        type: 'text_contains',
        file: 'build.gradle.kts',
        anyOf: ['io.quarkus', 'quarkus-resteasy', 'quarkus-arc'],
      },
      {
        type: 'text_contains_in_suffix',
        suffixes: ['.java', '.kt'],
        anyOf: ['@Path(', 'Quarkus.run(', '@QuarkusMain'],
      },
    ],
  },
  {
    id: 'aspnet-core',
    displayName: 'ASP.NET Core',
    category: 'framework',
    ecosystem: 'backend',
    confidence: 'high',
    rules: [
      {
        type: 'text_contains_in_suffix',
        suffixes: ['.csproj'],
        anyOf: ['Microsoft.NET.Sdk.Web', 'Microsoft.AspNetCore'],
      },
    ],
  },
];
