<div align="center">
  <p>
    <a href="README.md">🇺🇸 English</a> | 
    <a href="README.ru.md">🇷🇺 Русский</a> | 
    <a href="README.zh-CN.md">🇨🇳 简体中文</a> | 
    <a href="README.es.md">🇪🇸 Español</a> | 
    <a href="README.ja.md">🇯🇵 日本語</a> | 
    <a href="README.ko.md">🇰🇷 한국어</a>
  </p>
</div>

# CodeMaps

**CodeMaps** 是一款强大的代码库架构可视化工具，并能为 AI 助手提供架构上下文。该应用程序构建项目的"实时"依赖关系图，帮助开发者和神经网络更好地理解结构、关系和技术债务。

## 🚀 主要功能

- **自动化图表构建**：深度语义代码分析（通过 AST 和 tree-sitter）以识别文件、类和函数之间的关系。
- **Model Context Protocol (MCP) 集成**：CodeMaps 充当 MCP 服务器，允许您的 AI 助手（如 Trae、Claude 或 Cursor）"查看"项目架构，分析依赖关系并预测更改的后果。
- **架构分析**：
  - **爆炸半径 (Blast Radius)**：评估更改特定模块将产生的影响。
  - **健康评分 (Health Score)**：识别循环依赖和架构反模式。
  - **安全扫描器 (Security Scanner)**：基本搜索代码结构中的潜在漏洞。
- **本地执行**：所有分析都在您的机器上本地进行；源代码绝不会发送到任何地方。

---

## 🖼️ 截图

### 交互式代码图表
将整个代码库可视化为交互式图表，包含文件、类、函数及其关系。

![主图表](screenshots/main-graph.jpg)

### MCP 服务器设置 — 概览
CodeMaps 运行带有 HTTP 和 WebSocket 端点的 MCP 服务器，为 AI 代理提供对项目架构的结构化访问。

![MCP 概览](screenshots/mcp-overview.jpg)

### MCP 工具
为 AI 代理提供 10 多种内置工具：分析项目、获取图表上下文、搜索节点、检测模式、运行安全扫描等。

![MCP 工具](screenshots/mcp-tools.jpg)

### MCP 资源
资源为 AI 代理提供高级项目摘要、完整的图表导出和自主执行手册。

![MCP 资源](screenshots/mcp-resources.jpg)

---

## 📦 安装

从 [Releases](https://github.com/Zilk102/CodeMaps/releases) 页面下载适合您平台的最新版本。

该应用程序无需复杂的安装，可在 **Windows**、**Linux** 和 **macOS** 上直接使用。

### 快速开始

```bash
# 下载适合您平台的最新版本
# Windows: CodeMaps-x.x.x-win-x64.exe
# Linux: CodeMaps-x.x.x-linux-x86_64.AppImage (或 .deb, .rpm)

# 运行它 — 无需安装！
```

---

## 🛠️ 开发

项目基于以下技术栈构建：**Electron + React + TypeScript + Vite**。图表可视化使用 Sigma.js。

### 前提条件

- Node.js 20+
- npm 或 yarn

### 本地运行

```bash
# 克隆仓库
git clone https://github.com/Zilk102/CodeMaps.git
cd CodeMaps

# 安装依赖
npm install

# 在开发模式下启动应用程序
npm run dev
```

### 构建

```bash
# 创建生产版本 (便携版)
npm run build:portable

# 或构建所有格式
npm run build
```

---

## 🤝 贡献

我们欢迎任何对项目开发的帮助！在创建 Pull Request 之前，请阅读 [贡献指南](CONTRIBUTING.md)。

---

## 📄 许可证

本项目根据 MIT 许可证分发。详情请参阅 [LICENSE](LICENSE) 文件。
