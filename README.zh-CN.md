<div align="center">
  <img src="assets/icon.png" alt="CodeMaps" width="96" height="96" />

# CodeMaps

**代码的“活蓝图”：为人提供交互式依赖地图，并通过 MCP 服务器为 AI 智能体提供架构上下文，帮助它们写出整洁的代码。**

[![Release](https://img.shields.io/github/v/release/Zilk102/CodeMaps?style=flat-square&color=00ff9d)](https://github.com/Zilk102/CodeMaps/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/Zilk102/CodeMaps/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/Zilk102/CodeMaps/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Zilk102/CodeMaps?style=flat-square)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20Linux-informational?style=flat-square)

[🇺🇸 English](README.md) · [🇷🇺 Русский](README.ru.md) · [🇨🇳 简体中文](README.zh-CN.md) · [🇪🇸 Español](README.es.md) · [🇯🇵 日本語](README.ja.md) · [🇰🇷 한국어](README.ko.md)

</div>

CodeMaps 会把项目索引成由目录、文件、类和函数及其关联组成的图，并以两种方式提供这张图：

- **给人**：交互式地图。新成员能看清什么与什么相连，以及修改某个文件之前有哪些依赖它。
- **给 AI 智能体**（Claude Code、Claude Desktop、Cursor、Trae 以及任何 MCP 客户端）：21 个有大小限制的工具，可回答_改这里会破坏什么？_、_是否已经有现成的辅助函数？_、_我的改动是否引入了 god 文件或代码克隆？_，而无需通读整个仓库。

一切都在本地运行，源代码不会离开你的机器。

![作为地图的项目](screenshots/graph-hierarchy.png)

## 为什么需要它

只有 grep 和读文件的智能体会迷路。CodeMaps 给它项目地图、改动的影响范围，以及对自己改动的检查，并且答案足够短，能放进上下文窗口。

|                  | 你能得到什么                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| **快速了解**     | 一次调用就能看到陌生项目的入口、分层和边界（`prepare_project_context`）。                          |
| **安全改动**     | 修改前按区域分组的直接与间接依赖方（`get_blast_radius`），包含 barrel 重新导出。                   |
| **整洁代码**     | `validate_architecture_changes` 只检查你改动的文件：god 文件、克隆、过长或过复杂的方法、枢纽节点。 |
| **低成本阅读**   | 去掉函数体的文件骨架，并带行号（`get_semantic_skeleton`）。                                        |
| **重构遗留代码** | 针对超大模块和 God 类的拆分建议（`analyze_decomposition`）。                                       |
| **输出有上限**   | 每个响应都有大小上限，被截断的内容会在 `_compaction` 中说明，单次调用不会撑爆智能体的上下文。      |

## 截图

选中一个文件，就能看到它的函数以及它依赖什么：

![选中的文件](screenshots/graph-selection.png)

MCP 服务器及其工具，随时可供任何智能体使用：

![MCP 工具](screenshots/mcp-tools.png)

## 安装

从 [Releases](https://github.com/Zilk102/CodeMaps/releases/latest) 下载最新版本：

- **Windows**：安装程序（`-setup-x64.exe`）、便携版（`-win-x64.exe`）或 `.zip`
- **Linux**：`.AppImage`、`.deb`、`.rpm` 或 `.tar.gz`

暂未发布 macOS 版本。只有基于 Kuzu 图数据库的三个工具（`calculate_blast_radius_v2`、`analyze_activity_heatmap`、`analyze_pr_impact`）需要 `PATH` 中有 Node.js 22+；其余功能无需它。

CodeMaps 会在每个被分析的项目内的 `.codemaps/` 文件夹中保存派生缓存，请把它加入该项目的 `.gitignore`。

## 连接 AI 智能体

先启动 CodeMaps，然后：

```bash
# Claude Code，对所有项目生效
claude mcp add --transport http --scope user codemaps http://127.0.0.1:3005/mcp
```

- **Claude Desktop** 通过 `mcp-remote` 桥接连接，**Cursor** 和 **Trae** 通过 URL 连接。应用内 **MCP 设置 → 连接** 提供带“复制”按钮的现成配置。
- 添加 `codemaps-agent-autopilot` 技能（`.claude/skills/`），让智能体从 `prepare_task_context` 开始；还可选用**钩子**，自动校验每一次编辑。

完整指南：[docs/CLAUDE_INTEGRATION.md](docs/CLAUDE_INTEGRATION.md)。

## 支持的语言

| 支持程度       | 语言                                                 | 能得到什么                                                                                                                          |
| -------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **语义级**     | TypeScript、TSX、JavaScript                          | 由 TypeScript 编译器解析导入，支持 barrel 重新导出                                                                                  |
| **项目级解析** | Go、Python、Java、Rust、C/C++、C#、Kotlin、PHP、Ruby | 导入解析到文件和符号（go.mod、Cargo 工作区、包、`__init__`、`#include` 路径、命名空间、PSR-4、`require`），同包引用，带类型名的方法 |
| **结构级**     | Zig、Swift、Bash（tree-sitter）                      | 声明和导入；不做类型感知的解析                                                                                                      |
| **有限**       | HTML、CSS、Vue                                       | 文件和基本结构                                                                                                                      |
| **元数据**     | Markdown（ADR）、YAML                                | 与代码关联的架构决策记录                                                                                                            |

跨文件依赖的准确度以语义级最高；其他级别请把关联当作有力线索，并用搜索确认。

## 文档

| 文档                                                     | 内容                                        |
| -------------------------------------------------------- | ------------------------------------------- |
| [docs/CLAUDE_INTEGRATION.md](docs/CLAUDE_INTEGRATION.md) | Claude Code 与 Desktop 配置、技能、校验钩子 |
| [docs/MCP_TOOLS.md](docs/MCP_TOOLS.md)                   | 21 个工具和 4 个资源的参考（自动生成）      |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)             | CodeMaps 的构成及原因                       |
| [CONTRIBUTING.md](CONTRIBUTING.md)                       | 开发环境、检查、发布流程                    |
| [CHANGELOG.md](CHANGELOG.md)                             | 各版本的变更                                |

## 开发

```bash
git clone https://github.com/Zilk102/CodeMaps.git
cd CodeMaps
yarn install        # 仅支持 yarn
npm run dev         # Vite + Electron
npm run verify      # CI 会运行的全部内容：lint、格式、类型、测试、构建
npm run mcp:smoke   # 对运行中的实例调用每个 MCP 工具
```

技术栈为 Electron、React、TypeScript 和 Vite；图布局由 elkjs 计算，解析使用 tree-sitter 和 TypeScript 编译器。需要 Node.js 22+。

## 参与贡献、安全、许可证

提交 pull request 前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，报告漏洞请见 [SECURITY.md](SECURITY.md)。基于 [MIT 许可证](LICENSE) 发布。
