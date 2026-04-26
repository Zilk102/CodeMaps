# 🗺️ CodeMaps Roadmap 2026

## Анализ конкурентов (26.04.2026)
- **GitNexus** — 28,000⭐ (главный конкурент, Graph DB + MCP)
- **CodeFlow** — 2,530⭐ (браузерный, PR Impact Analysis)
- **GitKraken CodeMaps** — платный, нет open source
- **Cograph** — VS Code extension

## Наши уникальные преимущества
1. ✅ **Desktop + MCP** — ни у кого нет комбинации
2. ✅ **Real-time WebSocket** — мгновенное обновление
3. ✅ **Auto-updater** — GitHub Releases
4. ✅ **15 языков** — Tree-sitter WASM
5. ✅ **Локальный анализ** — никаких API

## Технические долги (критично)
| Приоритет | Фича | Почему | Конкурент |
|-----------|------|--------|-----------|
| **P0** | **Graph DB** (KuzuDB) | Главный недостаток. Сейчас в памяти — всё теряется при закрытии | GitNexus |
| **P1** | **PR Impact Analysis** | Популярная фича, есть у всех конкурентов | CodeFlow, GitNexus |
| **P1** | **Activity Heatmap** | Git churn, видно "горячие" зоны | CodeFlow |
| **P2** | **Web UI** (без установки) | Привлечёт пользователей | GitNexus, CodeFlow |
| **P2** | **CLI mode** | CI/CD интеграция | GitNexus |
| **P2** | **Skills generation** | .claude/skills/ как у GitNexus | GitNexus |
| **P3** | **Rename tool** | Coordinated multi-file rename | GitNexus |
| **P3** | **Export** (JSON/Markdown/SVG) | Для интеграций | CodeFlow |

## 🏗️ Архитектура

```
┌─────────────────────────────────────────────────┐
│                   CodeMaps                        │
├─────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │
│  │   Graph     │  │  Graph DB   │  │  MCP     │ │
│  │   Engine    │◄─┤  (KuzuDB)   │  │  Server  │ │
│  │  (Sigma.js) │  │  (persist)  │  │          │ │
│  └──────┬──────┘  └─────────────┘  └──────────┘ │
│         │                                         │
│  ┌──────▼──────┐  ┌─────────────┐  ┌──────────┐ │
│  │  Electron   │  │  WebSocket  │  │  Git     │ │
│  │   (UI)      │  │  (real-time)│  │  (churn) │ │
│  └─────────────┘  └─────────────┘  └──────────┘ │
└─────────────────────────────────────────────────┘
```

## 📅 Фазы разработки

### Phase 1: Foundation (2-3 недели)
- [ ] Интеграция KuzuDB (embedded graph DB)
- [ ] Миграция in-memory → persistent storage
- [ ] Индексация узлов и связей
- [ ] Запросы через Cypher

### Phase 2: Analytics (2-3 недели)
- [ ] PR Impact Analysis
- [ ] Activity Heatmap (git churn)
- [ ] Blast Radius v2 (через Graph DB)
- [ ] Export (JSON/Markdown/SVG)

### Phase 3: Distribution (2 недели)
- [ ] Web UI (Vercel, без установки)
- [ ] CLI mode (npx codemaps analyze)
- [ ] Skills generation (.claude/skills/)

### Phase 4: Polish (1-2 недели)
- [ ] Rename tool
- [ ] Performance optimization
- [ ] Пиар (Reddit, HN, dev.to)

## 🎯 Цель: 5,000⭐ к концу 2026
