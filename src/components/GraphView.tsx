import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useStore, GraphNode, GraphLink } from '../store/useStore';
import Graph from 'graphology';
import { Sigma } from 'sigma';
import forceAtlas2 from 'graphology-layout-forceatlas2';

export const GraphView: React.FC = () => {
  const { graphData, selectedNode, selectedPath, setSelectedNode, setSelectedPath, error } = useStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
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

  // Инициализация графа Sigma
  useEffect(() => {
    if (!containerRef.current || !graphData) return;

    // Создаем Graphology граф
    const graph: any = new Graph();

    // Цвета групп
    const getColor = (node: GraphNode) => {
      if (node.type === 'adr') return '#e91e63'; // ADR узлы
      if (node.adr) return '#ec407a'; // Файлы, ссылающиеся на ADR
      if (node.type === 'file') {
        const heat = Math.min((node.churn || 1) / maxChurn, 1);
        return heat > 0.5 ? '#f44336' : '#4fc3f7'; // Hotspots
      }
      if (node.type === 'class') return '#ffb74d';
      return '#81c784'; // Function
    };

    // Добавляем узлы
    graphData.nodes.forEach(node => {
      if (!graph.hasNode(node.id)) {
        const size = node.type === 'adr' ? 8 : (node.type === 'file' ? Math.max(5, (node.churn || 1) * 2) : 3);
        let lbl = `${node.label} (${node.type})`;
        if (node.churn > 1 && node.type === 'file') lbl += ` | Hotspot: ${node.churn} commits`;
        if (node.adr && node.type !== 'adr') lbl += ` | ADR: ${node.adr}`;

        graph.addNode(node.id, {
          x: Math.random() * 100,
          y: Math.random() * 100,
          size,
          label: lbl,
          color: getColor(node),
          originalData: node
        });
      }
    });

    // Добавляем связи
    graphData.links.forEach(link => {
      const source = typeof link.source === 'string' ? link.source : (link.source as any).id;
      const target = typeof link.target === 'string' ? link.target : (link.target as any).id;
      
      if (graph.hasNode(source) && graph.hasNode(target)) {
        if (!graph.hasEdge(source, target) && !graph.hasEdge(target, source)) {
          graph.addEdge(source, target, {
            color: 'rgba(255,255,255,0.15)',
            size: 1
          });
        }
      }
    });

    // Запускаем ForceAtlas2
    console.log(`Starting ForceAtlas2 with ${graph.order} nodes and ${graph.size} edges...`);
    if (graph.order > 0) {
      forceAtlas2.assign(graph, {
        iterations: graph.order > 1000 ? 20 : 50,
        settings: {
          gravity: 1,
          scalingRatio: 10,
          strongGravityMode: false
        }
      });
    }

    console.log(`Initializing Sigma in container of size ${containerRef.current.clientWidth}x${containerRef.current.clientHeight}`);
    
    // Инициализируем рендерер
    const renderer = new Sigma(graph, containerRef.current, {
      renderEdgeLabels: false,
      defaultNodeColor: '#999',
      defaultEdgeColor: '#333',
      labelColor: { color: '#ccc' },
      labelSize: 12,
      labelFont: 'Inter, sans-serif',
      labelWeight: '400',
      // Настройки для скрытия лейблов по умолчанию (будут управляться через hover)
      labelRenderedSizeThreshold: 1000 // Делаем так, чтобы по умолчанию лейблы не рендерились, пока камера не приблизится
    });

    sigmaRef.current = renderer;

    // События
    renderer.on('clickNode', ({ node }) => {
      const nodeData = graph.getNodeAttribute(node, 'originalData');
      setSelectedNode(nodeData);
      
      if (nodeData.type === 'file' && graphData) {
        let relPath = nodeData.id.replace(graphData.projectRoot.replace(/\\/g, '/'), '');
        if (relPath.startsWith('/')) relPath = relPath.substring(1);
        setSelectedPath(relPath);
      } else {
        setSelectedPath(null);
      }
    });

    renderer.on('clickStage', () => {
      setSelectedNode(null);
      setSelectedPath(null);
    });

    // Состояние для Drag & Drop
    let draggedNode: string | null = null;
    let isDragging = false;
    let hoveredNode: string | null = null;

    renderer.on('downNode', (e) => {
      isDragging = true;
      draggedNode = e.node;
      renderer.getCamera().disable(); // Отключаем перемещение камеры при перетаскивании
    });

    renderer.getMouseCaptor().on('mousemovebody', (e) => {
      if (!isDragging || !draggedNode) return;
      const pos = renderer.viewportToGraph(e);
      graph.setNodeAttribute(draggedNode, 'x', pos.x);
      graph.setNodeAttribute(draggedNode, 'y', pos.y);
      e.preventSigmaDefault();
      e.original.preventDefault();
      e.original.stopPropagation();
    });

    renderer.getMouseCaptor().on('mouseup', () => {
      if (draggedNode) {
        isDragging = false;
        draggedNode = null;
        renderer.getCamera().enable(); // Включаем камеру обратно
      }
    });

    renderer.on('enterNode', ({ node }) => {
      document.body.style.cursor = 'pointer';
      hoveredNode = node;
      renderer.refresh(); // Принудительная перерисовка для показа лейбла
    });

    renderer.on('leaveNode', () => {
      document.body.style.cursor = 'default';
      hoveredNode = null;
      renderer.refresh();
    });

    // Кастомный рендерер узлов для управления лейблами
    renderer.setSetting('nodeReducer', (node, data) => {
      const res = { ...data };

      // Показываем лейбл только если узел выбран (selected) или на него наведена мышь (hovered)
      const isSelected = selectedNode && selectedNode.id === node;
      const isHovered = hoveredNode === node;
      const isDragged = draggedNode === node;

      if (isSelected || isHovered || isDragged) {
        res.highlighted = true;
        res.forceLabel = true;
      }

      // Скрываем лейблы у всех остальных узлов
      if (!res.forceLabel) {
        res.label = ''; // Убираем текст
      }

      return res;
    });

    return () => {
      renderer.kill();
      sigmaRef.current = null;
    };
  }, [graphData]); // Убрали maxChurn и dimensions.width из зависимостей, чтобы граф не пересоздавался при ресайзе

  // Эффект для подсветки выбранных элементов
  useEffect(() => {
    const renderer = sigmaRef.current;
    if (!renderer || !graphData) return;

    const graph = renderer.getGraph();
    
    // Сброс всех стилей
    graph.forEachNode((node: any) => {
      const data = graph.getNodeAttribute(node, 'originalData');
      let color = '#4fc3f7';
      if (data.type === 'adr') color = '#e91e63';
      else if (data.adr) color = '#ec407a';
      else if (data.type === 'file') color = (data.churn / maxChurn > 0.5) ? '#f44336' : '#4fc3f7';
      else if (data.type === 'class') color = '#ffb74d';
      else color = '#81c784';

      graph.setNodeAttribute(node, 'color', color);
      graph.setNodeAttribute(node, 'hidden', false);
    });
    graph.forEachEdge((edge: any) => {
      graph.setEdgeAttribute(edge, 'color', 'rgba(255,255,255,0.15)');
      graph.setEdgeAttribute(edge, 'size', 1);
    });

    if (selectedNode || selectedPath) {
      const highlightNodes = new Set<string>();
      const highlightEdges = new Set<string>();

      if (selectedNode) {
        highlightNodes.add(selectedNode.id);
        graph.forEachEdge(selectedNode.id, (edge: any, ext: any, source: any, target: any) => {
          highlightEdges.add(edge);
          highlightNodes.add(source);
          highlightNodes.add(target);
        });
      } else if (selectedPath) {
        const absPath = (graphData.projectRoot + '/' + selectedPath).replace(/\\/g, '/');
        graph.forEachNode((node: any) => {
          if (node.startsWith(absPath)) highlightNodes.add(node);
        });
        graph.forEachEdge((edge: any, ext: any, source: any, target: any) => {
          if (source.startsWith(absPath) && target.startsWith(absPath)) {
            highlightEdges.add(edge);
          }
        });
      }

      // Затеняем невыделенные
      graph.forEachNode((node: any) => {
        if (!highlightNodes.has(node)) {
          const color = graph.getNodeAttribute(node, 'color');
          graph.setNodeAttribute(node, 'color', color + '33'); // 20% opacity
        }
      });

      graph.forEachEdge((edge: any) => {
        if (highlightEdges.has(edge)) {
          graph.setEdgeAttribute(edge, 'color', 'rgba(255,255,255,0.8)');
          graph.setEdgeAttribute(edge, 'size', 2);
        } else {
          graph.setEdgeAttribute(edge, 'color', 'rgba(255,255,255,0.02)');
        }
      });
      
      // Фокус камеры
      if (selectedNode) {
        const pos = renderer.getNodeDisplayData(selectedNode.id);
        if (pos) {
          renderer.getCamera().animate({ x: pos.x, y: pos.y, ratio: 0.5 }, { duration: 500 });
        }
      }
    }
  }, [selectedNode, selectedPath, graphData, maxChurn]);

  return (
    <div style={{ width: '100%', height: '100%', background: '#0f111a', position: 'relative', display: 'flex' }}>
      {error ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f44336' }}>Error: {error}</div>
      ) : !graphData ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>Open a project to analyze.</div>
      ) : (
        <>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
          </div>
          <div style={{ position: 'absolute', bottom: 34, left: 20, color: '#fff', fontSize: 12, background: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 4, pointerEvents: 'none', zIndex: 10 }}>
            <strong>Легенда:</strong><br/>
            <span style={{ color: '#4fc3f7' }}>■</span> Файлы<br/>
            <span style={{ color: '#f44336' }}>■</span> Git Hotspots<br/>
            <span style={{ color: '#e91e63' }}>■</span> ADR Узлы<br/>
            <span style={{ color: '#ec407a' }}>■</span> Файлы с привязкой к ADR<br/>
            <span style={{ color: '#ffb74d' }}>■</span> Классы<br/>
            <span style={{ color: '#81c784' }}>■</span> Функции
          </div>
        </>
      )}
    </div>
  );
};