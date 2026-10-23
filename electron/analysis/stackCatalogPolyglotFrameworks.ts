import type { StackDefinition } from './stackCatalogTypes';

export const POLYGLOT_FRAMEWORK_STACKS: StackDefinition[] = [
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
      {
        type: 'text_contains_in_suffix',
        suffixes: ['.rs'],
        anyOf: ['Router::new', 'axum::serve', 'axum::Router'],
      },
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
