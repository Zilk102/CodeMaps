import React, { useMemo, useState } from 'react';
import { useStore, GraphNode } from '../store/useStore';
import { Frame } from './Frame';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

export interface TreeNode {
  data: GraphNode;
  children: TreeNode[];
}

export const GraphView: React.FC = () => {
  const { graphData, error, filters, setFilter } = useStore();

  const tree = useMemo(() => {
    if (!graphData) return [];

    const parentMap = new Map<string, string>();
    const nodeIds = new Set(graphData.nodes.map(n => n.id));

    // 1. Извлекаем связи вложенности
    graphData.links.forEach(link => {
      if (link.type === 'structure' || link.type === 'entity') {
        const source = typeof link.source === 'string' ? link.source : (link.source as any).id;
        const target = typeof link.target === 'string' ? link.target : (link.target as any).id;
        if (nodeIds.has(source) && nodeIds.has(target) && source !== target) {
          if (link.type === 'structure') {
            parentMap.set(source, target);
          } else if (link.type === 'entity') {
            parentMap.set(target, source);
          }
        }
      }
    });

    // 2. Чистим от циклических зависимостей
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

    // 3. Строим дерево из плоского списка
    const nodeMap = new Map<string, TreeNode>();
    graphData.nodes.forEach(node => {
      // Применяем фильтры видимости прямо на этапе сборки дерева
      let isHidden = false;
      if (node.type === 'directory' && !filters.showDirectories) isHidden = true;
      if (node.type === 'file' && !filters.showFiles) isHidden = true;
      if (node.type === 'function' && !filters.showFunctions) isHidden = true;
      if (node.type === 'class' && !filters.showClasses) isHidden = true;
      if (node.type === 'adr' && !filters.showADR) isHidden = true;

      if (!isHidden) {
        nodeMap.set(node.id, { data: node, children: [] });
      }
    });

    const roots: TreeNode[] = [];

    nodeMap.forEach((treeNode, id) => {
      const parentId = cleanParentMap.get(id);
      if (parentId && nodeMap.has(parentId)) {
        nodeMap.get(parentId)!.children.push(treeNode);
      } else {
        roots.push(treeNode);
      }
    });

    return roots;
  }, [graphData, filters]);

  const containerRef = React.useRef<HTMLDivElement>(null);

  const renderTree = (nodes: TreeNode[]) => {
    return nodes.map(node => (
      <Frame key={node.data.id} node={node.data} childCount={node.children.length}>
        {node.children.length > 0 && renderTree(node.children)}
      </Frame>
    ));
  };

  // Мемоизируем дерево, чтобы не перерисовывать тысячи DOM узлов при каждом чихе
  const renderedTree = useMemo(() => renderTree(tree), [tree]);

  const rootsCols = Math.ceil(Math.sqrt(tree.length || 1));
  const rootsColumns = useMemo(() => {
    if (!renderedTree.length) return [];
    const colsArray: React.ReactNode[][] = Array.from({ length: rootsCols }, () => []);
    renderedTree.forEach((child, index) => {
      colsArray[index % rootsCols].push(child);
    });
    return colsArray;
  }, [renderedTree, rootsCols]);

  // Базовый размер виртуального холста
  const CANVAS_SIZE = 10000;

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#0f111a', position: 'relative', display: 'flex' }}>
      {error ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f44336' }}>Error: {error}</div>
      ) : !graphData ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>Open a project to analyze.</div>
      ) : (
        <>
          {/* Контейнер для нашего кастомного React-рендера с Zoom & Pan */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
            <TransformWrapper
              initialScale={1}
              initialPositionX={50}
              initialPositionY={50}
              minScale={0.01} // Разрешаем отдалиться очень сильно
              maxScale={8}
              limitToBounds={false}
              wheel={{ step: 0.0001 }}
              panning={{ velocityDisabled: false }}
              doubleClick={{ disabled: true }}
              zoomAnimation={{ animationTime: 200, animationType: 'easeOutQuint' }}
            >
              {({ zoomIn, zoomOut, resetTransform }) => {
                return (
                  <>
                    <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                      <div
                        style={{ 
                          display: 'flex',
                          gap: '24px',
                          padding: '100px',
                          width: 'max-content',
                          minWidth: `${CANVAS_SIZE}px`,
                          alignItems: 'flex-start',
                        }}
                      >
                        {rootsColumns.map((col, i) => (
                          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            {col}
                          </div>
                        ))}
                      </div>
                    </TransformComponent>
                    
                    {/* Панель управления зумом */}
                    <div style={{ position: 'absolute', bottom: 20, right: 20, display: 'flex', gap: '8px', zIndex: 20 }}>
                      <button onClick={() => zoomIn(0.2)} style={{ background: 'rgba(0,0,0,0.7)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '8px 12px', cursor: 'pointer' }}>+</button>
                      <button onClick={() => zoomOut(0.2)} style={{ background: 'rgba(0,0,0,0.7)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '8px 12px', cursor: 'pointer' }}>-</button>
                      <button onClick={() => resetTransform()} style={{ background: 'rgba(0,0,0,0.7)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '8px 12px', cursor: 'pointer' }}>Reset</button>
                    </div>
                  </>
                );
              }}
            </TransformWrapper>
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
            <label style={{ display: 'block', marginBottom: 0, cursor: 'pointer', opacity: 0.5 }}>
              <input type="checkbox" disabled checked={filters.showEdges} style={{ marginRight: 8 }} />
              Связи (линии) - Отключены
            </label>
          </div>
        </>
      )}
    </div>
  );
};
