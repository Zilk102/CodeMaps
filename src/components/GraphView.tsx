import React, { useRef, useMemo, useEffect, useCallback, useState } from 'react';
import { useStore, GraphNode, GraphLink } from '../store/useStore';
// @ts-ignore
import ForceGraph2D from 'react-force-graph-2d';

export const GraphView: React.FC = () => {
  const { graphData, selectedNode, selectedPath, setSelectedNode, setSelectedPath, error } = useStore();
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      if (!entries || !entries[0]) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const maxChurn = useMemo(() => {
    if (!graphData) return 1;
    return Math.max(...graphData.nodes.map(n => n.churn || 1));
  }, [graphData]);

  // Вычисление подсвеченных узлов и связей для выбранного файла или директории
  const { highlightNodes, highlightLinks } = useMemo(() => {
    const nodes = new Set<GraphNode>();
    const links = new Set<GraphLink>();

    if (graphData && selectedNode) {
      nodes.add(selectedNode);
      graphData.links.forEach(link => {
        const src = typeof link.source === 'object' ? (link.source as GraphNode).id : link.source;
        const tgt = typeof link.target === 'object' ? (link.target as GraphNode).id : link.target;
        
        if (src === selectedNode.id || tgt === selectedNode.id) {
          links.add(link);
          nodes.add(graphData.nodes.find(n => n.id === src)!);
          nodes.add(graphData.nodes.find(n => n.id === tgt)!);
        }
      });
    } else if (graphData && selectedPath) {
      // Подсветка всех узлов внутри выбранной директории
      const absPath = (graphData.projectRoot + '/' + selectedPath).replace(/\\/g, '/');
      graphData.nodes.forEach(node => {
        if (node.id.startsWith(absPath)) {
          nodes.add(node);
        }
      });
      graphData.links.forEach(link => {
        const src = typeof link.source === 'object' ? (link.source as GraphNode).id : link.source;
        const tgt = typeof link.target === 'object' ? (link.target as GraphNode).id : link.target;
        
        if (src.startsWith(absPath) && tgt.startsWith(absPath)) {
          links.add(link);
        }
      });
    }

    return { highlightNodes: nodes, highlightLinks: links };
  }, [graphData, selectedNode, selectedPath]);

  // Плавный фокус камеры на выбранном узле
  useEffect(() => {
    if (selectedNode && fgRef.current) {
      const node = graphData?.nodes.find(n => n.id === selectedNode.id);
      if (node && node.x !== undefined && node.y !== undefined) {
        fgRef.current.centerAt(node.x, node.y, 1000);
        fgRef.current.zoom(8, 1000);
      }
    } else if (selectedPath && fgRef.current && highlightNodes.size > 0) {
       fgRef.current.zoomToFit(1000, 50);
    }
  }, [selectedNode, selectedPath, graphData, highlightNodes]);

  const handleNodeClick = useCallback((node: any) => {
    const gNode = node as GraphNode;
    setSelectedNode(gNode);
    // Если это файл, обновляем selectedPath для синхронизации с деревом
    if (gNode.type === 'file' && graphData) {
      let relPath = gNode.id.replace(graphData.projectRoot.replace(/\\/g, '/'), '');
      if (relPath.startsWith('/')) relPath = relPath.substring(1);
      setSelectedPath(relPath);
    } else {
      setSelectedPath(null);
    }
  }, [setSelectedNode, setSelectedPath, graphData]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#0f111a', position: 'relative', display: 'flex' }}>
      {error ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f44336' }}>Error: {error}</div>
      ) : !graphData ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>Open a project to analyze.</div>
      ) : (
        <>
          {dimensions.width > 0 && (
            <ForceGraph2D
              width={dimensions.width}
              height={dimensions.height}
              ref={fgRef}
              graphData={graphData}
        nodeLabel={(node: GraphNode) => {
          let lbl = `${node.label} (${node.type})`;
          if (node.churn > 1) lbl += ` | Hotspot: ${node.churn} commits`;
          if (node.adr) lbl += ` | ADR: ${node.adr}`;
          return lbl;
        }}
        nodeColor={(node: GraphNode) => {
          const isHighlighted = highlightNodes.has(node);
          const isDimmed = (selectedNode || selectedPath) && !isHighlighted;
          
          let color = '#4fc3f7';
          if (node.adr) color = '#e91e63';
          else if (node.type === 'file') {
            const heat = Math.min(node.churn / maxChurn, 1);
            color = heat > 0.5 ? '#f44336' : '#4fc3f7'; 
          }
          else if (node.type === 'class') color = '#ffb74d';
          else color = '#81c784';

          // Димминг (затенение), если активен режим выделения и узел не в нем
          if (isDimmed) {
            // Превращаем цвет в полупрозрачный
            return color + '33'; // 20% opacity hex
          }
          return color;
        }}
        nodeVal={(node: GraphNode) => {
          return node.type === 'file' ? Math.max(1, node.churn * 0.5) : 1;
        }}
        linkColor={(link: GraphLink) => {
          const isHighlighted = highlightLinks.has(link);
          const isDimmed = (selectedNode || selectedPath) && !isHighlighted;
          if (isHighlighted) return 'rgba(255,255,255,0.8)';
          if (isDimmed) return 'rgba(255,255,255,0.02)';
          return 'rgba(255,255,255,0.15)';
        }}
        linkWidth={(link: GraphLink) => highlightLinks.has(link) ? 2 : 1}
        onNodeClick={handleNodeClick}
        onBackgroundClick={() => {
          setSelectedNode(null);
          setSelectedPath(null);
        }}
      />
      )}
      <div style={{ position: 'absolute', bottom: 20, left: 20, color: '#fff', fontSize: 12, background: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 4 }}>
        <strong>Легенда:</strong><br/>
        <span style={{ color: '#4fc3f7' }}>■</span> Файлы<br/>
        <span style={{ color: '#f44336' }}>■</span> Git Hotspots<br/>
        <span style={{ color: '#e91e63' }}>■</span> Семантические якоря (ADR)<br/>
        <span style={{ color: '#ffb74d' }}>■</span> Классы<br/>
        <span style={{ color: '#81c784' }}>■</span> Функции
      </div>
      </>
      )}
    </div>
  );
};