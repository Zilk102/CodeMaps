import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { KuzuGraphService } from './KuzuGraphService';

export interface RenameOperation {
  oldPath: string;
  newPath: string;
  affectedNodes: string[];
  affectedEdges: string[];
}

export class RenameTool {
  private graphService: KuzuGraphService;
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.graphService = new KuzuGraphService(projectPath);
  }

  async init(): Promise<void> {
    await this.graphService.init();
  }

  async previewRename(oldPath: string, newPath: string): Promise<RenameOperation> {
    // Find all nodes that reference oldPath
    const query = `
      MATCH (n:FileNode)
      WHERE n.filePath = '${oldPath}' OR n.filePath STARTS WITH '${oldPath}/'
      RETURN n.id, n.filePath
    `;
    const result = await this.graphService.query(query);
    const nodes = await result.getAll();

    const affectedNodes = nodes.map((n: any) => n['n.id']);
    
    // Find edges connected to these nodes
    const edgeQuery = `
      MATCH ()-[r:FileEdge]->()
      WHERE r.sourceId IN [${affectedNodes.map((id: string) => `'${id}'`).join(',')}] 
         OR r.targetId IN [${affectedNodes.map((id: string) => `'${id}'`).join(',')}]
      RETURN r.sourceId, r.targetId
    `;
    const edgeResult = await this.graphService.query(edgeQuery);
    const edges = await edgeResult.getAll();

    return {
      oldPath,
      newPath,
      affectedNodes,
      affectedEdges: edges.map((e: any) => `${e['r.sourceId']} -> ${e['r.targetId']}`),
    };
  }

  async executeRename(operation: RenameOperation): Promise<void> {
    // 1. Rename actual file/directory
    const absoluteOld = path.join(this.projectPath, operation.oldPath);
    const absoluteNew = path.join(this.projectPath, operation.newPath);

    if (fs.existsSync(absoluteOld)) {
      fs.renameSync(absoluteOld, absoluteNew);
    }

    // 2. Update KuzuDB
    for (const nodeId of operation.affectedNodes) {
      const query = `
        MATCH (n:FileNode {id: '${nodeId}'})
        SET n.filePath = REPLACE(n.filePath, '${operation.oldPath}', '${operation.newPath}')
      `;
      await this.graphService.query(query);
    }

    // 3. Update source files that import oldPath
    await this.updateImports(operation.oldPath, operation.newPath);
  }

  private async updateImports(oldPath: string, newPath: string): Promise<void> {
    // Simple file walking instead of glob
    const walkDir = (dir: string): string[] => {
      const files: string[] = [];
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory() && !item.includes('node_modules') && !item.startsWith('.')) {
          files.push(...walkDir(fullPath));
        } else if (/\.(ts|tsx|js|jsx)$/.test(item)) {
          files.push(fullPath);
        }
      }
      return files;
    };

    const files = walkDir(this.projectPath);

    // Update imports in all source files
    const importPattern = new RegExp(
      `(import|require|from)\\s+['\"].*${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['\"]`,
      'g'
    );

    for (const file of files) {
      const filePath = path.join(this.projectPath, file);
      let content = fs.readFileSync(filePath, 'utf-8');
      
      if (importPattern.test(content)) {
        content = content.replace(importPattern, (match) => {
          return match.replace(oldPath, newPath);
        });
        fs.writeFileSync(filePath, content);
      }
    }
  }

  async close(): Promise<void> {
    await this.graphService.close();
  }
}
