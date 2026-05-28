import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { GraphData, GraphNode } from '../../store';
import { StackInsightService } from '../StackInsightService';
import { StackTopologyService } from '../StackTopologyService';

const tempDirs: string[] = [];

const createTempProject = () => {
  const projectDir = path.join(
    os.tmpdir(),
    `codemaps-stack-topology-${Date.now()}-${Math.random().toString(16).slice(2)}`
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

describe('StackTopologyService', () => {
  it('extracts Next.js routes and Vite build entrypoints', async () => {
    const projectDir = createTempProject();
    const files = [
      path.join(projectDir, 'package.json'),
      path.join(projectDir, 'vite.config.ts'),
      path.join(projectDir, 'app', 'layout.tsx'),
      path.join(projectDir, 'app', 'page.tsx'),
      path.join(projectDir, 'app', 'api', 'health', 'route.ts'),
      path.join(projectDir, 'src', 'main.tsx'),
      path.join(projectDir, 'index.html'),
    ];

    fs.mkdirSync(path.join(projectDir, 'app', 'api', 'health'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
    fs.writeFileSync(
      files[0],
      JSON.stringify(
        {
          name: 'frontend',
          dependencies: { react: '^19.0.0', next: '^15.0.0' },
          devDependencies: { vite: '^8.0.0' },
        },
        null,
        2
      )
    );
    fs.writeFileSync(files[1], 'export default {};');
    fs.writeFileSync(files[2], 'export default function RootLayout({ children }: { children: React.ReactNode }) { return children; }');
    fs.writeFileSync(files[3], 'export default function Page() { return <div />; }');
    fs.writeFileSync(files[4], 'export async function GET() { return Response.json({ ok: true }); }');
    fs.writeFileSync(files[5], 'export default {};');
    fs.writeFileSync(files[6], '<!doctype html><html></html>');

    const graph = createFileGraph(projectDir, files);
    const stackProfile = await new StackInsightService().analyze(graph);
    const topology = await new StackTopologyService().analyze(graph, stackProfile);

    expect(
      topology.frameworkInsights.some(
        (entry) =>
          entry.adapterId === 'nextjs-topology' &&
          entry.routes.includes('app/page.tsx') &&
          entry.modules.includes('app/api/health/route.ts') &&
          entry.relationships.some(
            (relationship) =>
              relationship.reason === 'nextjs_layout_route' &&
              relationship.source === 'app/layout.tsx' &&
              relationship.target === 'app/page.tsx'
          )
      )
    ).toBe(true);
    expect(
      topology.buildInsights.some(
        (entry) =>
          entry.adapterId === 'vite-build-topology' &&
          entry.entryFiles.includes('index.html') &&
          entry.entryFiles.includes('src/main.tsx')
      )
    ).toBe(true);
  });

  it('extracts backend topology for NestJS, Spring Boot and ASP.NET Core', async () => {
    const projectDir = createTempProject();
    const files = [
      path.join(projectDir, 'package.json'),
      path.join(projectDir, 'src', 'main.ts'),
      path.join(projectDir, 'src', 'app.module.ts'),
      path.join(projectDir, 'src', 'app.controller.ts'),
      path.join(projectDir, 'src', 'app.service.ts'),
      path.join(projectDir, 'pom.xml'),
      path.join(projectDir, 'src', 'main', 'java', 'com', 'example', 'DemoApplication.java'),
      path.join(projectDir, 'src', 'main', 'java', 'com', 'example', 'UserController.java'),
      path.join(projectDir, 'src', 'main', 'java', 'com', 'example', 'UserContract.java'),
      path.join(projectDir, 'src', 'main', 'java', 'com', 'example', 'UserService.java'),
      path.join(projectDir, 'src', 'main', 'java', 'com', 'example', 'UserRepository.java'),
      path.join(projectDir, 'backend.csproj'),
      path.join(projectDir, 'Program.cs'),
      path.join(projectDir, 'UsersController.cs'),
      path.join(projectDir, 'UserService.cs'),
    ];

    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'src', 'main', 'java', 'com', 'example'), { recursive: true });
    fs.writeFileSync(
      files[0],
      JSON.stringify(
        {
          name: 'backend',
          dependencies: { '@nestjs/core': '^11.0.0' },
        },
        null,
        2
      )
    );
    fs.writeFileSync(files[1], 'bootstrap();');
    fs.writeFileSync(
      files[2],
      '@Module({ controllers: [AppController], providers: [{ provide: APP_SERVICE, useClass: AppService }, AppService] }) export class AppModule {}'
    );
    fs.writeFileSync(files[3], '@Controller() export class AppController { constructor(private readonly appService: AppService) {} }');
    fs.writeFileSync(files[4], '@Injectable() export class AppService {}');
    fs.writeFileSync(
      files[5],
      '<project><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>'
    );
    fs.writeFileSync(
      files[6],
      [
        '@SpringBootApplication',
        'class DemoApplication {',
        '  @Bean',
        '  public UserContract userService() { return new UserService(); }',
        '}',
      ].join('\n')
    );
    fs.writeFileSync(files[8], 'interface UserContract {}');
    fs.writeFileSync(
      files[7],
      [
        '@RestController',
        'class UserController {',
        '  private final UserService userService;',
        '  UserController(UserService userService) { this.userService = userService; }',
        '  @GetMapping("/users")',
        '  public UserService listUsers() { return userService; }',
        '}',
      ].join('\n')
    );
    fs.writeFileSync(
      files[9],
      '@Service class UserService implements UserContract { private final UserRepository userRepository; UserService(UserRepository userRepository) { this.userRepository = userRepository; } }'
    );
    fs.writeFileSync(files[10], '@Repository class UserRepository {}');
    fs.writeFileSync(
      files[11],
      '<Project Sdk="Microsoft.NET.Sdk.Web"><ItemGroup><ProjectReference Include="Shared.csproj" /></ItemGroup></Project>'
    );
    fs.writeFileSync(
      files[12],
      [
        'var builder = WebApplication.CreateBuilder(args);',
        'builder.Services.AddScoped<IUserService, UserService>();',
      ].join('\n')
    );
    fs.writeFileSync(
      files[13],
      [
        '[ApiController]',
        'public class UsersController : ControllerBase {',
        '  private readonly UserService _userService;',
        '  public UsersController(UserService userService) { _userService = userService; }',
        '  [HttpGet]',
        '  public UserService GetUsers() { return _userService; }',
        '}',
      ].join('\n')
    );
    fs.writeFileSync(files[14], 'public interface IUserService {} public class UserService : IUserService {}');

    const graph = createFileGraph(projectDir, files);
    const stackProfile = await new StackInsightService().analyze(graph);
    const topology = await new StackTopologyService().analyze(graph, stackProfile);

    expect(
      topology.frameworkInsights.some(
        (entry) =>
          entry.adapterId === 'nestjs-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'nestjs_module_controller') &&
          entry.relationships.some((relationship) => relationship.reason === 'nestjs_controller_provider') &&
          entry.relationships.some((relationship) => relationship.reason === 'nestjs_provider_binding')
      )
    ).toBe(true);
    expect(
      topology.frameworkInsights.some(
        (entry) =>
          entry.adapterId === 'spring-boot-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'springboot_controller_service') &&
          entry.relationships.some((relationship) => relationship.reason === 'springboot_service_repository') &&
          entry.relationships.some((relationship) => relationship.reason === 'springboot_controller_method') &&
          entry.relationships.some((relationship) => relationship.reason === 'springboot_bean_method') &&
          entry.relationships.some((relationship) => relationship.reason === 'springboot_bean_binding')
      )
    ).toBe(true);
    expect(
      topology.frameworkInsights.some(
        (entry) =>
          entry.adapterId === 'aspnet-core-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'aspnet_controller_service') &&
          entry.relationships.some((relationship) => relationship.reason === 'aspnet_controller_method') &&
          entry.relationships.some((relationship) => relationship.reason === 'aspnet_service_contract') &&
          entry.relationships.some((relationship) => relationship.reason === 'aspnet_service_registration')
      )
    ).toBe(true);
    expect(topology.buildInsights.some((entry) => entry.adapterId === 'maven-build-topology')).toBe(true);
    expect(topology.buildInsights.some((entry) => entry.adapterId === 'dotnet-build-topology')).toBe(true);
  });

  it('extracts backend topology for Ktor, Micronaut and Quarkus', async () => {
    const projectDir = createTempProject();
    const files = [
      path.join(projectDir, 'build.gradle.kts'),
      path.join(projectDir, 'pom.xml'),
      path.join(projectDir, 'src', 'main', 'kotlin', 'com', 'example', 'Application.kt'),
      path.join(projectDir, 'src', 'main', 'kotlin', 'com', 'example', 'Routes.kt'),
      path.join(projectDir, 'src', 'main', 'java', 'com', 'example', 'MicronautApp.java'),
      path.join(projectDir, 'src', 'main', 'java', 'com', 'example', 'OrderController.java'),
      path.join(projectDir, 'src', 'main', 'java', 'com', 'example', 'OrderService.java'),
      path.join(projectDir, 'src', 'main', 'java', 'com', 'example', 'OrderRepository.java'),
      path.join(projectDir, 'src', 'main', 'java', 'com', 'example', 'QuarkusMain.java'),
      path.join(projectDir, 'src', 'main', 'java', 'com', 'example', 'UserResource.java'),
      path.join(projectDir, 'src', 'main', 'java', 'com', 'example', 'UserService.java'),
      path.join(projectDir, 'src', 'main', 'resources', 'application.properties'),
    ];

    fs.mkdirSync(path.join(projectDir, 'src', 'main', 'kotlin', 'com', 'example'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'src', 'main', 'java', 'com', 'example'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'src', 'main', 'resources'), { recursive: true });

    fs.writeFileSync(
      files[0],
      [
        'dependencies {',
        '  implementation("io.ktor:ktor-server-netty:3.0.0")',
        '  implementation("io.micronaut:micronaut-runtime:4.0.0")',
        '}',
      ].join('\n')
    );
    fs.writeFileSync(
      files[1],
      [
        '<project>',
        '  <dependencies>',
        '    <dependency><groupId>io.quarkus</groupId><artifactId>quarkus-resteasy</artifactId></dependency>',
        '  </dependencies>',
        '</project>',
      ].join('\n')
    );
    fs.writeFileSync(
      files[2],
      [
        'fun Application.module() {',
        '  embeddedServer(Netty, port = 8080) {',
        '    routing {',
        '      get("/health") { healthCheck() }',
        '    }',
        '  }',
        '}',
        'fun healthCheck() {}',
      ].join('\n')
    );
    fs.writeFileSync(
      files[3],
      [
        'fun Route.userRoutes() {',
        '  get("/users") { listUsers() }',
        '}',
        'fun listUsers() {}',
      ].join('\n')
    );
    fs.writeFileSync(files[4], 'class MicronautApp { public static void main(String[] args) { Micronaut.run(MicronautApp.class); } }');
    fs.writeFileSync(
      files[5],
      [
        '@Controller("/orders")',
        'class OrderController {',
        '  private final OrderService orderService;',
        '  OrderController(OrderService orderService) { this.orderService = orderService; }',
        '  @Get("/{id}")',
        '  public OrderService show() { return orderService; }',
        '}',
      ].join('\n')
    );
    fs.writeFileSync(
      files[6],
      '@Singleton class OrderService { private final OrderRepository orderRepository; OrderService(OrderRepository orderRepository) { this.orderRepository = orderRepository; } }'
    );
    fs.writeFileSync(files[7], '@Repository class OrderRepository {}');
    fs.writeFileSync(files[8], '@QuarkusMain class QuarkusMain { public static void main(String... args) { Quarkus.run(args); } }');
    fs.writeFileSync(
      files[9],
      [
        '@Path("/users")',
        'class UserResource {',
        '  private final UserService userService;',
        '  UserResource(UserService userService) { this.userService = userService; }',
        '  @GET',
        '  public UserService listUsers() { return userService; }',
        '}',
      ].join('\n')
    );
    fs.writeFileSync(files[10], '@ApplicationScoped class UserService {}');
    fs.writeFileSync(files[11], 'ktor.deployment.port=8080');

    const graph = createFileGraph(projectDir, files);
    const stackProfile = await new StackInsightService().analyze(graph);
    const topology = await new StackTopologyService().analyze(graph, stackProfile);

    expect(
      topology.frameworkInsights.some(
        (entry) =>
          entry.adapterId === 'ktor-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'ktor_entry_routes') &&
          entry.relationships.some((relationship) => relationship.reason === 'ktor_route_function')
      )
    ).toBe(true);
    expect(
      topology.frameworkInsights.some(
        (entry) =>
          entry.adapterId === 'micronaut-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'micronaut_entry_controller') &&
          entry.relationships.some((relationship) => relationship.reason === 'micronaut_controller_service') &&
          entry.relationships.some((relationship) => relationship.reason === 'micronaut_service_repository') &&
          entry.relationships.some((relationship) => relationship.reason === 'micronaut_controller_method')
      )
    ).toBe(true);
    expect(
      topology.frameworkInsights.some(
        (entry) =>
          entry.adapterId === 'quarkus-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'quarkus_entry_resource') &&
          entry.relationships.some((relationship) => relationship.reason === 'quarkus_resource_service') &&
          entry.relationships.some((relationship) => relationship.reason === 'quarkus_resource_method')
      )
    ).toBe(true);
    expect(topology.frameworkInsights.some((entry) => entry.relationships.some((relationship) => relationship.reason === 'ktor_config_entry'))).toBe(true);
    expect(topology.frameworkInsights.some((entry) => entry.relationships.some((relationship) => relationship.reason === 'micronaut_config_entry'))).toBe(true);
    expect(topology.frameworkInsights.some((entry) => entry.relationships.some((relationship) => relationship.reason === 'quarkus_config_entry'))).toBe(true);
  });

  it('extracts backend topology for FastAPI, Django, Rails and Laravel', async () => {
    const projectDir = createTempProject();
    const files = [
      path.join(projectDir, 'requirements.txt'),
      path.join(projectDir, 'pyproject.toml'),
      path.join(projectDir, 'main.py'),
      path.join(projectDir, 'routers', 'users.py'),
      path.join(projectDir, 'manage.py'),
      path.join(projectDir, 'project', 'settings.py'),
      path.join(projectDir, 'project', 'urls.py'),
      path.join(projectDir, 'app', 'views.py'),
      path.join(projectDir, 'app', 'models.py'),
      path.join(projectDir, 'Gemfile'),
      path.join(projectDir, 'config', 'application.rb'),
      path.join(projectDir, 'config', 'routes.rb'),
      path.join(projectDir, 'app', 'controllers', 'users_controller.rb'),
      path.join(projectDir, 'app', 'models', 'user.rb'),
      path.join(projectDir, 'composer.json'),
      path.join(projectDir, 'artisan'),
      path.join(projectDir, 'routes', 'web.php'),
      path.join(projectDir, 'app', 'Http', 'Controllers', 'UserController.php'),
      path.join(projectDir, 'app', 'Models', 'User.php'),
    ];

    fs.mkdirSync(path.join(projectDir, 'routers'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'project'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'config'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'app', 'controllers'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'app', 'models'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'app', 'Http', 'Controllers'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'app', 'Models'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'routes'), { recursive: true });

    fs.writeFileSync(files[0], 'fastapi==0.115.0\ndjango==5.1.0\n');
    fs.writeFileSync(
      files[1],
      ['[tool.poetry]', 'name = "backend"', '', '[tool.poetry.dependencies]', 'python = "^3.12"', 'fastapi = "^0.115.0"', 'django = "^5.1.0"'].join('\n')
    );
    fs.writeFileSync(
      files[2],
      [
        'from fastapi import FastAPI',
        'from routers.users import router',
        'app = FastAPI()',
        'app.include_router(router)',
        '@app.get("/health")',
        'async def healthcheck():',
        '    return {"ok": True}',
      ].join('\n')
    );
    fs.writeFileSync(
      files[3],
      [
        'from fastapi import APIRouter',
        'router = APIRouter(prefix="/users")',
        '@router.get("/")',
        'async def list_users():',
        '    return []',
      ].join('\n')
    );
    fs.writeFileSync(files[4], 'import os\nos.environ.setdefault("DJANGO_SETTINGS_MODULE", "project.settings")\n');
    fs.writeFileSync(files[5], 'ROOT_URLCONF = "project.urls"\n');
    fs.writeFileSync(
      files[6],
      [
        'from django.urls import path',
        'from app.views import user_list',
        'urlpatterns = [',
        '  path("users/", user_list),',
        ']',
      ].join('\n')
    );
    fs.writeFileSync(
      files[7],
      [
        'from .models import User',
        'def user_list(request):',
        '  return User.objects.all()',
      ].join('\n')
    );
    fs.writeFileSync(files[8], 'from django.db import models\nclass User(models.Model):\n  pass\n');
    fs.writeFileSync(files[9], 'source "https://rubygems.org"\ngem "rails"\n');
    fs.writeFileSync(files[10], 'module Demo\n  class Application < Rails::Application\n  end\nend\n');
    fs.writeFileSync(files[11], 'Rails.application.routes.draw do\n  resources :users\nend\n');
    fs.writeFileSync(
      files[12],
      ['class UsersController < ApplicationController', '  def index', '    User.all', '  end', 'end'].join('\n')
    );
    fs.writeFileSync(files[13], 'class User < ApplicationRecord\nend\n');
    fs.writeFileSync(
      files[14],
      JSON.stringify(
        {
          require: { 'laravel/framework': '^11.0.0' },
        },
        null,
        2
      )
    );
    fs.writeFileSync(files[15], '#!/usr/bin/env php\n');
    fs.writeFileSync(
      files[16],
      [
        '<?php',
        'use App\\Http\\Controllers\\UserController;',
        "Route::get('/users', [UserController::class, 'index']);",
      ].join('\n')
    );
    fs.writeFileSync(
      files[17],
      [
        '<?php',
        'class UserController {',
        '  public function index() {',
        '    return User::query();',
        '  }',
        '}',
      ].join('\n')
    );
    fs.writeFileSync(files[18], '<?php\nclass User extends Model {}\n');

    const graph = createFileGraph(projectDir, files);
    const stackProfile = await new StackInsightService().analyze(graph);
    const topology = await new StackTopologyService().analyze(graph, stackProfile);

    expect(
      topology.frameworkInsights.some(
        (entry) =>
          entry.adapterId === 'fastapi-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'fastapi_entry_router') &&
          entry.relationships.some((relationship) => relationship.reason === 'fastapi_router_handler') &&
          entry.relationships.some((relationship) => relationship.reason === 'fastapi_app_handler')
      )
    ).toBe(true);
    expect(
      topology.frameworkInsights.some(
        (entry) =>
          entry.adapterId === 'django-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'django_manage_settings') &&
          entry.relationships.some((relationship) => relationship.reason === 'django_settings_urls') &&
          entry.relationships.some((relationship) => relationship.reason === 'django_url_view') &&
          entry.relationships.some((relationship) => relationship.reason === 'django_view_model')
      )
    ).toBe(true);
    expect(
      topology.frameworkInsights.some(
        (entry) =>
          entry.adapterId === 'rails-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'rails_entry_routes') &&
          entry.relationships.some((relationship) => relationship.reason === 'rails_routes_controller') &&
          entry.relationships.some((relationship) => relationship.reason === 'rails_controller_model')
      )
    ).toBe(true);
    expect(
      topology.frameworkInsights.some(
        (entry) =>
          entry.adapterId === 'laravel-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'laravel_artisan_routes') &&
          entry.relationships.some((relationship) => relationship.reason === 'laravel_route_controller') &&
          entry.relationships.some((relationship) => relationship.reason === 'laravel_controller_model')
      )
    ).toBe(true);
    expect(topology.frameworkInsights.some((entry) => entry.relationships.some((relationship) => relationship.reason === 'fastapi_config_entry'))).toBe(true);
    expect(topology.frameworkInsights.some((entry) => entry.relationships.some((relationship) => relationship.reason === 'django_config_entry'))).toBe(true);
    expect(topology.frameworkInsights.some((entry) => entry.relationships.some((relationship) => relationship.reason === 'laravel_config_entry'))).toBe(true);
  });

  it('extracts backend topology for Gin, Fiber, Echo, Axum and Actix Web', async () => {
    const projectDir = createTempProject();
    const files = [
      path.join(projectDir, 'go.mod'),
      path.join(projectDir, 'main.go'),
      path.join(projectDir, 'routes.go'),
      path.join(projectDir, 'fiber.go'),
      path.join(projectDir, 'echo.go'),
      path.join(projectDir, 'Cargo.toml'),
      path.join(projectDir, 'src', 'main.rs'),
      path.join(projectDir, 'src', 'routes.rs'),
      path.join(projectDir, 'src', 'actix.rs'),
    ];

    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });

    fs.writeFileSync(
      files[0],
      [
        'module backend',
        '',
        'require (',
        '  github.com/gin-gonic/gin v1.10.0',
        '  github.com/gofiber/fiber/v2 v2.52.0',
        '  github.com/labstack/echo/v4 v4.12.0',
        ')',
      ].join('\n')
    );
    fs.writeFileSync(
      files[1],
      [
        'package main',
        'import "github.com/gin-gonic/gin"',
        'func main() {',
        '  router := gin.Default()',
        '  router.GET("/users", listUsers)',
        '}',
        'func listUsers() {}',
      ].join('\n')
    );
    fs.writeFileSync(
      files[2],
      [
        'package main',
        'func registerRoutes(router any) {',
        '  router.GET("/health", healthcheck)',
        '}',
        'func healthcheck() {}',
      ].join('\n')
    );
    fs.writeFileSync(
      files[3],
      [
        'package main',
        'import "github.com/gofiber/fiber/v2"',
        'func buildFiber() {',
        '  app := fiber.New()',
        '  app.Get("/fiber", fiberUsers)',
        '}',
        'func fiberUsers(c any) error { return nil }',
      ].join('\n')
    );
    fs.writeFileSync(
      files[4],
      [
        'package main',
        'import "github.com/labstack/echo/v4"',
        'func buildEcho() {',
        '  e := echo.New()',
        '  e.GET("/echo", echoUsers)',
        '}',
        'func echoUsers(c any) error { return nil }',
      ].join('\n')
    );
    fs.writeFileSync(
      files[5],
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
      files[6],
      [
        'use axum::{routing::get, Router};',
        'async fn list_users() {}',
        'fn main() {',
        '  let _app = Router::new().route("/users", get(list_users));',
        '}',
      ].join('\n')
    );
    fs.writeFileSync(
      files[7],
      [
        'use axum::routing::post;',
        'async fn create_user() {}',
        'fn build_routes() {',
        '  let _ = axum::Router::new().route("/users", post(create_user));',
        '}',
      ].join('\n')
    );
    fs.writeFileSync(
      files[8],
      [
        'use actix_web::{get, web, App, HttpServer, Responder};',
        '#[get("/health")]',
        'async fn health() -> impl Responder { "" }',
        'async fn users() -> impl Responder { "" }',
        'fn main() {',
        '  let _ = HttpServer::new(|| App::new().service(health).route("/users", web::get().to(users)));',
        '}',
      ].join('\n')
    );

    const graph = createFileGraph(projectDir, files);
    const stackProfile = await new StackInsightService().analyze(graph);
    const topology = await new StackTopologyService().analyze(graph, stackProfile);

    expect(
      topology.frameworkInsights.some(
        (entry) =>
          entry.adapterId === 'gin-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'gin_entry_router') &&
          entry.relationships.some((relationship) => relationship.reason === 'gin_router_handler')
      )
    ).toBe(true);
    expect(
      topology.frameworkInsights.some(
        (entry) =>
          entry.adapterId === 'fiber-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'fiber_entry_router') &&
          entry.relationships.some((relationship) => relationship.reason === 'fiber_router_handler')
      )
    ).toBe(true);
    expect(
      topology.frameworkInsights.some(
        (entry) =>
          entry.adapterId === 'echo-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'echo_entry_router') &&
          entry.relationships.some((relationship) => relationship.reason === 'echo_router_handler')
      )
    ).toBe(true);
    expect(
      topology.frameworkInsights.some(
        (entry) =>
          entry.adapterId === 'axum-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'axum_entry_router') &&
          entry.relationships.some((relationship) => relationship.reason === 'axum_router_handler')
      )
    ).toBe(true);
    expect(
      topology.frameworkInsights.some(
        (entry) =>
          entry.adapterId === 'actix-web-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'actix_entry_routes') &&
          entry.relationships.some((relationship) => relationship.reason === 'actix_route_handler')
      )
    ).toBe(true);
    expect(topology.frameworkInsights.some((entry) => entry.relationships.some((relationship) => relationship.reason === 'gomod_gin_entry'))).toBe(true);
    expect(topology.frameworkInsights.some((entry) => entry.relationships.some((relationship) => relationship.reason === 'gomod_fiber_entry'))).toBe(true);
    expect(topology.frameworkInsights.some((entry) => entry.relationships.some((relationship) => relationship.reason === 'gomod_echo_entry'))).toBe(true);
    expect(topology.frameworkInsights.some((entry) => entry.relationships.some((relationship) => relationship.reason === 'cargo_axum_entry'))).toBe(true);
    expect(topology.frameworkInsights.some((entry) => entry.relationships.some((relationship) => relationship.reason === 'cargo_actix_entry'))).toBe(true);
  });

  it('extracts backend topology for Chi, gRPC-Go and Cargo workspaces', async () => {
    const projectDir = createTempProject();
    const files = [
      path.join(projectDir, 'go.mod'),
      path.join(projectDir, 'main.go'),
      path.join(projectDir, 'grpc_server.go'),
      path.join(projectDir, 'handlers.go'),
      path.join(projectDir, 'Cargo.toml'),
      path.join(projectDir, 'crates', 'api', 'Cargo.toml'),
      path.join(projectDir, 'crates', 'api', 'src', 'main.rs'),
      path.join(projectDir, 'crates', 'shared', 'Cargo.toml'),
      path.join(projectDir, 'crates', 'shared', 'src', 'lib.rs'),
    ];

    fs.mkdirSync(path.join(projectDir, 'crates', 'api', 'src'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'crates', 'shared', 'src'), { recursive: true });

    fs.writeFileSync(
      files[0],
      [
        'module backend',
        '',
        'require (',
        '  github.com/go-chi/chi/v5 v5.0.0',
        '  google.golang.org/grpc v1.67.0',
        ')',
      ].join('\n')
    );
    fs.writeFileSync(
      files[1],
      [
        'package main',
        'import "github.com/go-chi/chi/v5"',
        'func main() {',
        '  r := chi.NewRouter()',
        '  r.Get("/users", listUsers)',
        '}',
        'func listUsers() {}',
      ].join('\n')
    );
    fs.writeFileSync(
      files[2],
      [
        'package main',
        'import "google.golang.org/grpc"',
        'func startGrpc() {',
        '  srv := grpc.NewServer()',
        '  RegisterUserServiceServer(srv, UserServer)',
        '}',
      ].join('\n')
    );
    fs.writeFileSync(files[3], 'package main\ntype UserServer struct {}\n');
    fs.writeFileSync(
      files[4],
      [
        '[workspace]',
        'members = ["crates/api", "crates/shared"]',
      ].join('\n')
    );
    fs.writeFileSync(
      files[5],
      [
        '[package]',
        'name = "api"',
        'version = "0.1.0"',
        '',
        '[dependencies]',
        'shared = { path = "../shared" }',
        '',
        '[[bin]]',
        'name = "api"',
        'path = "src/main.rs"',
      ].join('\n')
    );
    fs.writeFileSync(files[6], 'fn main() {}\n');
    fs.writeFileSync(
      files[7],
      [
        '[package]',
        'name = "shared"',
        'version = "0.1.0"',
      ].join('\n')
    );
    fs.writeFileSync(files[8], 'pub fn helper() {}\n');

    const graph = createFileGraph(projectDir, files);
    const stackProfile = await new StackInsightService().analyze(graph);
    const topology = await new StackTopologyService().analyze(graph, stackProfile);

    expect(
      topology.frameworkInsights.some(
        (entry) =>
          entry.adapterId === 'chi-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'chi_entry_router') &&
          entry.relationships.some((relationship) => relationship.reason === 'chi_router_handler')
      )
    ).toBe(true);
    expect(
      topology.frameworkInsights.some(
        (entry) =>
          entry.adapterId === 'grpc-go-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'grpc_entry_registration') &&
          entry.relationships.some((relationship) => relationship.reason === 'grpc_registration_handler')
      )
    ).toBe(true);
    expect(topology.frameworkInsights.some((entry) => entry.relationships.some((relationship) => relationship.reason === 'gomod_chi_entry'))).toBe(true);
    expect(topology.frameworkInsights.some((entry) => entry.relationships.some((relationship) => relationship.reason === 'gomod_grpc_entry'))).toBe(true);
    expect(
      topology.buildInsights.some(
        (entry) =>
          entry.adapterId === 'cargo-build-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'cargo_workspace_member') &&
          entry.relationships.some((relationship) => relationship.reason === 'cargo_path_dependency') &&
          entry.relationships.some((relationship) => relationship.reason === 'cargo_bin_target')
      )
    ).toBe(true);
  });

  it('extracts build topology for Maven reactor and Gradle multi-module projects', async () => {
    const projectDir = createTempProject();
    const files = [
      path.join(projectDir, 'pom.xml'),
      path.join(projectDir, 'api', 'pom.xml'),
      path.join(projectDir, 'shared', 'pom.xml'),
      path.join(projectDir, 'settings.gradle.kts'),
      path.join(projectDir, 'build.gradle.kts'),
      path.join(projectDir, 'services', 'api', 'build.gradle.kts'),
      path.join(projectDir, 'services', 'shared', 'build.gradle.kts'),
    ];

    fs.mkdirSync(path.join(projectDir, 'api'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'shared'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'services', 'api'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'services', 'shared'), { recursive: true });

    fs.writeFileSync(
      files[0],
      [
        '<project>',
        '  <groupId>com.example</groupId>',
        '  <artifactId>platform</artifactId>',
        '  <modules>',
        '    <module>api</module>',
        '    <module>shared</module>',
        '  </modules>',
        '</project>',
      ].join('\n')
    );
    fs.writeFileSync(
      files[1],
      [
        '<project>',
        '  <groupId>com.example</groupId>',
        '  <artifactId>api</artifactId>',
        '  <dependencies>',
        '    <dependency>',
        '      <groupId>com.example</groupId>',
        '      <artifactId>shared</artifactId>',
        '    </dependency>',
        '  </dependencies>',
        '</project>',
      ].join('\n')
    );
    fs.writeFileSync(
      files[2],
      [
        '<project>',
        '  <groupId>com.example</groupId>',
        '  <artifactId>shared</artifactId>',
        '</project>',
      ].join('\n')
    );
    fs.writeFileSync(files[3], 'include(":services:api", ":services:shared")');
    fs.writeFileSync(files[4], 'plugins { java }');
    fs.writeFileSync(
      files[5],
      [
        'dependencies {',
        '  implementation(project(":services:shared"))',
        '}',
      ].join('\n')
    );
    fs.writeFileSync(files[6], 'plugins { java-library }');

    const graph = createFileGraph(projectDir, files);
    const stackProfile = await new StackInsightService().analyze(graph);
    const topology = await new StackTopologyService().analyze(graph, stackProfile);

    expect(
      topology.buildInsights.some(
        (entry) =>
          entry.adapterId === 'maven-build-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'maven_module_descriptor') &&
          entry.relationships.some((relationship) => relationship.reason === 'maven_module_dependency')
      )
    ).toBe(true);
    expect(
      topology.buildInsights.some(
        (entry) =>
          entry.adapterId === 'gradle-build-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'gradle_settings_module') &&
          entry.relationships.some((relationship) => relationship.reason === 'gradle_project_dependency')
      )
    ).toBe(true);
  });

  it('extracts monorepo build topology for pnpm workspaces, Nx and Turborepo', async () => {
    const projectDir = createTempProject();
    const files = [
      path.join(projectDir, 'package.json'),
      path.join(projectDir, 'pnpm-workspace.yaml'),
      path.join(projectDir, 'nx.json'),
      path.join(projectDir, 'turbo.json'),
      path.join(projectDir, 'apps', 'web', 'package.json'),
      path.join(projectDir, 'apps', 'web', 'project.json'),
      path.join(projectDir, 'packages', 'shared', 'package.json'),
      path.join(projectDir, 'packages', 'shared', 'project.json'),
    ];

    fs.mkdirSync(path.join(projectDir, 'apps', 'web'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'packages', 'shared'), { recursive: true });

    fs.writeFileSync(
      files[0],
      JSON.stringify(
        {
          name: 'workspace-root',
          packageManager: 'pnpm@10.0.0',
          workspaces: ['apps/*', 'packages/*'],
          devDependencies: {
            nx: '^20.0.0',
            turbo: '^2.0.0',
          },
        },
        null,
        2
      )
    );
    fs.writeFileSync(files[1], "packages:\n  - 'apps/*'\n  - 'packages/*'\n");
    fs.writeFileSync(files[2], JSON.stringify({ npmScope: 'workspace' }, null, 2));
    fs.writeFileSync(
      files[3],
      JSON.stringify(
        {
          tasks: {
            build: {
              dependsOn: ['^build'],
            },
          },
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      files[4],
      JSON.stringify(
        {
          name: '@workspace/web',
          scripts: {
            build: 'vite build',
          },
          dependencies: {
            '@workspace/shared': 'workspace:*',
          },
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      files[5],
      JSON.stringify(
        {
          name: 'web',
          implicitDependencies: ['shared'],
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      files[6],
      JSON.stringify(
        {
          name: '@workspace/shared',
          scripts: {
            build: 'tsup src/index.ts',
          },
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      files[7],
      JSON.stringify(
        {
          name: 'shared',
        },
        null,
        2
      )
    );

    const graph = createFileGraph(projectDir, files);
    const stackProfile = await new StackInsightService().analyze(graph);
    const topology = await new StackTopologyService().analyze(graph, stackProfile);

    expect(
      topology.buildInsights.some(
        (entry) =>
          entry.adapterId === 'pnpm-workspace-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'pnpm_workspace_package') &&
          entry.relationships.some((relationship) => relationship.reason === 'pnpm_workspace_dependency')
      )
    ).toBe(true);
    expect(
      topology.buildInsights.some(
        (entry) =>
          entry.adapterId === 'nx-workspace-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'nx_workspace_project') &&
          entry.relationships.some((relationship) => relationship.reason === 'nx_implicit_dependency') &&
          entry.relationships.some((relationship) => relationship.reason === 'nx_project_package')
      )
    ).toBe(true);
    expect(
      topology.buildInsights.some(
        (entry) =>
          entry.adapterId === 'turborepo-build-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'turbo_pipeline_package') &&
          entry.relationships.some((relationship) => relationship.reason === 'turbo_workspace_dependency')
      )
    ).toBe(true);
  });

  it('extracts contract and codegen topology for OpenAPI and protobuf/gRPC', async () => {
    const projectDir = createTempProject();
    const files = [
      path.join(projectDir, 'package.json'),
      path.join(projectDir, 'openapi.yaml'),
      path.join(projectDir, 'openapi-generator-config.json'),
      path.join(projectDir, 'src', 'generated', 'openapi', 'client.ts'),
      path.join(projectDir, 'proto', 'user.proto'),
      path.join(projectDir, 'buf.gen.yaml'),
      path.join(projectDir, 'gen', 'user.pb.go'),
      path.join(projectDir, 'gen', 'ts', 'user.connect.ts'),
      path.join(projectDir, 'gen', 'ts', 'user.grpc-web.ts'),
      path.join(projectDir, 'grpc_server.go'),
      path.join(projectDir, 'src', 'handlers', 'users.ts'),
      path.join(projectDir, 'src', 'clients', 'connectClient.ts'),
      path.join(projectDir, 'src', 'clients', 'grpcWebClient.ts'),
    ];

    fs.mkdirSync(path.join(projectDir, 'src', 'generated', 'openapi'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'proto'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'gen'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'gen', 'ts'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'src', 'handlers'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'src', 'clients'), { recursive: true });

    fs.writeFileSync(
      files[0],
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
      files[1],
      [
        'openapi: 3.1.0',
        'paths:',
        '  /users:',
        '    get:',
        '      operationId: listUsers',
      ].join('\n')
    );
    fs.writeFileSync(
      files[2],
      JSON.stringify(
        {
          generatorName: 'typescript-fetch',
          inputSpec: 'openapi.yaml',
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      files[3],
      [
        '/** Generated by OpenAPI Generator */',
        'export async function listUsers() { return fetch("/users"); }',
      ].join('\n')
    );
    fs.writeFileSync(
      files[4],
      [
        'syntax = "proto3";',
        'service UserService {',
        '  rpc ListUsers (ListUsersRequest) returns (ListUsersResponse);',
        '}',
      ].join('\n')
    );
    fs.writeFileSync(
      files[5],
      [
        'version: v1',
        'plugins:',
        '  - name: go',
        '    out: gen',
        '  - name: connect-es',
        '    out: gen/ts',
        '  - name: grpc-web',
        '    out: gen/ts',
      ].join('\n')
    );
    fs.writeFileSync(
      files[6],
      [
        '// Code generated by protoc-gen-go. DO NOT EDIT.',
        'package gen',
      ].join('\n')
    );
    fs.writeFileSync(
      files[7],
      [
        'import { MethodKind } from "@connectrpc/connect";',
        'export const UserService = { typeName: "UserService", methods: { listUsers: { kind: MethodKind.Unary } } };',
      ].join('\n')
    );
    fs.writeFileSync(
      files[8],
      [
        'export class UserServicePromiseClient {}',
        'export class GrpcWebImpl {}',
      ].join('\n')
    );
    fs.writeFileSync(
      files[9],
      [
        'package main',
        'func startGrpc(srv any) {',
        '  RegisterUserServiceServer(srv, userServer)',
        '}',
      ].join('\n')
    );
    fs.writeFileSync(
      files[10],
      [
        'export async function listUsers() {',
        '  return fetch("/users");',
        '}',
      ].join('\n')
    );
    fs.writeFileSync(
      files[11],
      [
        'import { createPromiseClient } from "@connectrpc/connect";',
        'import { createConnectTransport } from "@connectrpc/connect-web";',
        'import { UserService } from "../../../gen/ts/user.connect";',
        'const transport = createConnectTransport({ baseUrl: "/api" });',
        'export const client = createPromiseClient(UserService, transport);',
      ].join('\n')
    );
    fs.writeFileSync(
      files[12],
      [
        'import { GrpcWebFetchTransport } from "grpc-web";',
        'import { UserServicePromiseClient } from "../../../gen/ts/user.grpc-web";',
        'const transport = new GrpcWebFetchTransport({ baseUrl: "/api" });',
        'export const client = new UserServicePromiseClient(transport);',
      ].join('\n')
    );

    const graph = createFileGraph(projectDir, files);
    graph.nodes.push(
      { id: `${files[3]}#listUsers`, label: 'listUsers', group: 1, type: 'function', churn: 1 },
      { id: `${files[10]}#listUsers`, label: 'listUsers', group: 1, type: 'function', churn: 1 },
      { id: `${files[7]}#UserService`, label: 'UserService', group: 1, type: 'class', churn: 1 },
      {
        id: `${files[8]}#UserServicePromiseClient`,
        label: 'UserServicePromiseClient',
        group: 1,
        type: 'class',
        churn: 1,
      },
      { id: `${files[9]}#startGrpc`, label: 'startGrpc', group: 1, type: 'function', churn: 1 },
      { id: `${files[11]}#client`, label: 'client', group: 1, type: 'function', churn: 1 },
      { id: `${files[12]}#client`, label: 'client', group: 1, type: 'function', churn: 1 }
    );
    const stackProfile = await new StackInsightService().analyze(graph);
    const topology = await new StackTopologyService().analyze(graph, stackProfile);

    expect(
      topology.buildInsights.some(
        (entry) =>
          entry.adapterId === 'openapi-contract-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'openapi_codegen_spec') &&
          entry.relationships.some((relationship) => relationship.reason === 'openapi_generated_module') &&
          entry.relationships.some((relationship) => relationship.reason === 'openapi_operation_symbol') &&
          entry.relationships.some((relationship) => relationship.reason === 'openapi_operation_runtime_binding')
      )
    ).toBe(true);
    expect(
      topology.buildInsights.some(
        (entry) =>
          entry.adapterId === 'protobuf-contract-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'protobuf_config_schema') &&
          entry.relationships.some((relationship) => relationship.reason === 'protobuf_generated_module') &&
          entry.relationships.some((relationship) => relationship.reason === 'buf_codegen_output') &&
          entry.relationships.some((relationship) => relationship.reason === 'connectrpc_generated_module') &&
          entry.relationships.some((relationship) => relationship.reason === 'grpc_web_generated_module') &&
          entry.relationships.some((relationship) => relationship.reason === 'proto_service_symbol') &&
          entry.relationships.some((relationship) => relationship.reason === 'proto_client_symbol')
      )
    ).toBe(true);
    expect(
      topology.buildInsights.some(
        (entry) =>
          entry.adapterId === 'protobuf-contract-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'proto_service_runtime_binding') &&
          entry.relationships.some((relationship) => relationship.reason === 'connectrpc_runtime_binding') &&
          entry.relationships.some((relationship) => relationship.reason === 'grpc_web_runtime_binding') &&
          entry.relationships.some((relationship) => relationship.reason === 'proto_server_symbol') &&
          entry.relationships.some((relationship) => relationship.reason === 'connectrpc_client_symbol') &&
          entry.relationships.some((relationship) => relationship.reason === 'grpc_web_client_symbol')
      )
    ).toBe(true);
  });

  it('resolves contract runtime bindings across naming conventions and languages', async () => {
    const projectDir = createTempProject();
    const files = [
      path.join(projectDir, 'openapi.yaml'),
      path.join(projectDir, 'openapi-generator-config.json'),
      path.join(projectDir, 'src', 'generated', 'openapi', 'client.ts'),
      path.join(projectDir, 'api', 'users.py'),
      path.join(projectDir, 'UsersController.cs'),
      path.join(projectDir, 'proto', 'user.proto'),
      path.join(projectDir, 'grpc_server.py'),
      path.join(projectDir, 'grpc_server.cs'),
    ];

    fs.mkdirSync(path.join(projectDir, 'src', 'generated', 'openapi'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'api'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'proto'), { recursive: true });

    fs.writeFileSync(
      files[0],
      [
        'openapi: 3.1.0',
        'paths:',
        '  /users:',
        '    get:',
        '      operationId: listUsers',
      ].join('\n')
    );
    fs.writeFileSync(
      files[1],
      JSON.stringify(
        {
          generatorName: 'typescript-fetch',
          inputSpec: 'openapi.yaml',
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      files[2],
      [
        '/** Generated by OpenAPI Generator */',
        'export async function listUsers() { return fetch("/users"); }',
      ].join('\n')
    );
    fs.writeFileSync(
      files[3],
      [
        'from fastapi import APIRouter',
        'router = APIRouter()',
        '@router.get("/users")',
        'async def list_users():',
        '    return []',
      ].join('\n')
    );
    fs.writeFileSync(
      files[4],
      [
        '[ApiController]',
        'public class UsersController : ControllerBase {',
        '  [HttpGet("/users")]',
        '  public IEnumerable<string> ListUsers() { return Array.Empty<string>(); }',
        '}',
      ].join('\n')
    );
    fs.writeFileSync(
      files[5],
      [
        'syntax = "proto3";',
        'service UserService {',
        '  rpc ListUsers (ListUsersRequest) returns (ListUsersResponse);',
        '}',
      ].join('\n')
    );
    fs.writeFileSync(
      files[6],
      [
        'class UserServiceServicer:',
        '    pass',
        '',
        'def serve(server):',
        '    add_UserServiceServicer_to_server(UserServiceServicer(), server)',
      ].join('\n')
    );
    fs.writeFileSync(
      files[7],
      [
        'public class UserServiceImpl : UserService.UserServiceBase {}',
        'public static class Bootstrap {',
        '  public static void Register(ServerServiceDefinition builder) {',
        '    builder = UserService.BindService(new UserServiceImpl());',
        '  }',
        '}',
      ].join('\n')
    );

    const graph = createFileGraph(projectDir, files);
    graph.nodes.push(
      { id: `${files[2]}#listUsers`, label: 'listUsers', group: 1, type: 'function', churn: 1 },
      { id: `${files[3]}#list_users`, label: 'list_users', group: 1, type: 'function', churn: 1 },
      { id: `${files[4]}#ListUsers`, label: 'ListUsers', group: 1, type: 'function', churn: 1 },
      {
        id: `${files[6]}#UserServiceServicer`,
        label: 'UserServiceServicer',
        group: 1,
        type: 'class',
        churn: 1,
      },
      { id: `${files[7]}#UserServiceImpl`, label: 'UserServiceImpl', group: 1, type: 'class', churn: 1 }
    );

    const stackProfile = await new StackInsightService().analyze(graph);
    const topology = await new StackTopologyService().analyze(graph, stackProfile);
    const openApiInsight = topology.buildInsights.find(
      (entry) => entry.adapterId === 'openapi-contract-topology'
    );
    const protobufInsight = topology.buildInsights.find(
      (entry) => entry.adapterId === 'protobuf-contract-topology'
    );

    expect(openApiInsight).toBeTruthy();
    expect(
      openApiInsight?.relationships.some(
        (relationship) =>
          relationship.reason === 'openapi_operation_symbol' &&
          relationship.target === 'src/generated/openapi/client.ts#listUsers'
      )
    ).toBe(true);
    expect(
      openApiInsight?.relationships.some(
        (relationship) =>
          relationship.reason === 'openapi_operation_runtime_binding' &&
          relationship.target === 'api/users.py#list_users'
      )
    ).toBe(true);
    expect(
      openApiInsight?.relationships.some(
        (relationship) =>
          relationship.reason === 'openapi_operation_runtime_binding' &&
          relationship.target === 'UsersController.cs#ListUsers'
      )
    ).toBe(true);

    expect(protobufInsight).toBeTruthy();
    expect(
      protobufInsight?.relationships.some(
        (relationship) =>
          relationship.reason === 'proto_server_symbol' &&
          relationship.target === 'grpc_server.py#UserServiceServicer'
      )
    ).toBe(true);
    expect(
      protobufInsight?.relationships.some(
        (relationship) =>
          relationship.reason === 'proto_server_symbol' &&
          relationship.target === 'grpc_server.cs#UserServiceImpl'
      )
    ).toBe(true);
  });

  it('extracts build topology for Bazel and Pants monorepos', async () => {
    const projectDir = createTempProject();
    const files = [
      path.join(projectDir, 'MODULE.bazel'),
      path.join(projectDir, 'app', 'BUILD.bazel'),
      path.join(projectDir, 'app', 'main.ts'),
      path.join(projectDir, 'libs', 'shared', 'BUILD.bazel'),
      path.join(projectDir, 'libs', 'shared', 'shared.ts'),
      path.join(projectDir, 'pants.toml'),
      path.join(projectDir, 'BUILDROOT'),
      path.join(projectDir, 'src', 'python', 'app', 'BUILD'),
      path.join(projectDir, 'src', 'python', 'app', 'app.py'),
      path.join(projectDir, 'src', 'python', 'lib', 'BUILD'),
      path.join(projectDir, 'src', 'python', 'lib', 'util.py'),
    ];

    fs.mkdirSync(path.join(projectDir, 'app'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'libs', 'shared'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'src', 'python', 'app'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'src', 'python', 'lib'), { recursive: true });

    fs.writeFileSync(files[0], 'module(name = "workspace")\n');
    fs.writeFileSync(
      files[1],
      [
        'ts_project(',
        '  name = "app",',
        '  srcs = ["main.ts"],',
        '  deps = ["//libs/shared:shared"],',
        ')',
      ].join('\n')
    );
    fs.writeFileSync(files[2], 'export const main = true;\n');
    fs.writeFileSync(
      files[3],
      [
        'ts_project(',
        '  name = "shared",',
        '  srcs = ["shared.ts"],',
        ')',
      ].join('\n')
    );
    fs.writeFileSync(files[4], 'export const shared = true;\n');
    fs.writeFileSync(files[5], '[GLOBAL]\npants_version = "2.23.0"\n');
    fs.writeFileSync(files[6], '');
    fs.writeFileSync(
      files[7],
      [
        'python_sources(',
        '  name="app",',
        '  sources=["app.py"],',
        '  dependencies=["src/python/lib:lib"],',
        ')',
      ].join('\n')
    );
    fs.writeFileSync(files[8], 'print("app")\n');
    fs.writeFileSync(
      files[9],
      [
        'python_sources(',
        '  name="lib",',
        '  sources=["util.py"],',
        ')',
      ].join('\n')
    );
    fs.writeFileSync(files[10], 'print("util")\n');

    const graph = createFileGraph(projectDir, files);
    const stackProfile = await new StackInsightService().analyze(graph);
    const topology = await new StackTopologyService().analyze(graph, stackProfile);

    expect(
      topology.buildInsights.some(
        (entry) =>
          entry.adapterId === 'bazel-build-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'bazel_workspace_package') &&
          entry.relationships.some((relationship) => relationship.reason === 'bazel_target_source') &&
          entry.relationships.some((relationship) => relationship.reason === 'bazel_target_dependency')
      )
    ).toBe(true);
    expect(
      topology.buildInsights.some(
        (entry) =>
          entry.adapterId === 'pants-build-topology' &&
          entry.relationships.some((relationship) => relationship.reason === 'pants_workspace_package') &&
          entry.relationships.some((relationship) => relationship.reason === 'pants_target_source') &&
          entry.relationships.some((relationship) => relationship.reason === 'pants_target_dependency')
      )
    ).toBe(true);
  });
});
