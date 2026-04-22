import express from 'express';
import cors from 'cors';
import { analyzeProject } from './ast';

export function setupMcpServer() {
  const app = express();
  const PORT = 3005;

  app.use(cors());
  app.use(express.json());

  app.get('/mcp/context', async (req, res) => {
    try {
      const cwd = process.cwd();
      const graph = await analyzeProject(cwd);
      
      // Отдаем "Living Blueprint" для ИИ-агентов
      res.json({
        status: 'ok',
        projectRoot: cwd,
        context: graph,
        metadata: {
          nodesCount: graph.nodes.length,
          linksCount: graph.links.length
        }
      });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.listen(PORT, () => {
    console.log(`[MCP Server] Running on http://localhost:${PORT}`);
  });
}