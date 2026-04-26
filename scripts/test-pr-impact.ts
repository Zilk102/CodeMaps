import { PRImpactAnalyzer } from './electron/services/PRImpactAnalyzer';

// Mock test for PR Impact Analysis
async function runTests() {
  console.log('🧪 PR Impact Analyzer Tests\n');
  let passed = 0;
  let failed = 0;

  // Test 1: Initialize analyzer
  try {
    const analyzer = new PRImpactAnalyzer('/tmp/test-project');
    await analyzer.init();
    console.log('✅ Test 1: Analyzer initialized');
    passed++;
    await analyzer.close();
  } catch (err: any) {
    console.error('❌ Test 1:', err.message);
    failed++;
  }

  // Test 2: Analyze with empty changes
  try {
    const analyzer = new PRImpactAnalyzer('/tmp/test-project');
    await analyzer.init();
    const result = await analyzer.analyzePR('non-existent-branch', 'HEAD');
    
    if (result.changedFiles.length === 0 && result.riskScore === 'low') {
      console.log('✅ Test 2: Empty PR analysis works');
      passed++;
    } else {
      throw new Error('Expected empty result');
    }
    await analyzer.close();
  } catch (err: any) {
    console.error('❌ Test 2:', err.message);
    failed++;
  }

  // Test 3: Risk score calculation
  try {
    const analyzer = new PRImpactAnalyzer('/tmp/test-project');
    await analyzer.init();
    
    // Mock result with high impact
    const result = await analyzer.analyzePR('main', 'feature-branch');
    const validRisks = ['low', 'medium', 'high', 'critical'];
    
    if (validRisks.includes(result.riskScore)) {
      console.log('✅ Test 3: Risk score valid:', result.riskScore);
      passed++;
    } else {
      throw new Error('Invalid risk score');
    }
    await analyzer.close();
  } catch (err: any) {
    console.error('❌ Test 3:', err.message);
    failed++;
  }

  console.log('\n📊 Results: ✅', passed, '❌', failed);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
