import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { KuzuGraphService } from '../electron/services/KuzuGraphService.js';
import { KuzuIntegration } from '../electron/services/KuzuIntegration.js';
import { OracleService } from '../electron/oracle.js';

async function runTests() {
  console.log('🧪 Starting CodeMaps End-to-End Tests\n');
  let passed = 0;
  let failed = 0;

  const testProjectDir = path.join(os.tmpdir(), 'codemaps-test-project');
  if (fs.existsSync(testProjectDir)) {
    fs.rmSync(testProjectDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testProjectDir, { recursive: true });
  fs.writeFileSync(path.join(testProjectDir, 'utils.ts'), 'export function helper() {}');
  fs.writeFileSync(path.join(testProjectDir, 'App.tsx'), 'import { helper } from "./utils";\nhelper();');

  const oracle = new OracleService();
  console.log('⏳ Analyzing real project directory...');
  const realGraphData = await oracle.analyzeProject(testProjectDir);
  console.log('✅ Project analyzed. Nodes:', realGraphData.nodes.length);

  // Test 1: KuzuGraphService initialization
  try {
    const service = new KuzuGraphService(testProjectDir);
    await service.init();
    console.log('✅ Test 1: KuzuGraphService initialized');
    passed++;
    await service.close();
  } catch (err: any) {
    console.error('❌ Test 1 failed:', err.message);
    failed++;
  }

  // Test 2: Store graph data
  try {
    const integration = new KuzuIntegration(testProjectDir);
    await integration.init();
    await integration.storeGraph(realGraphData);
    const stats = await integration.getStats();
    console.log('✅ Test 2: Graph stored -', JSON.stringify(stats));
    passed++;
    await integration.close();
  } catch (err: any) {
    console.error('❌ Test 2 failed:', err.message);
    failed++;
  }

  // Test 3: Query nodes
  try {
    const service = new KuzuGraphService(testProjectDir);
    await service.init();
    const nodes = await service.queryNodes('file');
    console.log('✅ Test 3: Query nodes -', nodes.length, 'files found');
    passed++;
    await service.close();
  } catch (err: any) {
    console.error('❌ Test 3 failed:', err.message);
    failed++;
  }

  // Test 4: Query neighbors (blast radius)
  try {
    const service = new KuzuGraphService(testProjectDir);
    await service.init();
    const neighbors = await service.queryNeighbors('App.tsx');
    console.log('✅ Test 4: Blast radius -', neighbors.length, 'connected nodes');
    passed++;
    await service.close();
  } catch (err: any) {
    console.error('❌ Test 4 failed:', err.message);
    failed++;
  }

  // Test 5: Cypher query
  try {
    const service = new KuzuGraphService(testProjectDir);
    await service.init();
    const result = await service.query('MATCH (n:FileNode) RETURN n.id, n.label');
    const rows = await result.getAll();
    console.log('✅ Test 5: Cypher query -', rows.length, 'rows');
    passed++;
    await service.close();
  } catch (err: any) {
    console.error('❌ Test 5 failed:', err.message);
    failed++;
  }

  // Test 6: Persistence (close and reopen)
  try {
    const service1 = new KuzuGraphService(testProjectDir);
    await service1.init();
    const stats1 = await service1.getStats();
    await service1.close();

    const service2 = new KuzuGraphService(testProjectDir);
    await service2.init();
    const stats2 = await service2.getStats();
    await service2.close();

    if (stats1.nodes === stats2.nodes && stats1.edges === stats2.edges) {
      console.log('✅ Test 6: Persistence works - data survives restart');
      passed++;
    } else {
      throw new Error('Data not persisted');
    }
  } catch (err: any) {
    console.error('❌ Test 6 failed:', err.message);
    failed++;
  }

  // Summary
  console.log('\n📊 Test Results:');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Success rate: ${Math.round((passed / (passed + failed)) * 100)}%`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
