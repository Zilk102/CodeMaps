import React, { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { Frame } from './Frame';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { buildTree, TreeNode } from '../utils/treeBuilder';
import { FilterPanel } from './FilterPanel';
import { ZoomControls } from './ZoomControls';
import { EdgesOverlay } from './EdgesOverlay';

export const GraphView: React.FC = () => {
  const { graphData, error, filters } = useStore();

  const tree = useMemo(() => {
    return buildTree(graphData, filters);
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
                        id="canvas-container"
                        style={{ 
                          display: 'flex',
                          gap: '24px',
                          padding: '100px',
                          width: 'max-content',
                          minWidth: `${CANVAS_SIZE}px`,
                          alignItems: 'flex-start',
                          position: 'relative' // for absolute positioning of the SVG overlay
                        }}
                      >
                        {rootsColumns.map((col, i) => (
                          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            {col}
                          </div>
                        ))}
                        
                        <EdgesOverlay />
                      </div>
                    </TransformComponent>
                    
                    <ZoomControls zoomIn={zoomIn} zoomOut={zoomOut} resetTransform={resetTransform} />
                  </>
                );
              }}
            </TransformWrapper>
          </div>
          
          <FilterPanel />
        </>
      )}
    </div>
  );
};
