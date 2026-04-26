const fs = require('fs');
const path = require('path');

const localesPath = path.join(__dirname, 'src', 'i18n', 'locales');

const toolsEn = {
  analyze_project: {
    title: 'Analyze Project',
    description: 'Indexes the project and loads the graph into CodeMaps. Usually, the agent should call this automatically when changing projects.',
    recommendedWhen: 'When the project is not open yet or you need to switch the active workspace.'
  },
  get_graph_context: {
    title: 'Get Graph Context',
    description: 'Returns a graph summary or the full graph payload. Useful as a low-level fallback when the raw graph is needed.',
    recommendedWhen: 'When the composite context is insufficient and the agent needs a full snapshot of the graph.'
  },
  get_node_dependencies: {
    title: 'Get Node Dependencies',
    description: 'Shows incoming and outgoing links of a specific node. Usually needed as a fallback after prepare_change_context.',
    recommendedWhen: 'When you need to manually expand the local dependency context.'
  },
  search_graph: {
    title: 'Search Graph',
    description: 'Searches nodes by label or id, optionally filtered by type. Low-level search for ambiguous targets.',
    recommendedWhen: 'When target resolution in a composite context requires manual refinement.'
  },
  get_blast_radius: {
    title: 'Get Blast Radius',
    description: 'Calculates the direct and transitive impact of changing a node.',
    recommendedWhen: 'When planning a risky change and needing to assess the impact.'
  },
  get_architecture_overview: {
    title: 'Get Architecture Overview',
    description: 'Returns layer classifications, cross-layer dependencies, and boundary violations.',
    recommendedWhen: 'When analyzing the overall structure or verifying architectural compliance.'
  },
  get_health_score: {
    title: 'Get Health Score',
    description: 'Computes structural graph health metrics and an overall score.',
    recommendedWhen: 'When assessing technical debt or evaluating the impact of a refactor.'
  },
  detect_patterns: {
    title: 'Detect Patterns',
    description: 'Finds architectural hotspots and anti-pattern candidates in the graph.',
    recommendedWhen: 'When looking for refactoring opportunities or reviewing code quality.'
  },
  run_security_scan: {
    title: 'Run Security Scan',
    description: 'Scans indexed source files for high-risk patterns and suspicious artifacts.',
    recommendedWhen: 'When performing a security review or checking for hardcoded secrets.'
  },
  search_signatures: {
    title: 'Search Signatures',
    description: 'Searches declaration-like code signatures across indexed source files.',
    recommendedWhen: 'When looking for specific function or class definitions.'
  },
  prepare_project_context: {
    title: 'Prepare Project Context',
    description: 'Creates a project-level mental model so an agent can understand architecture before editing or review.',
    recommendedWhen: 'Immediately after opening a project to build an architectural understanding.'
  },
  prepare_task_context: {
    title: 'Prepare Task Context',
    description: 'Routes a natural-language user request into the right CodeMaps composite workflow with prepared context.',
    recommendedWhen: 'When the user describes a problem, feature, or review in natural language.'
  },
  prepare_change_campaign: {
    title: 'Prepare Change Campaign',
    description: 'Prepares a phased multi-target migration/refactor context for broad codebase changes.',
    recommendedWhen: 'For mass migrations, library switches, and broad refactoring campaigns.'
  },
  prepare_change_context: {
    title: 'Prepare Change Context',
    description: 'Prepares a high-level change context so an agent can edit code with architectural awareness.',
    recommendedWhen: 'Before starting a bugfix, feature implementation, or local refactor.'
  },
  prepare_review_context: {
    title: 'Prepare Review Context',
    description: 'Prepares a comprehensive context for code review, including architecture, patterns, and security.',
    recommendedWhen: 'When reviewing code, assessing architecture, or validating post-change impact.'
  }
};

const resourcesEn = {
  project_summary: {
    title: 'Project Summary',
    description: 'Brief summary of the project graph: root, node count, link count, and node types.'
  },
  graph_full: {
    title: 'Full Graph',
    description: 'Full JSON graph of the project for advanced analysis, client integrations, and debugging.'
  },
  agent_playbook: {
    title: 'Agent Playbook',
    description: 'How the agent should use CodeMaps automatically: preferred tools, fallback path, and execution order.'
  },
  agent_project_brain: {
    title: 'Project Brain',
    description: 'Ready-to-use architectural mental model of the current project for an agent-first start without manual tool orchestration.'
  }
};

const toolsRu = {
  analyze_project: {
    title: 'Анализ проекта',
    description: 'Индексирует проект и загружает граф в CodeMaps. Агент должен вызывать это автоматически при смене проекта.',
    recommendedWhen: 'Когда проект еще не открыт или нужно сменить активное рабочее пространство.'
  },
  get_graph_context: {
    title: 'Получить контекст графа',
    description: 'Возвращает сводку или полный граф. Полезно как низкоуровневый fallback, когда нужен сырой граф.',
    recommendedWhen: 'Когда композитного контекста недостаточно и агенту нужен полный снимок графа.'
  },
  get_node_dependencies: {
    title: 'Получить зависимости узла',
    description: 'Показывает входящие и исходящие связи узла. Обычно нужно как fallback после prepare_change_context.',
    recommendedWhen: 'Когда нужно вручную расширить локальный контекст зависимостей.'
  },
  search_graph: {
    title: 'Поиск по графу',
    description: 'Ищет узлы по метке или ID, с фильтром по типу. Низкоуровневый поиск для неоднозначных целей.',
    recommendedWhen: 'Когда разрешение цели в композитном контексте требует ручного уточнения.'
  },
  get_blast_radius: {
    title: 'Оценка радиуса поражения',
    description: 'Вычисляет прямое и транзитивное влияние изменения узла.',
    recommendedWhen: 'При планировании рискованного изменения для оценки последствий.'
  },
  get_architecture_overview: {
    title: 'Обзор архитектуры',
    description: 'Возвращает классификацию слоев, кросс-слойные зависимости и нарушения границ.',
    recommendedWhen: 'При анализе общей структуры или проверке архитектурного соответствия.'
  },
  get_health_score: {
    title: 'Оценка здоровья кода',
    description: 'Вычисляет структурные метрики здоровья графа и общую оценку.',
    recommendedWhen: 'При оценке технического долга или влияния рефакторинга.'
  },
  detect_patterns: {
    title: 'Поиск паттернов',
    description: 'Находит архитектурные хотспоты и кандидатов в анти-паттерны в графе.',
    recommendedWhen: 'При поиске возможностей для рефакторинга или ревью качества кода.'
  },
  run_security_scan: {
    title: 'Сканирование безопасности',
    description: 'Сканирует проиндексированные исходники на рискованные паттерны и подозрительные артефакты.',
    recommendedWhen: 'При проведении security review или проверке на хардкод-секреты.'
  },
  search_signatures: {
    title: 'Поиск сигнатур',
    description: 'Ищет сигнатуры (объявления функций/классов) по проиндексированным исходникам.',
    recommendedWhen: 'При поиске определений функций или классов.'
  },
  prepare_project_context: {
    title: 'Подготовить контекст проекта',
    description: 'Создает архитектурную модель проекта, чтобы агент понимал архитектуру перед правками или ревью.',
    recommendedWhen: 'Сразу после открытия проекта для формирования архитектурного понимания.'
  },
  prepare_task_context: {
    title: 'Подготовить контекст задачи',
    description: 'Маршрутизирует запрос пользователя в нужный композитный workflow с подготовленным контекстом.',
    recommendedWhen: 'Когда пользователь описывает проблему, фичу или ревью естественным языком.'
  },
  prepare_change_campaign: {
    title: 'Подготовка кампании изменений',
    description: 'Готовит поэтапный контекст для масштабных миграций и рефакторинга.',
    recommendedWhen: 'Для массовых миграций, смены библиотек и широкого рефакторинга.'
  },
  prepare_change_context: {
    title: 'Подготовка контекста изменения',
    description: 'Готовит высокоуровневый контекст изменения для архитектурно-осознанной правки кода.',
    recommendedWhen: 'Перед началом исправления бага, реализации фичи или локального рефакторинга.'
  },
  prepare_review_context: {
    title: 'Подготовка контекста ревью',
    description: 'Готовит исчерпывающий контекст для code review, включая архитектуру, паттерны и безопасность.',
    recommendedWhen: 'При ревью кода, оценке архитектуры или валидации последствий изменения.'
  }
};

const resourcesRu = {
  project_summary: {
    title: 'Сводка по проекту',
    description: 'Краткая сводка по графу проекта: корень, количество узлов, связей и типы узлов.'
  },
  graph_full: {
    title: 'Полный граф',
    description: 'Полный JSON-граф проекта для глубокого анализа, интеграции клиентов и отладки.'
  },
  agent_playbook: {
    title: 'Плейбук агента',
    description: 'Как агент должен использовать CodeMaps автоматически: приоритетные инструменты, фоллбэки и порядок выполнения.'
  },
  agent_project_brain: {
    title: 'Мозг проекта',
    description: 'Готовая архитектурная модель текущего проекта для старта агента без ручной оркестрации инструментов.'
  }
};

const toolsZh = {
  analyze_project: {
    title: '分析项目',
    description: '索引项目并将图加载到 CodeMaps 中。通常，代理在更改项目时应自动调用此功能。',
    recommendedWhen: '当项目尚未打开或需要切换活动工作区时。'
  },
  get_graph_context: {
    title: '获取图上下文',
    description: '返回图摘要或完整图。当需要原始图时可用作低级后备。',
    recommendedWhen: '当复合上下文不足且代理需要图的完整快照时。'
  },
  get_node_dependencies: {
    title: '获取节点依赖',
    description: '显示特定节点的传入和传出链接。通常在 prepare_change_context 之后作为后备需要。',
    recommendedWhen: '当需要手动扩展局部依赖上下文时。'
  },
  search_graph: {
    title: '搜索图',
    description: '按标签或 ID 搜索节点，可按类型过滤。针对模糊目标的低级搜索。',
    recommendedWhen: '当复合上下文中的目标解析需要手动细化时。'
  },
  get_blast_radius: {
    title: '获取爆炸半径',
    description: '计算更改节点的直接和传递影响。',
    recommendedWhen: '在计划有风险的更改并需要评估影响时。'
  },
  get_architecture_overview: {
    title: '获取架构概览',
    description: '返回层分类、跨层依赖关系和边界违规。',
    recommendedWhen: '在分析整体结构或验证架构合规性时。'
  },
  get_health_score: {
    title: '获取健康评分',
    description: '计算结构图健康指标和总分。',
    recommendedWhen: '在评估技术债务或重构影响时。'
  },
  detect_patterns: {
    title: '检测模式',
    description: '在图中查找架构热点和反模式候选者。',
    recommendedWhen: '在寻找重构机会或审查代码质量时。'
  },
  run_security_scan: {
    title: '运行安全扫描',
    description: '扫描索引的源文件以查找高风险模式和可疑工件。',
    recommendedWhen: '在执行安全审查或检查硬编码机密时。'
  },
  search_signatures: {
    title: '搜索签名',
    description: '跨索引的源文件搜索类似声明的代码签名。',
    recommendedWhen: '在寻找特定函数或类定义时。'
  },
  prepare_project_context: {
    title: '准备项目上下文',
    description: '创建项目级心智模型，以便代理在编辑或审查之前了解架构。',
    recommendedWhen: '打开项目后立即建立架构理解。'
  },
  prepare_task_context: {
    title: '准备任务上下文',
    description: '将自然语言用户请求路由到具有准备好的上下文的正确 CodeMaps 复合工作流中。',
    recommendedWhen: '当用户用自然语言描述问题、功能或审查时。'
  },
  prepare_change_campaign: {
    title: '准备变更活动',
    description: '为广泛的代码库更改准备分阶段的多目标迁移/重构上下文。',
    recommendedWhen: '用于大规模迁移、库切换和广泛的重构活动。'
  },
  prepare_change_context: {
    title: '准备变更上下文',
    description: '准备高级更改上下文，以便代理可以利用架构意识编辑代码。',
    recommendedWhen: '在开始错误修复、功能实现或局部重构之前。'
  },
  prepare_review_context: {
    title: '准备审查上下文',
    description: '准备全面的代码审查上下文，包括架构、模式和安全性。',
    recommendedWhen: '在审查代码、评估架构或验证更改后的影响时。'
  }
};

const resourcesZh = {
  project_summary: {
    title: '项目摘要',
    description: '项目图的简要摘要：根、节点计数、链接计数和节点类型。'
  },
  graph_full: {
    title: '完整图',
    description: '用于高级分析、客户端集成和调试的项目的完整 JSON 图。'
  },
  agent_playbook: {
    title: '代理剧本',
    description: '代理应如何自动使用 CodeMaps：首选工具、后备路径和执行顺序。'
  },
  agent_project_brain: {
    title: '项目大脑',
    description: '当前项目的即用型架构心智模型，用于代理优先启动，无需手动工具编排。'
  }
};

function updateLocale(filename, tools, resources) {
  const filePath = path.join(localesPath, filename);
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!data.mcpSettings) data.mcpSettings = {};
    data.mcpSettings.tools = tools;
    data.mcpSettings.resources = resources;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    console.log('Updated', filename);
  }
}

updateLocale('en.json', toolsEn, resourcesEn);
updateLocale('ru.json', toolsRu, resourcesRu);
updateLocale('zh.json', toolsZh, resourcesZh);
