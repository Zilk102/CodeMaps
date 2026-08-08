import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OracleService } from '../oracle';
import { StackGraphEnrichmentService } from './StackGraphEnrichmentService';

describe('StackGraphEnrichmentService integration', () => {
  let testProjectDir: string;
  let oracle: OracleService;

  beforeEach(() => {
    testProjectDir = path.join(
      os.tmpdir(),
      `codemaps-stack-enrichment-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
    fs.mkdirSync(path.join(testProjectDir, 'app', 'api', 'health'), { recursive: true });
    fs.mkdirSync(path.join(testProjectDir, 'src'), { recursive: true });

    fs.writeFileSync(
      path.join(testProjectDir, 'package.json'),
      JSON.stringify(
        {
          name: 'frontend-app',
          dependencies: {
            react: '^19.0.0',
            next: '^15.0.0',
            '@nestjs/core': '^11.0.0',
          },
          devDependencies: {
            vite: '^8.0.0',
          },
        },
        null,
        2
      )
    );
    fs.writeFileSync(path.join(testProjectDir, 'vite.config.ts'), 'export default {};');
    fs.writeFileSync(path.join(testProjectDir, 'index.html'), '<!doctype html><html></html>');
    fs.writeFileSync(path.join(testProjectDir, 'README.md'), '# Test Project');
    fs.writeFileSync(path.join(testProjectDir, 'src', 'main.tsx'), 'export default {};');
    fs.mkdirSync(path.join(testProjectDir, 'nest'), { recursive: true });
    fs.writeFileSync(
      path.join(testProjectDir, 'app', 'layout.tsx'),
      'export default function RootLayout({ children }: { children: React.ReactNode }) { return children; }'
    );
    fs.writeFileSync(
      path.join(testProjectDir, 'app', 'page.tsx'),
      'export default function HomePage() { return <div>Home</div>; }'
    );
    fs.writeFileSync(
      path.join(testProjectDir, 'app', 'api', 'health', 'route.ts'),
      'export async function GET() { return Response.json({ ok: true }); }'
    );
    fs.writeFileSync(path.join(testProjectDir, 'nest', 'main.ts'), 'bootstrap();');
    fs.writeFileSync(
      path.join(testProjectDir, 'nest', 'app.module.ts'),
      '@Module({ controllers: [AppController], providers: [AppService] }) export class AppModule {}'
    );
    fs.writeFileSync(
      path.join(testProjectDir, 'nest', 'app.controller.ts'),
      '@Controller() export class AppController { constructor(private readonly appService: AppService) {} @Get() getUsers() { return this.appService; } }'
    );
    fs.writeFileSync(
      path.join(testProjectDir, 'nest', 'app.service.ts'),
      '@Injectable() export class AppService {}'
    );
    fs.mkdirSync(path.join(testProjectDir, 'spring'), { recursive: true });
    fs.writeFileSync(
      path.join(testProjectDir, 'pom.xml'),
      '<project><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>'
    );
    fs.writeFileSync(
      path.join(testProjectDir, 'spring', 'pom.xml'),
      '<project><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>'
    );
    fs.writeFileSync(
      path.join(testProjectDir, 'spring', 'DemoApplication.java'),
      '@SpringBootApplication class DemoApplication {}'
    );
    fs.writeFileSync(
      path.join(testProjectDir, 'spring', 'UserController.java'),
      [
        '@RestController',
        'class UserController {',
        '  @GetMapping("/users")',
        '  public UserService listUsers() {',
        '    return null;',
        '  }',
        '}',
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(testProjectDir, 'spring', 'UserService.java'),
      '@Service class UserService {}'
    );
    fs.mkdirSync(path.join(testProjectDir, 'aspnet'), { recursive: true });
    fs.writeFileSync(
      path.join(testProjectDir, 'aspnet', 'backend.csproj'),
      '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>'
    );
    fs.writeFileSync(
      path.join(testProjectDir, 'aspnet', 'Program.cs'),
      'var builder = WebApplication.CreateBuilder(args);'
    );
    fs.writeFileSync(
      path.join(testProjectDir, 'aspnet', 'UsersController.cs'),
      '[ApiController] public class UsersController : ControllerBase { [HttpGet] public UserService GetUsers() { return null; } }'
    );
    fs.writeFileSync(
      path.join(testProjectDir, 'aspnet', 'UserService.cs'),
      'public class UserService {}'
    );

    oracle = new OracleService();
  });

  afterEach(async () => {
    await oracle.close().catch(() => undefined);
    if (fs.existsSync(testProjectDir)) {
      fs.rmSync(testProjectDir, { recursive: true, force: true });
    }
  });

  it('adds framework and build edges to the graph after project analysis', async () => {
    const graph = await oracle.analyzeProject(testProjectDir);
    const toId = (relativePath: string) =>
      path.join(testProjectDir, relativePath).replace(/\\/g, '/');

    expect(
      graph.links.some(
        (link) =>
          link.type === 'build' &&
          link.reason === 'vite_config_entry' &&
          link.source === toId('vite.config.ts') &&
          link.target === toId('src/main.tsx')
      )
    ).toBe(true);

    expect(
      graph.links.some(
        (link) =>
          link.type === 'framework' &&
          link.reason === 'nextjs_layout_route' &&
          link.source === `${toId('app/layout.tsx')}#RootLayout` &&
          link.target === `${toId('app/page.tsx')}#HomePage`
      )
    ).toBe(true);

    expect(
      graph.links.some(
        (link) =>
          link.type === 'framework' &&
          link.reason === 'nestjs_module_controller' &&
          link.source === `${toId('nest/app.module.ts')}#AppModule` &&
          link.target === `${toId('nest/app.controller.ts')}#AppController`
      )
    ).toBe(true);

    expect(
      graph.links.some(
        (link) =>
          link.type === 'framework' &&
          link.reason === 'nestjs_controller_provider' &&
          link.source === `${toId('nest/app.controller.ts')}#AppController` &&
          link.target === `${toId('nest/app.service.ts')}#AppService`
      )
    ).toBe(true);

    expect(
      graph.links.some(
        (link) =>
          link.type === 'framework' &&
          link.reason === 'nestjs_controller_method' &&
          link.source === `${toId('nest/app.controller.ts')}#AppController` &&
          link.target === `${toId('nest/app.controller.ts')}#getUsers`
      )
    ).toBe(true);
  });

  it('skips generic watcher refreshes but rebuilds on runtime composition roots', async () => {
    const graph = await oracle.analyzeProject(testProjectDir);
    const toId = (relativePath: string) =>
      path.join(testProjectDir, relativePath).replace(/\\/g, '/');
    const oracleInternal = oracle as unknown as {
      stackGraphEnrichmentService: StackGraphEnrichmentService;
    };

    const skipped = await oracleInternal.stackGraphEnrichmentService.rebuildForChangedPaths(
      graph,
      [toId('README.md')],
      'change'
    );
    expect(skipped.mode).toBe('skipped');
    expect(skipped.reason).toBe('no_stack_impact');
    expect(skipped.linksAdded).toBe(0);

    const rebuilt = await oracleInternal.stackGraphEnrichmentService.rebuildForChangedPaths(
      graph,
      [toId('aspnet/Program.cs')],
      'change'
    );
    expect(rebuilt.mode).toBe('rebuilt');
    expect(rebuilt.reason).toBe('stack_runtime_path_changed');
    expect(rebuilt.linksAdded).toBeGreaterThan(0);
    const latestGraph = oracle.getGraph();
    expect(latestGraph.refreshTelemetry?.enrichment.skippedRefreshes).toBeGreaterThanOrEqual(1);
    expect(latestGraph.refreshTelemetry?.enrichment.runtimePriorityRebuilds).toBeGreaterThanOrEqual(
      1
    );
    expect(latestGraph.refreshTelemetry?.enrichment.avgRefreshLatencyMs).toBeGreaterThanOrEqual(0);
  });
});
