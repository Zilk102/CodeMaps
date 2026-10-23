<div align="center">
  <img src="assets/icon.png" alt="CodeMaps" width="96" height="96" />

# CodeMaps

**Живой чертёж вашего кода: интерактивная карта зависимостей для людей и MCP-сервер, который даёт ИИ-агентам архитектурный контекст для написания чистого кода.**

[![Release](https://img.shields.io/github/v/release/Zilk102/CodeMaps?style=flat-square&color=00ff9d)](https://github.com/Zilk102/CodeMaps/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/Zilk102/CodeMaps/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/Zilk102/CodeMaps/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Zilk102/CodeMaps?style=flat-square)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20Linux-informational?style=flat-square)

[🇺🇸 English](README.md) · [🇷🇺 Русский](README.ru.md) · [🇨🇳 简体中文](README.zh-CN.md) · [🇪🇸 Español](README.es.md) · [🇯🇵 日本語](README.ja.md) · [🇰🇷 한국어](README.ko.md)

</div>

CodeMaps индексирует проект в граф из папок, файлов, классов и функций и связей между ними, а затем отдаёт этот граф двумя способами:

- **Людям**, как интерактивную карту: новичок видит, что с чем связано и что зависит от файла, прежде чем его менять.
- **ИИ-агентам** (Claude Code, Claude Desktop, Cursor, Trae и любому MCP-клиенту), как 22 ограниченный по размеру инструмент, отвечающий на вопросы _что сломается, если я изменю это?_, _нет ли уже такого помощника?_ и _не добавила ли моя правка god-файл или клон?_ без чтения всего репозитория.

Всё работает локально. Исходный код не покидает вашу машину.

![Проект как карта](screenshots/graph-hierarchy.png)

## Зачем

Агент, у которого есть только grep и чтение файлов, блуждает. CodeMaps даёт ему карту проекта, влияние изменения и проверку собственных правок, причём короткими ответами, которые помещаются в контекст.

|                        | Что вы получаете                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Ориентация**         | Точки входа, слои и границы незнакомого проекта одним вызовом (`prepare_project_context`).                                 |
| **Безопасные правки**  | Прямые и косвенные зависимые по областям до изменения (`get_blast_radius`), включая реэкспорты через barrel-файлы.         |
| **Чистый код**         | `validate_architecture_changes` проверяет только изменённые вами файлы: god-файлы, клоны, длинные и сложные методы, хабы.  |
| **Дешёвое чтение**     | Скелет файла без тел функций, с номерами строк (`get_semantic_skeleton`).                                                  |
| **Рефакторинг легаси** | Рекомендации по декомпозиции крупных модулей и God-классов (`analyze_decomposition`).                                      |
| **Ограниченный вывод** | Каждый ответ ограничен по размеру; всё отброшенное указано в `_compaction`, поэтому один вызов не засорит контекст агента. |

## Скриншоты

Выберите файл и увидите его функции и то, от чего он зависит:

![Выбранный файл](screenshots/graph-selection.png)

MCP-сервер и его инструменты, готовые для любого агента:

![MCP-инструменты](screenshots/mcp-tools.png)

## Установка

Скачайте последнюю сборку на странице [Releases](https://github.com/Zilk102/CodeMaps/releases/latest):

- **Windows**: установщик (`-setup-x64.exe`), портативная версия (`-win-x64.exe`) или `.zip`
- **Linux**: `.AppImage`, `.deb`, `.rpm` или `.tar.gz`

Сборки для macOS пока не публикуются. Node.js 22+ в `PATH` нужен только для трёх инструментов на базе графовой БД Kuzu (`calculate_blast_radius_v2`, `analyze_activity_heatmap`, `analyze_pr_impact`); всё остальное работает без него.

CodeMaps хранит производный кэш в папке `.codemaps/` внутри каждого анализируемого проекта; добавьте её в `.gitignore` этого проекта.

## Подключение ИИ-агента

Запустите CodeMaps, затем:

```bash
# Claude Code, для всех проектов
claude mcp add --transport http --scope user codemaps http://127.0.0.1:3005/mcp
```

- **Claude Desktop** подключается через мост `mcp-remote`, **Cursor** и **Trae** по URL. Готовые сниппеты с кнопкой «Копировать» есть в приложении: **Настройки MCP → Подключение**.
- Добавьте навык `codemaps-agent-autopilot` (`.claude/skills/`), чтобы агент начинал с `prepare_task_context`, и необязательный **хук**, который автоматически проверяет каждую правку.

Полное руководство: [docs/CLAUDE_INTEGRATION.md](docs/CLAUDE_INTEGRATION.md).

## Поддерживаемые языки

| Поддержка                 | Языки                                                | Что даёт                                                                                                                                                                                 |
| ------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Семантическая**         | TypeScript, TSX, JavaScript                          | Импорты разрешает компилятор TypeScript, реэкспорты barrel-файлов                                                                                                                        |
| **Разрешение по проекту** | Go, Python, Java, Rust, C/C++, C#, Kotlin, PHP, Ruby | Импорты разрешаются до файлов и символов (go.mod, Cargo-воркспейсы, пакеты, `__init__`, пути `#include`, пространства имён, PSR-4, `require`), связи внутри пакета, методы с именем типа |
| **Структурная**           | Zig, Swift, Bash (tree-sitter)                       | Объявления и импорты без разрешения типов                                                                                                                                                |
| **Ограниченная**          | HTML, CSS, Vue                                       | Файлы и базовая структура                                                                                                                                                                |
| **Метаданные**            | Markdown (ADR), YAML                                 | Записи об архитектурных решениях, связанные с кодом                                                                                                                                      |

Точность связей между файлами выше всего у семантического уровня; для остальных считайте связи сильной подсказкой и проверяйте поиском.

## Документация

| Документ                                                 | О чём                                                    |
| -------------------------------------------------------- | -------------------------------------------------------- |
| [docs/CLAUDE_INTEGRATION.md](docs/CLAUDE_INTEGRATION.md) | Настройка Claude Code и Desktop, навык, хук проверки     |
| [docs/MCP_TOOLS.md](docs/MCP_TOOLS.md)                   | Справочник по 22 инструменту и 4 ресурсам (генерируется) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)             | Как устроен CodeMaps и почему                            |
| [CONTRIBUTING.ru.md](CONTRIBUTING.ru.md)                 | Окружение разработки, проверки, процесс релиза           |
| [CHANGELOG.md](CHANGELOG.md)                             | Что изменилось в каждой версии                           |

## Разработка

```bash
git clone https://github.com/Zilk102/CodeMaps.git
cd CodeMaps
yarn install        # поддерживается только yarn
npm run dev         # Vite + Electron
npm run verify      # всё, что запускает CI: линт, формат, типы, тесты, сборки
npm run mcp:smoke   # вызвать каждый MCP-инструмент у запущенного экземпляра
```

Стек: Electron, React, TypeScript и Vite; раскладка графа считается elkjs, парсинг использует tree-sitter и компилятор TypeScript. Нужен Node.js 22+.

## Участие, безопасность, лицензия

Прочитайте [CONTRIBUTING.ru.md](CONTRIBUTING.ru.md) перед открытием pull request и [SECURITY.md](SECURITY.md), чтобы сообщить об уязвимости. Распространяется по [лицензии MIT](LICENSE).
