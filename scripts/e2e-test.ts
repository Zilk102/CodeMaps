import { KuzuGraphService } from './electron/services/KuzuGraphService';
import { KuzuIntegration } from './electron/services/KuzuIntegration';

// Simulate graph data from analyzer
const mockGraphData = {
  projectRoot: '/tmp/test-project',
  nodes: [
    { id: 'src/App.tsx', label: 'App.tsx', group: 1, type: 'file', churn: 5 },
    { id: 'src/utils.ts', label: 'utils.ts', group: 1, type: 'file', churn: 3 },
    { id: 'src/App', label: 'App', group: 2, type: 'function', churn: 2 },
    { id: 'src/helper', label: 'helper', group: 2, type: 'function', churn: 1 }
  ],
  links: [
    { source: 'src/App.tsx', target: 'src/utils.ts', value: 1, type: 'import' },
    { source: 'src/App', target: 'src/helper', value: 1, type: 'call' }
  ]
};

async function runTests() {
  console.log('🧪 Starting CodeMaps End-to-End Tests\n');
  let passed = 0;
  let failed = 0;

  // Test 1: KuzuGraphService initialization
  try {
    const service = new KuzuGraphService('/tmp/test-project');
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
    const integration = new KuzuIntegration('/tmp/test-project');
    await integration.init();
    await integration.storeGraph(mockGraphData);
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
    const service = new KuzuGraphService('/tmp/test-project');
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
    const service = new KuzuGraphService('/tmp/test-project');
    await service.init();
    const neighbors = await service.queryNeighbors('src/App.tsx');
    console.log('✅ Test 4: Blast radius -', neighbors.length, 'connected nodes');
    passed++;
    await service.close();
  } catch (err: any) {
    console.error('❌ Test 4 failed:', err.message);
    failed++;
  }

  // Test 5: Cypher query
  try {
    const service = new KuzuGraphService('/tmp/test-project');
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
    const service1 = new KuzuGraphService('/tmp/test-project');
    await service1.init();
    const stats1 = await service1.getStats();
    await service1.close();

    const service2 = new KuzuGraphService('/tmp/test-project');
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
