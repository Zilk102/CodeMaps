import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useStore, GraphNode, GraphLink } from '../store/useStore';
import cytoscape from 'cytoscape';
// @ts-ignore
import fcose from 'cytoscape-fcose';

cytoscape.use(fcose);

export const GraphView: React.FC = () => {
  const { graphData, selectedNode, selectedPath, setSelectedNode, setSelectedPath, error, filters, setFilter } = useStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  const maxChurn = useMemo(() => {
    if (!graphData) return 1;
    return Math.max(...graphData.nodes.map(n => n.churn || 1));
  }, [graphData]);

  // Инициализация графа Cytoscape
  useEffect(() => {
    if (!containerRef.current || !graphData) return;

    // Находим родительские связи для compound nodes
    const parentMap = new Map<string, string>();
    const nodeIds = new Set(graphData.nodes.map(n => n.id));

    graphData.links.forEach(link => {
      if (link.type === 'structure' || link.type === 'entity') {
        const source = typeof link.source === 'string' ? link.source : (link.source as any).id;
        const target = typeof link.target === 'string' ? link.target : (link.target as any).id;
        if (nodeIds.has(source) && nodeIds.has(target) && source !== target) {
          if (link.type === 'structure') {
            // source is child (folder/file), target is parent (folder)
            parentMap.set(source, target);
          } else if (link.type === 'entity') {
            // source is parent (file), target is child (function/class)
            parentMap.set(target, source);
          }
        }
      }
    });

    // Предотвращение циклов во вложенности
    const cleanParentMap = new Map<string, string>();
    parentMap.forEach((parent, child) => {
      let curr: string | undefined = parent;
      let hasCycle = false;
      const visited = new Set<string>();
      while (curr) {
        if (curr === child || visited.has(curr)) {
          hasCycle = true;
          break;
        }
        visited.add(curr);
        curr = parentMap.get(curr);
      }
      if (!hasCycle) {
        cleanParentMap.set(child, parent);
      }
    });

    const elements: cytoscape.ElementDefinition[] = [];

    // Добавляем узлы
    graphData.nodes.forEach((node) => {
      let parent = cleanParentMap.get(node.id);
      // Если папка или класс, они могут быть родителями. Если нет родителя, parent = undefined
      let size = 20;
      if (node.type === 'file') size = Math.min(40, 10 + Math.log10(node.churn || 1) * 10);

      // Генерируем цвет
      let bgColor = '#4fc3f7';
      if (node.type === 'directory') bgColor = '#ab47bc';
      else if (node.type === 'adr') bgColor = '#e91e63';
      else if (node.adr) bgColor = '#ec407a';
      else if (node.type === 'class') bgColor = '#ffb74d';
      else if (node.type === 'function') bgColor = '#81c784';
      else if (node.type === 'file') {
        const heat = Math.min((node.churn || 1) / maxChurn, 1);
        if (heat > 0.5) bgColor = '#f44336';
      }

      elements.push({
        data: {
          id: node.id,
          label: node.label,
          type: node.type,
          parent: parent,
          bgColor,
          size,
          originalData: node
        }
      });
    });

    // Добавляем связи (исключаем structure и entity, так как они теперь parent-child)
    graphData.links.forEach((link, idx) => {
      if (link.type === 'structure' || link.type === 'entity') return;

      const source = typeof link.source === 'string' ? link.source : (link.source as any).id;
      const target = typeof link.target === 'string' ? link.target : (link.target as any).id;

      if (nodeIds.has(source) && nodeIds.has(target)) {
        let edgeColor = 'rgba(255,255,255,0.1)';
        let edgeWidth = 1;
        
        if (link.type === 'import') {
          edgeColor = 'rgba(79, 195, 247, 0.2)';
          edgeWidth = 1;
        } else if (link.type === 'adr') {
          edgeColor = 'rgba(233, 30, 99, 0.4)';
          edgeWidth = 2;
        } else if (link.type === 'entity') {
          edgeColor = 'rgba(129, 199, 132, 0.5)';
          edgeWidth = 2;
        }

        elements.push({
          data: {
            id: `edge-${idx}`,
            source,
            target,
            type: link.type,
            lineColor: edgeColor,
            width: edgeWidth
          }
        });
      }
    });

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'background-color': 'data(bgColor)',
            'color': '#ccc',
            'font-size': '12px',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'width': 'data(size)',
            'height': 'data(size)',
            'min-zoomed-font-size': 8
          }
        },
        {
          selector: ':parent',
          style: {
            'shape': 'round-rectangle',
            'background-opacity': 0.05,
            'border-width': 2,
            'text-valign': 'top',
            'text-halign': 'center',
            'font-weight': 'bold',
            'padding': '25px'
          }
        },
        {
          selector: 'node[type = "directory"]:parent',
          style: {
            'background-color': '#ab47bc',
            'border-color': '#ab47bc',
            'color': '#e0e0e0',
            'font-size': '14px',
          }
        },
        {
          selector: 'node[type = "file"]:parent',
          style: {
            'background-color': '#4fc3f7',
            'border-color': '#4fc3f7',
            'color': '#4fc3f7',
            'font-size': '13px',
            'border-style': 'dashed'
          }
        },
        {
          selector: 'node[type = "class"]:parent',
          style: {
            'background-color': '#ffb74d',
            'border-color': '#ffb74d',
            'color': '#ffb74d',
            'font-size': '13px',
          }
        },
        {
          selector: 'node[type = "directory"]:childless',
          style: {
            'shape': 'round-rectangle',
            'background-color': '#ab47bc',
            'background-opacity': 0.05,
            'border-width': 2,
            'border-color': '#ab47bc',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '12px',
            'font-weight': 'bold',
            'color': '#e0e0e0',
            'padding': '15px'
          }
        },
        {
          selector: 'node[type = "class"]:childless',
          style: {
            'shape': 'round-rectangle',
            'background-color': '#ffb74d',
            'background-opacity': 0.05,
            'border-width': 2,
            'border-color': '#ffb74d',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '12px',
            'font-weight': 'bold',
            'color': '#ffb74d',
            'padding': '10px'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 'data(width)',
            'line-color': 'data(lineColor)',
            'curve-style': 'bezier',
            'opacity': 0.6
          }
        },
        {
          selector: 'edge[type = "import"]',
          style: {
            'target-arrow-shape': 'triangle',
            'target-arrow-color': 'data(lineColor)',
            'arrow-scale': 0.8
          }
        },
        {
          selector: '.hidden',
          style: {
            'display': 'none'
          }
        },
        {
          selector: '.dimmed',
          style: {
            'opacity': 0.1
          }
        },
        {
          selector: '.highlighted',
          style: {
            'border-width': 4,
            'border-color': '#fff',
            'opacity': 1
          }
        },
        {
          selector: 'edge.highlighted',
          style: {
            'width': 3,
            'line-color': '#fff',
            'target-arrow-color': '#fff',
            'opacity': 1,
            'z-index': 999
          }
        }
      ],
      layout: {
        name: 'fcose',
        quality: 'proof', // Самое высокое качество
        randomize: true,
        animate: true,
        animationDuration: 1000,
        fit: true,
        padding: 50,
        nodeDimensionsIncludeLabels: true, // КРАЙНЕ ВАЖНО: без этого родительские рамки игнорируют размеры детей и наезжают друг на друга!
        packComponents: true, // Плотно упаковываем разрозненные узлы
        step: 'all',
        nodeSeparation: 60, // Отступ между узлами
        idealEdgeLength: (edge: any) => 50, // Стягиваем связанные узлы ближе
        edgeElasticity: (edge: any) => 0.45,
        gravity: 0.5, // Гравитация всего графа (собираем в кучу)
        numIter: 2500, // Больше итераций для идеальной раскладки
        gravityCompound: 1.5, // Сильная гравитация внутри рамок (чтобы не было дыр)
        gravityRangeCompound: 1.5,
        centerAware: true,
        nestingFactor: 0.1 // Минимальное раздувание от вложенности
      } as any
    });

    cyRef.current = cy;

    // ЖЕСТКАЯ СТЕНА (Улучшенный Collision Detection)
    let isDragging = false;
    let dragStartPosition: any = null;
    let dragStartBB: any = null;

    cy.on('grab', 'node', (evt) => {
      isDragging = true;
      const node = evt.target;
      
      // Запоминаем изначальные позиции ВСЕХ узлов на момент начала драга
      cy.nodes().forEach(n => {
        n.scratch('drag_last_valid', { ...n.position() });
      });
      
      // Если это рамка (parent), запоминаем ее bounding box до начала движения
      if (node.isParent()) {
        dragStartBB = node.boundingBox({ includeLabels: true, includeOverlays: false });
      } else {
        dragStartBB = null;
      }
    });

    cy.on('drag', 'node', (evt) => {
      if (!isDragging) return;
      const node = evt.target;
      
      let isOverlapping = false;
      const padding = 15; // Отступ (чтобы не слипались)

      // 1. Проверка коллизий для самой рамки (если тащим саму рамку или обычный узел)
      const siblings = node.siblings();
      const nodeBB = node.boundingBox({ includeLabels: true, includeOverlays: false });
      
      for (let i = 0; i < siblings.length; i++) {
        const sibling = siblings[i];
        if (sibling.id() === node.id()) continue;
        
        const sbb = sibling.boundingBox({ includeLabels: true, includeOverlays: false });
        
        if (
          nodeBB.x1 < sbb.x2 + padding &&
          nodeBB.x2 > sbb.x1 - padding &&
          nodeBB.y1 < sbb.y2 + padding &&
          nodeBB.y2 > sbb.y1 - padding
        ) {
          isOverlapping = true;
          break;
        }
      }

      // 2. Проверка коллизий РОДИТЕЛЯ (если мы тащим внутренний узел, и родитель из-за этого расширяется)
      if (!isOverlapping && node.parent().length > 0) {
        const parent = node.parent()[0];
        const parentBB = parent.boundingBox({ includeLabels: true, includeOverlays: false });
        const parentSiblings = parent.siblings();
        
        for (let i = 0; i < parentSiblings.length; i++) {
          const psibling = parentSiblings[i];
          if (psibling.id() === parent.id()) continue;
          
          const psbb = psibling.boundingBox({ includeLabels: true, includeOverlays: false });
          
          if (
            parentBB.x1 < psbb.x2 + padding &&
            parentBB.x2 > psbb.x1 - padding &&
            parentBB.y1 < psbb.y2 + padding &&
            parentBB.y2 > psbb.y1 - padding
          ) {
            isOverlapping = true;
            break;
          }
        }
      }

      if (isOverlapping) {
        // Возвращаем ВСЕ узлы на последнюю валидную позицию (чтобы отменить расширение родителя)
        cy.nodes().forEach(n => {
          const prev = n.scratch('drag_last_valid');
          if (prev) {
            n.position(prev);
          }
        });
      } else {
        // Если коллизий нет, обновляем валидные позиции для ВСЕХ узлов
        cy.nodes().forEach(n => {
          n.scratch('drag_last_valid', { ...n.position() });
        });
      }
    });

    cy.on('free', 'node', () => {
      isDragging = false;
      dragStartBB = null;
    });

    cy.on('tap', 'node', (evt) => {
      const nodeData = evt.target.data('originalData');
      setSelectedNode(nodeData);
      
      if (nodeData.type === 'file' && graphData) {
        let relPath = nodeData.id.replace(graphData.projectRoot.replace(/\\/g, '/'), '');
        if (relPath.startsWith('/')) relPath = relPath.substring(1);
        setSelectedPath(relPath);
      } else {
        setSelectedPath(null);
      }
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        setSelectedNode(null);
        setSelectedPath(null);
      }
    });

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [graphData]);

  // Фильтры и фокус
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !graphData) return;

    cy.batch(() => {
      // 1. Применяем фильтры видимости
      cy.nodes().forEach(node => {
        const type = node.data('type');
        let isHidden = false;
        if (type === 'directory' && !filters.showDirectories) isHidden = true;
        if (type === 'file' && !filters.showFiles) isHidden = true;
        if (type === 'function' && !filters.showFunctions) isHidden = true;
        if (type === 'class' && !filters.showClasses) isHidden = true;
        if (type === 'adr' && !filters.showADR) isHidden = true;

        if (isHidden) {
          node.addClass('hidden');
        } else {
          node.removeClass('hidden');
        }
      });

      if (!filters.showEdges) {
        cy.edges().addClass('hidden');
      } else {
        cy.edges().removeClass('hidden');
      }

      // 2. Focus mode
      const activeNodeId = selectedNode ? selectedNode.id : null;
      const activePath = selectedPath ? (graphData.projectRoot + '/' + selectedPath).replace(/\\/g, '/') : null;

      cy.elements().removeClass('dimmed highlighted');

      if (activeNodeId || activePath) {
        cy.elements().addClass('dimmed');

        if (activeNodeId) {
          const activeNode = cy.getElementById(activeNodeId);
          if (activeNode.length > 0) {
            activeNode.removeClass('dimmed').addClass('highlighted');
            // Подсвечиваем соседей
            activeNode.neighborhood().removeClass('dimmed').addClass('highlighted');
            // Подсвечиваем предков (чтобы рамки не пропадали)
            activeNode.ancestors().removeClass('dimmed');
            // Подсвечиваем потомков
            activeNode.descendants().removeClass('dimmed');
          }
        } else if (activePath) {
          const matchingNodes = cy.nodes().filter(node => node.id().startsWith(activePath));
          matchingNodes.removeClass('dimmed').addClass('highlighted');
          matchingNodes.neighborhood().removeClass('dimmed').addClass('highlighted');
          matchingNodes.ancestors().removeClass('dimmed');
        }
      }
    });

    if (selectedNode) {
      const node = cy.getElementById(selectedNode.id);
      if (node.length > 0) {
        cy.animate({
          center: { eles: node },
          zoom: 1.5,
          duration: 500
        });
      }
    }

  }, [selectedNode, selectedPath, filters, graphData]);

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
          
          <div style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(0,0,0,0.7)', padding: 15, borderRadius: 8, color: '#fff', fontSize: 13, zIndex: 10, backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: 14 }}>Фильтры</h4>
            <label style={{ display: 'block', marginBottom: 5, cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.showDirectories} onChange={(e) => setFilter('showDirectories', e.target.checked)} style={{ marginRight: 8 }} />
              Папки
            </label>
            <label style={{ display: 'block', marginBottom: 5, cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.showFiles} onChange={(e) => setFilter('showFiles', e.target.checked)} style={{ marginRight: 8 }} />
              Файлы
            </label>
            <label style={{ display: 'block', marginBottom: 5, cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.showFunctions} onChange={(e) => setFilter('showFunctions', e.target.checked)} style={{ marginRight: 8 }} />
              Функции
            </label>
            <label style={{ display: 'block', marginBottom: 5, cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.showClasses} onChange={(e) => setFilter('showClasses', e.target.checked)} style={{ marginRight: 8 }} />
              Классы
            </label>
            <label style={{ display: 'block', marginBottom: 5, cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.showADR} onChange={(e) => setFilter('showADR', e.target.checked)} style={{ marginRight: 8 }} />
              ADR
            </label>
            <label style={{ display: 'block', marginBottom: 0, cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.showEdges} onChange={(e) => setFilter('showEdges', e.target.checked)} style={{ marginRight: 8 }} />
              Связи (линии)
            </label>
          </div>

          <div style={{ position: 'absolute', bottom: 34, left: 20, color: '#fff', fontSize: 12, background: 'rgba(0,0,0,0.7)', padding: 10, borderRadius: 8, pointerEvents: 'none', zIndex: 10, backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <strong>Легенда:</strong><br/>
            <span style={{ color: '#ab47bc' }}>■</span> Папки<br/>
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

