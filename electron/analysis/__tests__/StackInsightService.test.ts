import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { GraphData, GraphNode } from '../../store';
import { StackInsightService } from '../StackInsightService';

const tempDirs: string[] = [];

const createTempProject = () => {
  const projectDir = path.join(
    os.tmpdir(),
    `codemaps-stack-insight-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  fs.mkdirSync(projectDir, { recursive: true });
  tempDirs.push(projectDir);
  return projectDir;
};

const createFileGraph = (projectRoot: string, filePaths: string[]): GraphData => {
  const nodes: GraphNode[] = filePaths.map((filePath) => ({
    id: filePath,
    label: path.basename(filePath),
    group: 1,
    type: 'file',
    churn: 1,
  }));

  return {
    nodes,
    links: [],
    projectRoot,
  };
};

afterEach(() => {
  while (tempDirs.length > 0) {
    const projectDir = tempDirs.pop();
    if (projectDir && fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  }
});

describe('StackInsightService', () => {
  it('detects node build stack from package manifests', async () => {
    const projectDir = createTempProject();
    const packageJsonPath = path.join(projectDir, 'package.json');
    const viteConfigPath = path.join(projectDir, 'vite.config.ts');
    const pnpmWorkspacePath = path.join(projectDir, 'pnpm-workspace.yaml');
    const nxJsonPath = path.join(projectDir, 'nx.json');
    const turboJsonPath = path.join(projectDir, 'turbo.json');

    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify(
        {
          name: 'frontend-app',
          packageManager: 'pnpm@10.0.0',
          workspaces: ['apps/*', 'packages/*'],
          dependencies: {
            react: '^19.0.0',
            next: '^15.0.0',
          },
          devDependencies: {
            vite: '^8.0.0',
            nx: '^20.0.0',
            turbo: '^2.0.0',
          },
        },
        null,
        2
      )
    );
    fs.writeFileSync(viteConfigPath, 'export default {};');
    fs.writeFileSync(pnpmWorkspacePath, "packages:\n  - 'apps/*'\n  - 'packages/*'\n");
    fs.writeFileSync(nxJsonPath, JSON.stringify({ npmScope: 'workspace' }, null, 2));
    fs.writeFileSync(
      turboJsonPath,
      JSON.stringify({ tasks: { build: { dependsOn: ['^build'] } } }, null, 2)
    );

    const graph = createFileGraph(projectDir, [
      packageJsonPath,
      viteConfigPath,
      pnpmWorkspacePath,
      nxJsonPath,
      turboJsonPath,
    ]);
    const service = new StackInsightService();
    const result = await service.analyze(graph);

    expect(result.packageManagers.some((entry) => entry.id === 'pnpm')).toBe(true);
    expect(result.buildSystems.some((entry) => entry.id === 'vite')).toBe(true);
    expect(result.buildSystems.some((entry) => entry.id === 'pnpm-workspace')).toBe(true);
    expect(result.buildSystems.some((entry) => entry.id === 'nx')).toBe(true);
    expect(result.buildSystems.some((entry) => entry.id === 'turborepo')).toBe(true);
    expect(result.frameworks.some((entry) => entry.id === 'react')).toBe(true);
    expect(result.frameworks.some((entry) => entry.id === 'nextjs')).toBe(true);
  });

  it('detects backend stacks across ecosystems from real manifests', async () => {
    const projectDir = createTempProject();
    const pyprojectPath = path.join(projectDir, 'pyproject.toml');
    const pomPath = path.join(projectDir, 'pom.xml');
    const gradleKtsPath = path.join(projectDir, 'build.gradle.kts');
    const csprojPath = path.join(projectDir, 'backend.csproj');
    const goModPath = path.join(projectDir, 'go.mod');
    const cargoTomlPath = path.join(projectDir, 'Cargo.toml');
    const goMainPath = path.join(projectDir, 'main.go');
    const rustMainPath = path.join(projectDir, 'src', 'main.rs');

    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });

    fs.writeFileSync(
      pyprojectPath,
      [
        '[tool.poetry]',
        'name = "backend"',
        '',
        '[tool.poetry.dependencies]',
        'python = "^3.12"',
        'fastapi = "^0.115.0"',
      ].join('\n')
    );
    fs.writeFileSync(
      pomPath,
      [
        '<project>',
        '  <dependencies>',
        '    <dependency>',
        '      <groupId>org.springframework.boot</groupId>',
        '      <artifactId>spring-boot-starter-web</artifactId>',
        '    </dependency>',
        '    <dependency>',
        '      <groupId>io.quarkus</groupId>',
        '      <artifactId>quarkus-resteasy</artifactId>',
        '    </dependency>',
        '  </dependencies>',
        '</project>',
      ].join('\n')
    );
    fs.writeFileSync(
      gradleKtsPath,
      [
        'dependencies {',
        '  implementation("io.ktor:ktor-server-netty:3.0.0")',
        '  implementation("io.micronaut:micronaut-runtime:4.0.0")',
        '}',
      ].join('\n')
    );
    fs.writeFileSync(
      csprojPath,
      [
        '<Project Sdk="Microsoft.NET.Sdk.Web">',
        '  <ItemGroup>',
        '    <PackageReference Include="Microsoft.AspNetCore.OpenApi" Version="8.0.0" />',
        '  </ItemGroup>',
        '</Project>',
      ].join('\n')
    );
    fs.writeFileSync(
      goModPath,
      [
        'module backend',
        '',
        'require (',
        '  github.com/gin-gonic/gin v1.10.0',
        '  github.com/gofiber/fiber/v2 v2.52.0',
        '  github.com/labstack/echo/v4 v4.12.0',
        '  github.com/go-chi/chi/v5 v5.0.0',
        '  google.golang.org/grpc v1.67.0',
        ')',
      ].join('\n')
    );
    fs.writeFileSync(
      cargoTomlPath,
      [
        '[package]',
        'name = "backend"',
        'version = "0.1.0"',
        '',
        '[dependencies]',
        'axum = "0.7"',
        'actix-web = "4"',
      ].join('\n')
    );
    fs.writeFileSync(
      goMainPath,
      [
        'package main',
        'import (',
        '  "github.com/gin-gonic/gin"',
        '  "github.com/go-chi/chi/v5"',
        '  "google.golang.org/grpc"',
        ')',
        'func main(){',
        '  gin.Default()',
        '  chi.NewRouter()',
        '  grpc.NewServer()',
        '}',
      ].join('\n')
    );
    fs.writeFileSync(
      rustMainPath,
      'use axum::Router;\nuse actix_web::{App, HttpServer};\nfn main(){ let _ = Router::new(); let _ = HttpServer::new(|| App::new()); }\n'
    );

    const graph = createFileGraph(projectDir, [
      pyprojectPath,
      pomPath,
      gradleKtsPath,
      csprojPath,
      goModPath,
      cargoTomlPath,
      goMainPath,
      rustMainPath,
    ]);
    const service = new StackInsightService();
    const result = await service.analyze(graph);

    expect(result.packageManagers.some((entry) => entry.id === 'poetry')).toBe(true);
    expect(result.buildSystems.some((entry) => entry.id === 'dotnet')).toBe(true);
    expect(result.buildSystems.some((entry) => entry.id === 'maven')).toBe(true);
    expect(result.buildSystems.some((entry) => entry.id === 'gradle')).toBe(true);
    expect(result.buildSystems.some((entry) => entry.id === 'go-modules')).toBe(true);
    expect(result.buildSystems.some((entry) => entry.id === 'cargo')).toBe(true);
    expect(result.frameworks.some((entry) => entry.id === 'fastapi')).toBe(true);
    expect(result.frameworks.some((entry) => entry.id === 'spring-boot')).toBe(true);
    expect(result.frameworks.some((entry) => entry.id === 'ktor')).toBe(true);
    expect(result.frameworks.some((entry) => entry.id === 'micronaut')).toBe(true);
    expect(result.frameworks.some((entry) => entry.id === 'quarkus')).toBe(true);
    expect(result.frameworks.some((entry) => entry.id === 'aspnet-core')).toBe(true);
    expect(result.frameworks.some((entry) => entry.id === 'gin')).toBe(true);
    expect(result.frameworks.some((entry) => entry.id === 'fiber')).toBe(true);
    expect(result.frameworks.some((entry) => entry.id === 'echo')).toBe(true);
    expect(result.frameworks.some((entry) => entry.id === 'chi')).toBe(true);
    expect(result.frameworks.some((entry) => entry.id === 'grpc-go')).toBe(true);
    expect(result.frameworks.some((entry) => entry.id === 'axum')).toBe(true);
    expect(result.frameworks.some((entry) => entry.id === 'actix-web')).toBe(true);
  });

  it('detects API contract stacks from OpenAPI and protobuf artifacts', async () => {
    const projectDir = createTempProject();
    const openApiPath = path.join(projectDir, 'openapi.yaml');
    const protoPath = path.join(projectDir, 'proto', 'user.proto');
    const bufGenPath = path.join(projectDir, 'buf.gen.yaml');
    const packageJsonPath = path.join(projectDir, 'package.json');
    const connectClientPath = path.join(projectDir, 'src', 'connect-client.ts');

    fs.mkdirSync(path.join(projectDir, 'proto'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });

    fs.writeFileSync(
      openApiPath,
      ['openapi: 3.1.0', 'paths:', '  /users:', '    get:', '      operationId: listUsers'].join(
        '\n'
      )
    );
    fs.writeFileSync(
      protoPath,
      [
        'syntax = "proto3";',
        'service UserService {',
        '  rpc ListUsers (ListUsersRequest) returns (ListUsersResponse);',
        '}',
      ].join('\n')
    );
    fs.writeFileSync(
      bufGenPath,
      ['version: v1', 'plugins:', '  - name: go', '    out: gen/go'].join('\n')
    );
    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify(
        {
          name: 'contracts',
          dependencies: {
            '@connectrpc/connect': '^1.0.0',
            '@connectrpc/connect-web': '^1.0.0',
            'grpc-web': '^1.5.0',
          },
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      connectClientPath,
      [
        'import { createPromiseClient } from "@connectrpc/connect";',
        'import { GrpcWebFetchTransport } from "grpc-web";',
        'const client = createPromiseClient({} as any, {} as any);',
        'const transport = new GrpcWebFetchTransport({ baseUrl: "/api" });',
        'export { client, transport };',
      ].join('\n')
    );

    const graph = createFileGraph(projectDir, [
      openApiPath,
      protoPath,
      bufGenPath,
      packageJsonPath,
      connectClientPath,
    ]);
    const result = await new StackInsightService().analyze(graph);

    expect(result.buildSystems.some((entry) => entry.id === 'openapi')).toBe(true);
    expect(result.buildSystems.some((entry) => entry.id === 'protobuf')).toBe(true);
    expect(result.frameworks.some((entry) => entry.id === 'connectrpc')).toBe(true);
    expect(result.frameworks.some((entry) => entry.id === 'grpc-web')).toBe(true);
  });

  it('detects polyglot monorepo build stacks from Bazel and Pants artifacts', async () => {
    const projectDir = createTempProject();
    const moduleBazelPath = path.join(projectDir, 'MODULE.bazel');
    const buildBazelPath = path.join(projectDir, 'app', 'BUILD.bazel');
    const pantsTomlPath = path.join(projectDir, 'pants.toml');
    const buildRootPath = path.join(projectDir, 'BUILDROOT');

    fs.mkdirSync(path.join(projectDir, 'app'), { recursive: true });

    fs.writeFileSync(moduleBazelPath, 'module(name = "workspace")\n');
    fs.writeFileSync(buildBazelPath, 'ts_project(name = "app")\n');
    fs.writeFileSync(pantsTomlPath, '[GLOBAL]\npants_version = "2.23.0"\n');
    fs.writeFileSync(buildRootPath, '');

    const graph = createFileGraph(projectDir, [
      moduleBazelPath,
      buildBazelPath,
      pantsTomlPath,
      buildRootPath,
    ]);
    const result = await new StackInsightService().analyze(graph);

    expect(result.buildSystems.some((entry) => entry.id === 'bazel')).toBe(true);
    expect(result.buildSystems.some((entry) => entry.id === 'pants')).toBe(true);
  });
});
