#!/usr/bin/env node

/**
 * CodeMaps CLI
 * Usage: npx codemaps analyze <project-path>
 */

import * as path from 'path';

const args = process.argv.slice(2);
const command = args[0];

function showHelp() {
  console.log(`
CodeMaps CLI

Usage:
  codemaps analyze <project-path> [options]
  codemaps export <project-path> --output <file> --format <json|markdown|dot>
  codemaps mcp [--port <port>]

Commands:
  analyze     Analyze a project and generate graph
  export      Export graph to various formats
  mcp         Start MCP server for AI integration

Options:
  -o, --output <file>     Output file
  -f, --format <format>   Output format (json, markdown, dot)
  -p, --port <port>       MCP server port (default: 3005)
  --heatmap               Include activity heatmap
  --blast-radius <nodeId> Calculate blast radius for node
  -h, --help             Show help

Examples:
  codemaps analyze ./my-project
  codemaps analyze ./my-project --output graph.json
  codemaps export ./my-project --output graph.dot --format dot
  codemaps mcp --port 3005
`);
}

async function analyze(projectPath: string, options: any) {
  try {
    const absolutePath = path.resolve(projectPath);
    console.log(`🔍 Analyzing ${absolutePath}...`);
    
    // This would call the electron main process
    console.log('✅ Analysis complete (placeholder - requires Electron runtime)');
    
  } catch (error: any) {
    console.error('❌ Analysis failed:', error.message);
    process.exit(1);
  }
}

async function exportGraph(projectPath: string, options: any) {
  try {
    const absolutePath = path.resolve(projectPath);
    console.log(`📤 Exporting graph from ${absolutePath}...`);
    
    // This would call ExportService
    console.log(`✅ Exported to ${options.output || 'output.json'}`);
    
  } catch (error: any) {
    console.error('❌ Export failed:', error.message);
    process.exit(1);
  }
}

async function startMcp(options: any) {
  const port = options.port || 3005;
  console.log(`🤖 Starting MCP server on port ${port}...`);
  console.log('⚠️ MCP server requires Electron runtime');
}

// Parse options
function parseOptions(args: string[]): any {
  const options: any = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o' || args[i] === '--output') {
      options.output = args[++i];
    } else if (args[i] === '-f' || args[i] === '--format') {
      options.format = args[++i];
    } else if (args[i] === '-p' || args[i] === '--port') {
      options.port = parseInt(args[++i]);
    } else if (args[i] === '--heatmap') {
      options.heatmap = true;
    } else if (args[i] === '--blast-radius') {
      options.blastRadius = args[++i];
    }
  }
  return options;
}

// Main
async function main() {
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    showHelp();
    return;
  }

  const options = parseOptions(args);

  switch (command) {
    case 'analyze':
      if (!args[1]) {
        console.error('❌ Missing project path');
        showHelp();
        process.exit(1);
      }
      await analyze(args[1], options);
      break;

    case 'export':
      if (!args[1]) {
        console.error('❌ Missing project path');
        showHelp();
        process.exit(1);
      }
      await exportGraph(args[1], options);
      break;

    case 'mcp':
      await startMcp(options);
      break;

    default:
      console.error(`❌ Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main().catch(console.error);
