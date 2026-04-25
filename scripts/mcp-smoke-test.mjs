import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const endpoint = process.env.MCP_ENDPOINT || 'http://127.0.0.1:3005/mcp';
const projectPath = process.env.MCP_PROJECT_PATH || 'D:/PROJECT/CodeMaps';

const client = new Client({
  name: 'codemaps-smoke-test',
  version: '1.0.0',
}, {
  capabilities: {},
});

const transport = new StreamableHTTPClientTransport(new URL(endpoint));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`[ASSERT FAILED] ${message}`);
  }
};

const parseFirstTextPayload = (response, toolName) => {
  const textItem = response.content?.find((item) => item.type === 'text');
  if (!textItem?.text) {
    throw new Error(`[MCP] ${toolName}: empty text payload`);
  }

  let payload;
  try {
    payload = JSON.parse(textItem.text);
  } catch {
    throw new Error(`[MCP] ${toolName}: non-JSON payload: ${textItem.text}`);
  }

  if (payload?.status === 'error') {
    throw new Error(`[MCP] ${toolName}: ${payload.message || 'unknown error'}`);
  }

  return payload;
};

const expectOk = (payload, toolName) => {
  assert(payload.status === 'ok', `${toolName}: expected status 'ok', got ${JSON.stringify(payload.status)}`);
};

const trackedErrors = [];
const stats = { tools: 0, resources: 0, passed: 0, failed: 0 };

const runTool = async (name, args = {}) => {
  stats.tools++;
  try {
    const res = await client.callTool({ name, arguments: args });
    const payload = parseFirstTextPayload(res, name);
    expectOk(payload, name);
    console.log(`[PASS] tool: ${name}`);
    stats.passed++;
    return payload;
  } catch (err) {
    console.error(`[FAIL] tool: ${name} — ${err.message}`);
    trackedErrors.push({ type: 'tool', name, error: err.message });
    stats.failed++;
    return null;
  }
};

const runResource = async (uri) => {
  stats.resources++;
  try {
    const res = await client.readResource({ uri });
    assert(Array.isArray(res.contents) && res.contents.length > 0, `${uri}: no contents`);
    console.log(`[PASS] resource: ${uri}`);
    stats.passed++;
    return res;
  } catch (err) {
    console.error(`[FAIL] resource: ${uri} — ${err.message}`);
    trackedErrors.push({ type: 'resource', name: uri, error: err.message });
    stats.failed++;
    return null;
  }
};

try {
  await client.connect(transport);

  // ─── LIST TOOLS & RESOURCES ─────────────────────────────
  const toolList = await client.listTools();
  const resourceList = await client.listResources();

  const toolNames = toolList.tools.map((t) => t.name).sort();
  const resourceUris = resourceList.resources.map((r) => r.uri).sort();

  console.log(`\n[MCP] Tools (${toolNames.length}): ${toolNames.join(', ')}`);
  console.log(`[MCP] Resources (${resourceUris.length}): ${resourceUris.join(', ')}`);

  const expectedTools = [
    'analyze_project',
    'get_graph_context',
    'get_node_dependencies',
    'search_graph',
    'get_blast_radius',
    'get_health_score',
    'get_architecture_overview',
    'detect_patterns',
    'run_security_scan',
    'search_signatures',
    'prepare_task_context',
    'prepare_change_campaign',
    'prepare_project_context',
    'prepare_change_context',
    'prepare_review_context',
  ].sort();

  const expectedResources = [
    'codemaps://project/summary',
    'codemaps://graph/full',
    'codemaps://agent/playbook',
    'codemaps://agent/project-brain',
  ].sort();

  assert(
    JSON.stringify(toolNames) === JSON.stringify(expectedTools),
    `Tool list mismatch. Expected: ${expectedTools.join(', ')}, Got: ${toolNames.join(', ')}`,
  );
  assert(
    JSON.stringify(resourceUris) === JSON.stringify(expectedResources),
    `Resource list mismatch. Expected: ${expectedResources.join(', ')}, Got: ${resourceUris.join(', ')}`,
  );
  console.log('[PASS] tool & resource registry match expected');
  stats.passed += 2;

  // ─── 1. analyze_project ───────────────────────────────────
  const analyze = await runTool('analyze_project', { projectPath });
  assert(analyze?.summary?.nodesCount > 0, 'analyze_project: expected nodesCount > 0');
  assert(analyze?.summary?.linksCount >= 0, 'analyze_project: expected linksCount >= 0');

  // ─── 2. get_graph_context (summary) ───────────────────────
  await runTool('get_graph_context', { includeFullGraph: false });

  // ─── 3. get_graph_context (full graph) ────────────────────
  const fullGraph = await runTool('get_graph_context', { includeFullGraph: true });
  assert(Array.isArray(fullGraph?.nodes), 'get_graph_context(full): expected nodes array');
  assert(Array.isArray(fullGraph?.links), 'get_graph_context(full): expected links array');

  // Pick a target node for downstream tools
  const incomingCounts = new Map();
  for (const link of fullGraph?.links || []) {
    incomingCounts.set(link.target, (incomingCounts.get(link.target) || 0) + 1);
  }
  const blastTarget =
    (fullGraph?.nodes || []).find((node) => (incomingCounts.get(node.id) || 0) > 0) ||
    (fullGraph?.nodes || []).find((node) => node.type === 'file') ||
    (fullGraph?.nodes || [])[0];
  assert(blastTarget, 'Need at least one node from graph context');

  // ─── 4. get_node_dependencies ────────────────────────────
  const deps = await runTool('get_node_dependencies', { nodeId: blastTarget.id });
  assert(deps?.node?.id === blastTarget.id, 'get_node_dependencies: node mismatch');
  assert(Array.isArray(deps?.dependencies), 'get_node_dependencies: expected dependencies array');
  assert(Array.isArray(deps?.dependents), 'get_node_dependencies: expected dependents array');

  // ─── 5. search_graph ───────────────────────────────────────
  const search = await runTool('search_graph', { query: blastTarget.label || 'a', type: blastTarget.type, limit: 10 });
  assert(search?.count >= 0, 'search_graph: expected count >= 0');
  assert(Array.isArray(search?.matches), 'search_graph: expected matches array');

  // ─── 6. get_blast_radius ──────────────────────────────────
  const blast = await runTool('get_blast_radius', { nodeId: blastTarget.id, depth: 3 });
  assert(blast?.node?.id === blastTarget.id, 'get_blast_radius: node mismatch');
  assert(blast?.blastRadius !== undefined, 'get_blast_radius: expected blastRadius');

  // ─── 7. get_health_score ──────────────────────────────────
  const health = await runTool('get_health_score');
  assert(health?.health !== undefined, 'get_health_score: expected health object');

  // ─── 8. get_architecture_overview ──────────────────────────
  const arch = await runTool('get_architecture_overview', { includeClassifications: true });
  assert(arch?.architecture?.layers !== undefined, 'get_architecture_overview: expected layers');

  // ─── 9. detect_patterns ──────────────────────────────────
  const patterns = await runTool('detect_patterns', { limit: 10 });
  assert(patterns?.count >= 0, 'detect_patterns: expected count >= 0');
  assert(Array.isArray(patterns?.patterns), 'detect_patterns: expected patterns array');

  // ─── 10. run_security_scan ────────────────────────────────
  const security = await runTool('run_security_scan', { limit: 20 });
  assert(security?.summary?.total >= 0, 'run_security_scan: expected total >= 0');
  assert(Array.isArray(security?.findings), 'run_security_scan: expected findings array');

  // ─── 11. search_signatures ────────────────────────────────
  const sigs = await runTool('search_signatures', { query: 'analyze', limit: 10 });
  assert(sigs?.results !== undefined || sigs?.count !== undefined, 'search_signatures: expected results');

  // ─── 12. prepare_project_context ──────────────────────────
  const projCtx = await runTool('prepare_project_context', {
    limit: 8,
    includeSecurityFindings: true,
    includeClassifications: false,
  });
  assert(projCtx?.context !== undefined, 'prepare_project_context: expected context');

  // ─── 13. prepare_task_context ──────────────────────────────
  const taskCtx = await runTool('prepare_task_context', {
    userRequest: 'У меня почему-то авторизация ломается после изменений в backend',
    limit: 8,
    depth: 4,
    includeSecurityFindings: true,
    includeClassifications: false,
  });
  assert(taskCtx?.context !== undefined, 'prepare_task_context: expected context');

  // ─── 14. prepare_change_campaign ───────────────────────────
  const campaign = await runTool('prepare_change_campaign', {
    userRequest: 'Переведи все MCP сервисы на новый orchestration flow и обнови связанные integration points',
    candidateQueries: ['mcp', 'service', 'integration', 'orchestration'],
    taskMode: 'refactor',
    depth: 2,
    maxSeeds: 8,
    maxFiles: 24,
    includeSecurityFindings: true,
  });
  assert(campaign?.context !== undefined, 'prepare_change_campaign: expected context');

  // ─── 15. prepare_change_context ─────────────────────────────
  const changeCtx = await runTool('prepare_change_context', {
    target: blastTarget.id,
    taskMode: 'refactor',
    changeIntent: 'Smoke-test composite context for agent-first editing',
    depth: 3,
    includeSecurityFindings: true,
  });
  assert(changeCtx?.context !== undefined, 'prepare_change_context: expected context');

  // ─── 16. prepare_review_context ─────────────────────────────
  const reviewCtx = await runTool('prepare_review_context', {
    focusQuery: 'oracle',
    taskMode: 'architecture',
    limit: 8,
    includeSecurityFindings: true,
    includeClassifications: false,
  });
  assert(reviewCtx?.context !== undefined, 'prepare_review_context: expected context');

  // ─── RESOURCES ────────────────────────────────────────────
  // 1. project summary
  const summaryRes = await runResource('codemaps://project/summary');
  const summaryText = summaryRes?.contents?.[0]?.text;
  const summaryPayload = summaryText ? JSON.parse(summaryText) : null;
  assert(summaryPayload?.nodesCount >= 0, 'resource project/summary: expected nodesCount');

  // 2. full graph
  const fullGraphRes = await runResource('codemaps://graph/full');
  const fullGraphText = fullGraphRes?.contents?.[0]?.text;
  const fullGraphPayload = fullGraphText ? JSON.parse(fullGraphText) : null;
  assert(Array.isArray(fullGraphPayload?.nodes), 'resource graph/full: expected nodes array');

  // 3. agent playbook
  const playbookRes = await runResource('codemaps://agent/playbook');
  const playbookText = playbookRes?.contents?.[0]?.text;
  const playbookPayload = playbookText ? JSON.parse(playbookText) : null;
  assert(playbookPayload?.version >= 1, 'resource agent/playbook: expected version');

  // 4. project brain
  const brainRes = await runResource('codemaps://agent/project-brain');
  const brainText = brainRes?.contents?.[0]?.text;
  const brainPayload = brainText ? JSON.parse(brainText) : null;
  assert(brainPayload !== null, 'resource agent/project-brain: expected payload');

  // ─── CLEANUP ──────────────────────────────────────────────
  await transport.terminateSession().catch(() => undefined);
  await client.close();

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  MCP Smoke Test Results`);
  console.log(`  Tools tested:     ${stats.tools}`);
  console.log(`  Resources tested: ${stats.resources}`);
  console.log(`  Passed:           ${stats.passed}`);
  console.log(`  Failed:           ${stats.failed}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  if (trackedErrors.length > 0) {
    console.error(`\nFailed checks:`);
    for (const err of trackedErrors) {
      console.error(`  - ${err.type}: ${err.name} — ${err.error}`);
    }
    process.exitCode = 1;
  } else {
    console.log('\n✅ All MCP tools and resources passed smoke testing.');
  }
} catch (error) {
  console.error('[MCP] smoke test runner error:', error);
  process.exitCode = 1;
}
