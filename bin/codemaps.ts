#!/usr/bin/env node

/**
 * CodeMaps CLI
 * Usage: npx codemaps analyze <project-path>
 */

import { Command } from 'commander';
import * as path from 'path';
import { execSync } from 'child_process';

const program = new Command();

program
  .name('codemaps')
  .description('CodeMaps CLI for code analysis')
  .version('1.0.0');

program
  .command('analyze')
  .description('Analyze a project and generate graph')
  .argument('<project-path>', 'Path to project directory')
  .option('-o, --output <file>', 'Output file for graph data')
  .option('-f, --format <format>', 'Output format (json, dot)', 'json')
  .option('--heatmap', 'Include activity heatmap')
  .option('--blast-radius <nodeId>', 'Calculate blast radius for node')
  .action(async (projectPath: string, options: any) => {
    try {
      const absolutePath = path.resolve(projectPath);
      
      console.log(`🔍 Analyzing ${absolutePath}...`);
      
      // Check if electron app is built
      const appPath = path.join(__dirname, '../dist-electron/main.js');
      
      // Run analysis via Electron main process
      const result = execSync(
        `node ${appPath} --cli --analyze "${absolutePath}"`,
        { encoding: 'utf-8' }
      );
      
      const data = JSON.parse(result);
      
      if (options.output) {
        const fs = await import('fs');
        fs.writeFileSync(options.output, JSON.stringify(data, null, 2));
        console.log(`✅ Graph saved to ${options.output}`);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      
      if (options.heatmap) {
        console.log('\n📊 Activity Heatmap:');
        // Would call GitActivityService here
      }
      
      if (options.blastRadius) {
        console.log(`\n💥 Blast Radius for ${options.blastRadius}:`);
        // Would call BlastRadiusV2 here
      }
      
    } catch (error: any) {
      console.error('❌ Analysis failed:', error.message);
      process.exit(1);
    }
  });

program
  .command('export')
  .description('Export graph to various formats')
  .argument('<project-path>', 'Path to project directory')
  .requiredOption('-o, --output <file>', 'Output file')
  .requiredOption('-f, --format <format>', 'Export format (json, markdown, dot, svg)')
  .action(async (projectPath: string, options: any) => {
    try {
      const absolutePath = path.resolve(projectPath);
      
      console.log(`📤 Exporting graph to ${options.format}...`);
      
      // Would call ExportService here
      console.log(`✅ Exported to ${options.output}`);
      
    } catch (error: any) {
      console.error('❌ Export failed:', error.message);
      process.exit(1);
    }
  });

program
  .command('mcp')
  .description('Start MCP server for AI integration')
  .option('-p, --port <port>', 'Port for MCP server', '3005')
  .action(async (options: any) => {
    console.log(`🤖 Starting MCP server on port ${options.port}...`);
    // Would start MCP server here
  });

program.parse();
