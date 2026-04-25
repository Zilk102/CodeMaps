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

**CodeMaps** is a powerful tool for visualizing codebase architecture and providing architectural context to AI assistants. The application builds a "living" dependency graph of your project, helping developers and neural networks better understand structure, relationships, and technical debt.

## 🚀 Key Features

- **Automated Graph Building**: Deep semantic code analysis (via AST and tree-sitter) to identify relationships between files, classes, and functions.
- **Model Context Protocol (MCP) Integration**: CodeMaps acts as an MCP server, allowing your AI assistants (e.g., Trae, Claude, or Cursor) to "see" the project's architecture, analyze dependencies, and predict the consequences of changes.
- **Architectural Analytics**:
  - **Blast Radius**: Evaluate what will be affected by changing a specific module.
  - **Health Score**: Identify cyclic dependencies and architectural anti-patterns.
  - **Security Scanner**: Basic search for potential vulnerabilities in the code structure.
- **Local Execution**: All analysis happens locally on your machine; source code is never sent anywhere.

## 📦 Installation

Download the portable version from the [Releases](https://github.com/Zilk102/CodeMaps/releases) page.
The application requires no complex installation and works right out of the box on Windows.

## 🛠 Development

The project is built on the following stack: **Electron + React + TypeScript + Vite**. Cytoscape / Sigma are used for graph visualization.

### Run Locally

```bash
# Install dependencies
npm install

# Start the application in development mode
npm run dev
```

### Build

```bash
# Create a production build (Portable)
npm run build:portable
```

## 🤝 Contributing

We welcome any help in developing the project! Please read the [Contributing Guide](CONTRIBUTING.md) before creating a Pull Request.

## 📄 License

The project is distributed under the MIT License. See the [LICENSE](LICENSE) file for details.
