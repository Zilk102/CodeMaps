export type StackCategory = 'package_manager' | 'build_system' | 'framework';
export type StackConfidence = 'high' | 'medium';

export type StackDetectionRule =
  | {
      type: 'relative_path';
      anyOf: string[];
    }
  | {
      type: 'basename';
      anyOf: string[];
    }
  | {
      type: 'suffix';
      anyOf: string[];
    }
  | {
      type: 'json_dependency';
      file: string;
      sections: string[];
      anyOf: string[];
    }
  | {
      type: 'json_field_includes';
      file: string;
      field: string;
      anyOf: string[];
    }
  | {
      type: 'text_contains';
      file: string;
      anyOf: string[];
    }
  | {
      type: 'text_contains_in_suffix';
      suffixes: string[];
      anyOf: string[];
    };

export interface StackDefinition {
  id: string;
  displayName: string;
  category: StackCategory;
  ecosystem: string;
  confidence: StackConfidence;
  matchMode?: 'all' | 'any';
  rules: StackDetectionRule[];
}

export const BUILTIN_STACK_DEFINITIONS: StackDefinition[] = [
  {
    id: 'npm',
    displayName: 'npm',
    category: 'package_manager',
    ecosystem: 'node',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'basename', anyOf: ['package-lock.json'] },
      { type: 'json_field_includes', file: 'package.json', field: 'packageManager', anyOf: ['npm@', 'npm'] },
    ],
  },
  {
    id: 'pnpm',
    displayName: 'pnpm',
    category: 'package_manager',
    ecosystem: 'node',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'basename', anyOf: ['pnpm-lock.yaml'] },
      { type: 'json_field_includes', file: 'package.json', field: 'packageManager', anyOf: ['pnpm@', 'pnpm'] },
    ],
  },
  {
    id: 'yarn',
    displayName: 'Yarn',
    category: 'package_manager',
    ecosystem: 'node',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'basename', anyOf: ['yarn.lock'] },
      { type: 'json_field_includes', file: 'package.json', field: 'packageManager', anyOf: ['yarn@', 'yarn'] },
    ],
  },
  {
    id: 'bun',
    displayName: 'Bun',
    category: 'package_manager',
    ecosystem: 'node',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'basename', anyOf: ['bun.lockb', 'bun.lock'] },
      { type: 'json_field_includes', file: 'package.json', field: 'packageManager', anyOf: ['bun@', 'bun'] },
    ],
  },
  {
    id: 'poetry',
    displayName: 'Poetry',
    category: 'package_manager',
    ecosystem: 'python',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'relative_path', anyOf: ['poetry.lock'] },
      { type: 'text_contains', file: 'pyproject.toml', anyOf: ['[tool.poetry]'] },
    ],
  },
  {
    id: 'pip',
    displayName: 'pip',
    category: 'package_manager',
    ecosystem: 'python',
    confidence: 'medium',
    matchMode: 'any',
    rules: [
      { type: 'relative_path', anyOf: ['requirements.txt', 'requirements-dev.txt'] },
      { type: 'text_contains', file: 'pyproject.toml', anyOf: ['[project]', '[build-system]'] },
    ],
  },
  {
    id: 'composer',
    displayName: 'Composer',
    category: 'package_manager',
    ecosystem: 'php',
    confidence: 'high',
    rules: [{ type: 'relative_path', anyOf: ['composer.json'] }],
  },
  {
    id: 'bundler',
    displayName: 'Bundler',
    category: 'package_manager',
    ecosystem: 'ruby',
    confidence: 'high',
    rules: [{ type: 'relative_path', anyOf: ['Gemfile', 'Gemfile.lock'] }],
  },
  {
    id: 'nuget',
    displayName: 'NuGet',
    category: 'package_manager',
    ecosystem: 'dotnet',
    confidence: 'medium',
    matchMode: 'any',
    rules: [
      { type: 'basename', anyOf: ['packages.config', 'Directory.Packages.props'] },
      { type: 'suffix', anyOf: ['.csproj', '.fsproj', '.vbproj'] },
    ],
  },
  {
    id: 'vite',
    displayName: 'Vite',
    category: 'build_system',
    ecosystem: 'node',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'basename', anyOf: ['vite.config.ts', 'vite.config.js', 'vite.config.mjs'] },
      {
        type: 'json_dependency',
        file: 'package.json',
        sections: ['dependencies', 'devDependencies'],
        anyOf: ['vite'],
      },
    ],
  },
  {
    id: 'pnpm-workspace',
    displayName: 'pnpm Workspace',
    category: 'build_system',
    ecosystem: 'node',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'relative_path', anyOf: ['pnpm-workspace.yaml'] },
      { type: 'json_field_includes', file: 'package.json', field: 'packageManager', anyOf: ['pnpm@', 'pnpm'] },
      { type: 'text_contains', file: 'package.json', anyOf: ['"workspaces"'] },
    ],
  },
  {
    id: 'nx',
    displayName: 'Nx',
    category: 'build_system',
    ecosystem: 'node',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'relative_path', anyOf: ['nx.json'] },
      {
        type: 'json_dependency',
        file: 'package.json',
        sections: ['dependencies', 'devDependencies'],
        anyOf: ['nx', '@nx/workspace', '@nrwl/workspace'],
      },
    ],
  },
  {
    id: 'turborepo',
    displayName: 'Turborepo',
    category: 'build_system',
    ecosystem: 'node',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'relative_path', anyOf: ['turbo.json'] },
      {
        type: 'json_dependency',
        file: 'package.json',
        sections: ['dependencies', 'devDependencies'],
        anyOf: ['turbo'],
      },
    ],
  },
  {
    id: 'bazel',
    displayName: 'Bazel',
    category: 'build_system',
    ecosystem: 'polyglot',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'basename', anyOf: ['BUILD.bazel', 'WORKSPACE', 'WORKSPACE.bazel', 'MODULE.bazel'] },
      { type: 'suffix', anyOf: ['.bzl'] },
    ],
  },
  {
    id: 'pants',
    displayName: 'Pants',
    category: 'build_system',
    ecosystem: 'polyglot',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'relative_path', anyOf: ['pants.toml', 'BUILDROOT'] },
      {
        type: 'text_contains',
        file: 'pyproject.toml',
        anyOf: ['[tool.pants]', 'pantsbuild.pants'],
      },
    ],
  },
  {
    id: 'openapi',
    displayName: 'OpenAPI',
    category: 'build_system',
    ecosystem: 'api-contract',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'basename', anyOf: ['openapi.yaml', 'openapi.yml', 'openapi.json', 'swagger.yaml', 'swagger.yml', 'swagger.json'] },
      {
        type: 'text_contains_in_suffix',
        suffixes: ['.yaml', '.yml', '.json'],
        anyOf: ['openapi: 3.', '"openapi": "3.', 'swagger: "2.', '"swagger": "2.'],
      },
    ],
  },
  {
    id: 'protobuf',
    displayName: 'Protocol Buffers',
    category: 'build_system',
    ecosystem: 'api-contract',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'suffix', anyOf: ['.proto'] },
      { type: 'basename', anyOf: ['buf.yaml', 'buf.gen.yaml', 'buf.work.yaml'] },
    ],
  },
  {
    id: 'maven',
    displayName: 'Maven',
    category: 'build_system',
    ecosystem: 'jvm',
    confidence: 'high',
    rules: [{ type: 'relative_path', anyOf: ['pom.xml'] }],
  },
  {
    id: 'gradle',
    displayName: 'Gradle',
    category: 'build_system',
    ecosystem: 'jvm',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'basename', anyOf: ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'] },
    ],
  },
  {
    id: 'cargo',
    displayName: 'Cargo',
    category: 'build_system',
    ecosystem: 'rust',
    confidence: 'high',
    rules: [{ type: 'relative_path', anyOf: ['Cargo.toml'] }],
  },
  {
    id: 'go-modules',
    displayName: 'Go Modules',
    category: 'build_system',
    ecosystem: 'go',
    confidence: 'high',
    rules: [{ type: 'relative_path', anyOf: ['go.mod'] }],
  },
  {
    id: 'dotnet',
    displayName: '.NET SDK',
    category: 'build_system',
    ecosystem: 'dotnet',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'suffix', anyOf: ['.sln', '.csproj', '.fsproj', '.vbproj'] },
      { type: 'basename', anyOf: ['Directory.Build.props', 'Directory.Build.targets'] },
    ],
  },
  {
    id: 'swiftpm',
    displayName: 'Swift Package Manager',
    category: 'build_system',
    ecosystem: 'swift',
    confidence: 'high',
    rules: [{ type: 'relative_path', anyOf: ['Package.swift'] }],
  },
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
      { type: 'text_contains', file: 'pom.xml', anyOf: ['spring-boot', 'org.springframework.boot'] },
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
      { type: 'text_contains', file: 'pom.xml', anyOf: ['io.ktor', 'ktor-server-core', 'ktor-server-netty'] },
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
      { type: 'text_contains_in_suffix', suffixes: ['.kt'], anyOf: ['embeddedServer(', 'routing {', 'fun Application.module'] },
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
      { type: 'text_contains', file: 'pom.xml', anyOf: ['io.micronaut', 'micronaut-http-server-netty', 'micronaut-runtime'] },
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
      { type: 'text_contains_in_suffix', suffixes: ['.java', '.kt'], anyOf: ['Micronaut.run(', '@Controller', '@Singleton'] },
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
      { type: 'text_contains', file: 'pom.xml', anyOf: ['io.quarkus', 'quarkus-resteasy', 'quarkus-arc'] },
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
      { type: 'text_contains_in_suffix', suffixes: ['.java', '.kt'], anyOf: ['@Path(', 'Quarkus.run(', '@QuarkusMain'] },
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
  {
    id: 'rails',
    displayName: 'Ruby on Rails',
    category: 'framework',
    ecosystem: 'backend',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'text_contains', file: 'Gemfile', anyOf: ["gem 'rails'", 'gem "rails"'] },
      { type: 'relative_path', anyOf: ['config/application.rb'] },
    ],
  },
  {
    id: 'laravel',
    displayName: 'Laravel',
    category: 'framework',
    ecosystem: 'backend',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      {
        type: 'json_dependency',
        file: 'composer.json',
        sections: ['require', 'require-dev'],
        anyOf: ['laravel/framework'],
      },
      { type: 'relative_path', anyOf: ['artisan'] },
    ],
  },
  {
    id: 'gin',
    displayName: 'Gin',
    category: 'framework',
    ecosystem: 'backend',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'text_contains', file: 'go.mod', anyOf: ['github.com/gin-gonic/gin'] },
      { type: 'text_contains_in_suffix', suffixes: ['.go'], anyOf: ['gin.Default(', 'gin.New('] },
    ],
  },
  {
    id: 'fiber',
    displayName: 'Fiber',
    category: 'framework',
    ecosystem: 'backend',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'text_contains', file: 'go.mod', anyOf: ['github.com/gofiber/fiber'] },
      { type: 'text_contains_in_suffix', suffixes: ['.go'], anyOf: ['fiber.New('] },
    ],
  },
  {
    id: 'echo',
    displayName: 'Echo',
    category: 'framework',
    ecosystem: 'backend',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'text_contains', file: 'go.mod', anyOf: ['github.com/labstack/echo'] },
      { type: 'text_contains_in_suffix', suffixes: ['.go'], anyOf: ['echo.New('] },
    ],
  },
  {
    id: 'chi',
    displayName: 'Chi',
    category: 'framework',
    ecosystem: 'backend',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'text_contains', file: 'go.mod', anyOf: ['github.com/go-chi/chi'] },
      { type: 'text_contains_in_suffix', suffixes: ['.go'], anyOf: ['chi.NewRouter('] },
    ],
  },
  {
    id: 'grpc-go',
    displayName: 'gRPC-Go',
    category: 'framework',
    ecosystem: 'backend',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'text_contains', file: 'go.mod', anyOf: ['google.golang.org/grpc'] },
      {
        type: 'text_contains_in_suffix',
        suffixes: ['.go'],
        anyOf: ['grpc.NewServer(', 'Register', 'grpc.UnaryInterceptor('],
      },
    ],
  },
  {
    id: 'connectrpc',
    displayName: 'ConnectRPC',
    category: 'framework',
    ecosystem: 'backend',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      {
        type: 'json_dependency',
        file: 'package.json',
        sections: ['dependencies', 'devDependencies'],
        anyOf: ['@connectrpc/connect', '@connectrpc/connect-web', '@connectrpc/connect-node'],
      },
      {
        type: 'text_contains_in_suffix',
        suffixes: ['.ts', '.tsx', '.js', '.jsx'],
        anyOf: ['createPromiseClient(', 'createConnectTransport(', 'connectNodeAdapter('],
      },
    ],
  },
  {
    id: 'grpc-web',
    displayName: 'gRPC-Web',
    category: 'framework',
    ecosystem: 'backend',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      {
        type: 'json_dependency',
        file: 'package.json',
        sections: ['dependencies', 'devDependencies'],
        anyOf: ['grpc-web', '@improbable-eng/grpc-web'],
      },
      {
        type: 'text_contains_in_suffix',
        suffixes: ['.ts', '.tsx', '.js', '.jsx'],
        anyOf: ['GrpcWebFetchTransport(', 'grpc.unary(', 'grpc.invoke('],
      },
    ],
  },
  {
    id: 'axum',
    displayName: 'Axum',
    category: 'framework',
    ecosystem: 'backend',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'text_contains', file: 'Cargo.toml', anyOf: ['axum'] },
      { type: 'text_contains_in_suffix', suffixes: ['.rs'], anyOf: ['Router::new', 'axum::serve', 'axum::Router'] },
    ],
  },
  {
    id: 'actix-web',
    displayName: 'Actix Web',
    category: 'framework',
    ecosystem: 'backend',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'text_contains', file: 'Cargo.toml', anyOf: ['actix-web'] },
      {
        type: 'text_contains_in_suffix',
        suffixes: ['.rs'],
        anyOf: ['HttpServer::new', 'App::new', '#[get(', '#[post(', 'web::get()', 'web::post()'],
      },
    ],
  },
  {
    id: 'flutter',
    displayName: 'Flutter',
    category: 'framework',
    ecosystem: 'mobile',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'text_contains', file: 'pubspec.yaml', anyOf: ['flutter:'] },
      { type: 'relative_path', anyOf: ['pubspec.yaml'] },
    ],
  },
];
