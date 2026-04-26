import * as fs from 'fs';
import { KuzuGraphService } from './KuzuGraphService';

export type ExportFormat = 'json' | 'markdown' | 'svg' | 'dot';

export class ExportService {
  private graphService: KuzuGraphService;

  constructor(projectPath: string) {
    this.graphService = new KuzuGraphService(projectPath);
  }

  async init(): Promise<void> {
    await this.graphService.init();
  }

  async export(format: ExportFormat, outputPath: string): Promise<void> {
    switch (format) {
      case 'json':
        await this.exportJSON(outputPath);
        break;
      case 'markdown':
        await this.exportMarkdown(outputPath);
        break;
      case 'svg':
        await this.exportSVG(outputPath);
        break;
      case 'dot':
        await this.exportDOT(outputPath);
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private async exportJSON(outputPath: string): Promise<void> {
    const nodes = await this.graphService.queryNodes();
    const result = await this.graphService.query('MATCH ()-[r:FileEdge]->() RETURN r.type, r.meta');
    const edges = await result.getAll();

    const data = {
      nodes: nodes.map(n => ({
        id: n['n.id'],
        type: n['n.type'],
        label: n['n.label'],
        filePath: n['n.filePath'],
      })),
      edges: edges.map((e: any) => ({
        type: e['r.type'],
        meta: e['r.meta'],
      })),
    };

    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  }

  private async exportMarkdown(outputPath: string): Promise<void> {
    const nodes = await this.graphService.queryNodes();
    
    let md = '# CodeMaps Graph Export\n\n';
    md += `Generated: ${new Date().toISOString()}\n\n`;
    md += '## Nodes\n\n';
    md += '| ID | Type | Label |\n';
    md += '|------|------|-------|\n';

    for (const node of nodes) {
      md += `| ${node['n.id']} | ${node['n.type']} | ${node['n.label']} |\n`;
    }

    fs.writeFileSync(outputPath, md);
  }

  private async exportDOT(outputPath: string): Promise<void> {
    const nodes = await this.graphService.queryNodes();
    const result = await this.graphService.query('MATCH (a)-[r:FileEdge]->(b) RETURN a.id, b.id, r.type');
    const edges = await result.getAll();

    let dot = 'digraph CodeMaps {\n';
    dot += '  rankdir=LR;\n';
    dot += '  node [shape=box];\n\n';

    for (const node of nodes) {
      const label = node['n.label'] || node['n.id'];
      dot += `  "${node['n.id']}" [label="${label}"];\n`;
    }

    dot += '\n';

    for (const edge of edges) {
      dot += `  "${edge['a.id']}" -> "${edge['b.id']}" [label="${edge['r.type']}"];\n`;
    }

    dot += '}\n';
    fs.writeFileSync(outputPath, dot);
  }

  private async exportSVG(outputPath: string): Promise<void> {
    // For now, export DOT and let user convert with Graphviz
    const dotPath = outputPath.replace('.svg', '.dot');
    await this.exportDOT(dotPath);
    
    // Basic SVG placeholder
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
      <text x="400" y="300" text-anchor="middle">SVG export requires Graphviz.
        DOT file saved to: ${dotPath}
      </text>
    </svg>`;
    
    fs.writeFileSync(outputPath, svg);
  }

  async close(): Promise<void> {
    await this.graphService.close();
  }
}
