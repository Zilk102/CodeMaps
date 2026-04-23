import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useStore, GraphNode, GraphLink } from '../store/useStore';
import Graph from 'graphology';
import { Sigma } from 'sigma';
import { EdgeArrowProgram } from 'sigma/rendering';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { createNodeImageProgram } from '@sigma/node-image';

const getIconSVG = (type: string, colorHex: string) => {
  let path = '';
  if (type === 'class') path = 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-7-4c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z';
  else if (type === 'function') path = 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z';
  else if (type === 'adr') path = 'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm-2 16c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm1-6h-2V7h2v5z';
  else path = 'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z'; // file
  
  // Убрана прозрачность из SVG (чтобы не было черных квадратов в WebGL)
  // Мы будем использовать opacity через CSS-цвета (rgba)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${colorHex.slice(0,7)}"><path d="${path}"/></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
};

export const GraphView: React.FC = () => {
  const { graphData, selectedNode, selectedPath, setSelectedNode, setSelectedPath, error, filters, setFilter } = useStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const hoveredNodeRef = useRef<string | null>(null);
  const draggedNodeRef = useRef<string | null>(null);
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

    // Функция для генерации цвета файла на основе его папки (кластеризация по модулям)
    const getModuleColor = (filePath: string) => {
      const parts = filePath.split('/');
      if (parts.length < 2) return '#4fc3f7'; // Корневые файлы (голубые)
      
      const moduleName = parts[parts.length > 2 ? parts.length - 2 : 0]; // Берем папку, в которой лежит файл
      
      // Генерируем псевдослучайный цвет на основе имени папки (строго яркие, пастельные тона)
      let hash = 0;
      for (let i = 0; i < moduleName.length; i++) hash = moduleName.charCodeAt(i) + ((hash << 5) - hash);
      const hue = Math.abs(hash) % 360;
      
      return `hsl(${hue}, 70%, 65%)`; // Яркие цвета (HSL проще конвертировать в HEX, но Sigma понимает любой формат в nodeColor)
    };

    // Helper для перевода HSL/RGB в HEX, так как Sigma.js лучше работает с HEX
    const stringToHex = (str: string) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
      let color = '#';
      for (let i = 0; i < 3; i++) {
        const value = (hash >> (i * 8)) & 0xFF;
        color += ('00' + value.toString(16)).substr(-2);
      }
      return color;
    };

    // Цвета групп
    const getColor = (node: GraphNode) => {
      if (node.type === 'directory') return '#ab47bc'; // Папки (фиолетовые)
      if (node.type === 'adr') return '#e91e63'; // ADR узлы (розовые)
      if (node.adr) return '#ec407a'; // Файлы, ссылающиеся на ADR
      if (node.type === 'file') {
        const heat = Math.min((node.churn || 1) / maxChurn, 1);
        if (heat > 0.5) return '#f44336'; // Hotspots (красные)
        
        // Красим файлы по папкам (модулям), чтобы они визуально группировались
        // Берем ID узла (это абсолютный путь) и извлекаем папку
        const relPath = node.id.replace(graphData.projectRoot.replace(/\\/g, '/'), '');
        const folder = relPath.substring(0, relPath.lastIndexOf('/'));
        
        if (!folder || folder === '') return '#4fc3f7'; // Корневые файлы
        
        // Генерируем уникальный HEX цвет для каждой папки
        let hash = 0;
        for (let i = 0; i < folder.length; i++) hash = folder.charCodeAt(i) + ((hash << 5) - hash);
        const hue = Math.abs(hash) % 360;
        return `hsl(${hue}, 80%, 70%)`; // Sigma поддерживает HSL в originalColor, но для SVG иконки нужен HEX. Напишем простой конвертер
      }
      if (node.type === 'class') return '#ffb74d';
      return '#81c784'; // Function
    };
    
    // Простой HSL to HEX
    const hslToHex = (h: number, s: number, l: number) => {
      l /= 100;
      const a = s * Math.min(l, 1 - l) / 100;
      const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
      };
      return `#${f(0)}${f(8)}${f(4)}`;
    };

    const getHexColor = (node: GraphNode) => {
      const color = getColor(node);
      if (color.startsWith('#')) return color;
      
      // Парсим hsl
      const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
      if (match) {
        return hslToHex(parseInt(match[1]), parseInt(match[2]), parseInt(match[3]));
      }
      return '#4fc3f7';
    };

    // Добавляем узлы
    graphData.nodes.forEach((node, i) => {
      if (!graph.hasNode(node.id)) {
        let size = 6;
        if (node.type === 'directory') size = 9;
        if (node.type === 'adr') size = 12;
        else if (node.type === 'file') size = Math.min(15, 4 + Math.log10(node.churn || 1) * 4); // Меньше размер файлов, как в CodeSee
        else if (node.type === 'class') size = 5;
        else size = 4;
        
        let lbl = `${node.label}`;
        if (node.churn > 1 && node.type === 'file') lbl += ` (Hotspot: ${node.churn})`;

        const angle = Math.random() * 2 * Math.PI;
        const radius = Math.random() * 50;
        const nodeColor = getHexColor(node);

        graph.addNode(node.id, {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          size,
          label: lbl,
          color: nodeColor, // Нативный цвет узла (без image)
          originalColor: nodeColor,
          type: 'circle', // Нативный рендеринг кругов, как в CodeSee (чистый WebGL без текстур)
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
          let edgeColor = 'rgba(255,255,255,0.1)';
          let edgeSize = 1;
          let weight = link.value || 1;
          
          // Визуальное разделение связей
          if (link.type === 'structure') {
            edgeColor = 'rgba(171, 71, 188, 0.08)'; // Едва заметная структура для папок
            edgeSize = 0.6;
            weight = 1;
          } else if (link.type === 'import') {
            edgeColor = 'rgba(79, 195, 247, 0.05)'; // Почти невидимые по умолчанию импорты
            edgeSize = 0.2; // Экстремально тонкие линии (убирает hairball)
            weight = 1; // Обычный вес
          } else if (link.type === 'adr') {
            edgeColor = 'rgba(233, 30, 99, 0.2)'; // Розовые
            edgeSize = 1;
          } else if (link.type === 'entity') {
            edgeColor = 'rgba(129, 199, 132, 0.5)'; // Зеленые
            weight = 2; 
            edgeSize = 1;
          }

          graph.addEdge(source, target, {
            color: edgeColor,
            size: edgeSize,
            weight: weight, // Это значение будет использовать ForceAtlas2
            type: link.type === 'import' ? 'arrow' : 'line', // Делаем импорты стрелками для понимания зависимости
            originalType: link.type
          });
        }
      }
    });

    // Запускаем ForceAtlas2 плавно, чтобы юзер видел как граф "распускается"
    console.log(`Starting ForceAtlas2 animation...`);
    let fa2Timer: any = null;
    let iterations = 0;
    const maxIterations = graph.order > 1000 ? 100 : 200;

    if (graph.order > 0) {
      fa2Timer = setInterval(() => {
        forceAtlas2.assign(graph, {
          iterations: 5,
          settings: {
            adjustSizes: true, // Файлы не накладываются друг на друга
            gravity: 0.1, // Сильная гравитация, чтобы убрать дыры между файлами и сжать их в кучу
            scalingRatio: 10, // Маленький скейлинг, чтобы кластеры были плотными (CodeSee-like)
            strongGravityMode: true, // Стягиваем все в центр экрана
            linLogMode: false, // Отключаем, чтобы не было "рваных" галактик с длинными отростками
            barnesHutOptimize: true,
            barnesHutTheta: 0.8,
            edgeWeightInfluence: 0.5,
            outboundAttractionDistribution: false 
          }
        });
        
        iterations += 5;
        if (sigmaRef.current) sigmaRef.current.refresh();
        
        if (iterations >= maxIterations) {
          clearInterval(fa2Timer);
          console.log('ForceAtlas2 animation finished');
        }
      }, 16); // ~60 FPS
    }

    console.log(`Initializing Sigma in container of size ${containerRef.current.clientWidth}x${containerRef.current.clientHeight}`);
    
    // Инициализируем рендерер
    const renderer = new Sigma(graph, containerRef.current, {
      edgeProgramClasses: {
        arrow: EdgeArrowProgram
      },
      defaultNodeType: 'circle', // Переключаемся на нативные круги (быстрый WebGL без текстур)
      defaultEdgeType: 'line',
      renderEdgeLabels: false,
      defaultNodeColor: '#4fc3f7',
      defaultEdgeColor: 'rgba(255,255,255,0.05)',
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
    let isDragging = false;

    renderer.on('downNode', (e) => {
      isDragging = true;
      draggedNodeRef.current = e.node;
      renderer.getCamera().disable(); // Отключаем перемещение камеры при перетаскивании
    });

    renderer.getMouseCaptor().on('mousemovebody', (e) => {
      if (!isDragging || !draggedNodeRef.current) return;
      const pos = renderer.viewportToGraph(e);
      graph.setNodeAttribute(draggedNodeRef.current, 'x', pos.x);
      graph.setNodeAttribute(draggedNodeRef.current, 'y', pos.y);
      e.preventSigmaDefault();
      e.original.preventDefault();
      e.original.stopPropagation();
    });

    renderer.getMouseCaptor().on('mouseup', () => {
      if (draggedNodeRef.current) {
        isDragging = false;
        draggedNodeRef.current = null;
        renderer.getCamera().enable(); // Включаем камеру обратно
      }
    });

    renderer.on('enterNode', ({ node }) => {
      document.body.style.cursor = 'pointer';
      hoveredNodeRef.current = node;
      renderer.refresh(); // Принудительная перерисовка для показа лейбла
    });

    renderer.on('leaveNode', () => {
      document.body.style.cursor = 'default';
      hoveredNodeRef.current = null;
      renderer.refresh();
    });

    return () => {
      if (fa2Timer) clearInterval(fa2Timer);
      renderer.kill();
      sigmaRef.current = null;
    };
  }, [graphData]); // Убрали maxChurn и dimensions.width из зависимостей, чтобы граф не пересоздавался при ресайзе

  // Эффект для Focus Mode и фильтров
  useEffect(() => {
    const renderer = sigmaRef.current;
    if (!renderer || !graphData) return;

    const graph = renderer.getGraph();

    // Регистрируем reducers здесь, так как они зависят от React-стейта (selectedNode, selectedPath)
    renderer.setSetting('nodeReducer', (node, data) => {
      const res = { ...data };
      if (res.hidden) return res;

      // Устанавливаем z-index: файлы спереди (0)
      res.zIndex = 0;

      // Затемняем узел (уводим в прозрачность)
      const originalData = graph.getNodeAttribute(node, 'originalData');
      
      if (res.hidden) return res;

      const isSelected = selectedNode && selectedNode.id === node;
      const isHovered = hoveredNodeRef.current === node;
      const isDragged = draggedNodeRef.current === node;

      if (isSelected || isHovered || isDragged) {
        res.highlighted = true;
        res.forceLabel = true;
      }

      if (!res.forceLabel) {
        res.label = ''; 
      }

      const activeNode = selectedNode ? selectedNode.id : hoveredNodeRef.current;
      const activePath = selectedPath ? (graphData.projectRoot + '/' + selectedPath).replace(/\\/g, '/') : null;
      
      if (activeNode || activePath) {
        let isFocused = false;

        if (activeNode) {
          isFocused = node === activeNode || graph.hasEdge(node, activeNode) || graph.hasEdge(activeNode, node);
        } else if (activePath) {
          isFocused = node.startsWith(activePath);
        }

        if (isFocused) {
          res.zIndex = 2;
          res.color = originalData.originalColor || res.color; // Восстанавливаем оригинальный цвет
        } else {
          // Затемняем узел (используем нативный цвет с прозрачностью)
          res.color = (originalData.originalColor || res.color) + '1A'; // 10% opacity
          res.zIndex = -1;
        }
      } else {
        res.color = originalData.originalColor || res.color; // В спокойном состоянии цвет нормальный
      }

      return res;
    });

    // Кастомный рендерер связей для Focus Mode
    renderer.setSetting('edgeReducer', (edge, data) => {
      const res = { ...data };
      if (res.hidden) return res;

      const activeNode = selectedNode ? selectedNode.id : hoveredNodeRef.current;
      const activePath = selectedPath ? (graphData.projectRoot + '/' + selectedPath).replace(/\\/g, '/') : null;

      if (activeNode || activePath) {
        let isFocused = false;

        if (activeNode) {
          isFocused = graph.hasExtremity(edge, activeNode);
        } else if (activePath) {
          const extremities = graph.extremities(edge);
          isFocused = extremities.some((n: string) => n.startsWith(activePath));
        }

        if (isFocused) {
          // Эта связь касается активного узла/пути - подсвечиваем её
          res.color = data.originalType === 'import' ? 'rgba(79, 195, 247, 1.0)' : 'rgba(255,255,255,0.8)';
          res.size = data.originalType === 'import' ? 3 : 1.5; // Толстая стрелка только в фокусе!
          res.zIndex = 1;
        } else {
          // Затемняем связь
          res.color = 'rgba(255,255,255,0.01)';
          res.zIndex = -1;
        }
      }

      return res;
    });
    
    // Сброс всех стилей и применение фильтров
    graph.forEachNode((node: any) => {
      const data = graph.getNodeAttribute(node, 'originalData');
      
      let isHidden = false;
      if (data.type === 'directory' && !filters.showDirectories) isHidden = true;
      if (data.type === 'file' && !filters.showFiles) isHidden = true;
      if (data.type === 'function' && !filters.showFunctions) isHidden = true;
      if (data.type === 'class' && !filters.showClasses) isHidden = true;
      if (data.type === 'adr' && !filters.showADR) isHidden = true;

      const hslToHexLocal = (h: number, s: number, l: number) => {
        l /= 100;
        const a = s * Math.min(l, 1 - l) / 100;
        const f = (n: number) => {
          const k = (n + h / 30) % 12;
          const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
          return Math.round(255 * color).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
      };

      let color = '#4fc3f7';
      if (data.type === 'directory') color = '#ab47bc';
      else if (data.type === 'adr') color = '#e91e63';
      else if (data.adr) color = '#ec407a';
      else if (data.type === 'file') {
        const heat = Math.min((data.churn || 1) / maxChurn, 1);
        if (heat > 0.5) {
          color = '#f44336';
        } else {
          const relPath = data.id.replace(graphData.projectRoot.replace(/\\/g, '/'), '');
          const folder = relPath.substring(0, relPath.lastIndexOf('/'));
          if (!folder || folder === '') {
            color = '#4fc3f7';
          } else {
            let hash = 0;
            for (let i = 0; i < folder.length; i++) hash = folder.charCodeAt(i) + ((hash << 5) - hash);
            const hue = Math.abs(hash) % 360;
            color = hslToHexLocal(hue, 80, 70);
          }
        }
      }
      else if (data.type === 'class') color = '#ffb74d';
      else color = '#81c784';

      graph.setNodeAttribute(node, 'color', color); // Применяем нативный цвет
      graph.setNodeAttribute(node, 'originalColor', color);
      graph.setNodeAttribute(node, 'hidden', isHidden);
      // Убрано setNodeAttribute('image') - иконок больше нет
    });

    graph.forEachEdge((edge: any, ext: any, source: any, target: any) => {
      const sourceHidden = graph.getNodeAttribute(source, 'hidden');
      const targetHidden = graph.getNodeAttribute(target, 'hidden');

      const type = graph.getEdgeAttribute(edge, 'originalType');
      let edgeColor = 'rgba(255,255,255,0.1)';
      let edgeSize = 1;
      
      if (type === 'structure') {
        edgeColor = 'rgba(171, 71, 188, 0.08)';
        edgeSize = 0.6;
      } else if (type === 'import') {
        edgeColor = 'rgba(79, 195, 247, 0.02)';
        edgeSize = 0.1;
      } else if (type === 'adr') {
        edgeColor = 'rgba(233, 30, 99, 0.2)';
        edgeSize = 1;
      } else if (type === 'entity') {
        edgeColor = 'rgba(129, 199, 132, 0.5)';
      }

      graph.setEdgeAttribute(edge, 'color', edgeColor);
      graph.setEdgeAttribute(edge, 'originalColor', edgeColor);
      graph.setEdgeAttribute(edge, 'size', edgeSize);
      graph.setEdgeAttribute(edge, 'hidden', sourceHidden || targetHidden);
    });

    // Фокус камеры при выборе из дерева
    if (selectedNode) {
      const pos = renderer.getNodeDisplayData(selectedNode.id);
      if (pos) {
        renderer.getCamera().animate({ x: pos.x, y: pos.y, ratio: 0.5 }, { duration: 500 });
      }
    }
  }, [selectedNode, selectedPath, graphData, maxChurn, filters]);

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
            <label style={{ display: 'block', marginBottom: 0, cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.showADR} onChange={(e) => setFilter('showADR', e.target.checked)} style={{ marginRight: 8 }} />
              ADR
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
