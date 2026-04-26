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

**CodeMaps** es una poderosa herramienta para visualizar la arquitectura de la base de código y proporcionar contexto arquitectónico a los asistentes de IA. La aplicación construye un gráfico de dependencias "vivo" de su proyecto, ayudando a los desarrolladores y redes neuronales a comprender mejor la estructura, las relaciones y la deuda técnica.

## 🚀 Características principales

- **Construcción automatizada de gráficos**: Análisis semántico profundo del código (a través de AST y tree-sitter) para identificar relaciones entre archivos, clases y funciones.
- **Integración con Model Context Protocol (MCP)**: CodeMaps actúa como un servidor MCP, permitiendo que sus asistentes de IA (por ejemplo, Trae, Claude o Cursor) "vean" la arquitectura del proyecto, analicen dependencias y predigan las consecuencias de los cambios.
- **Análisis arquitectónico**:
  - **Blast Radius**: Evaluación de lo que se verá afectado al cambiar un módulo específico.
  - **Health Score**: Identificación de dependencias cíclicas y antipatrones arquitectónicos.
  - **Security Scanner**: Búsqueda básica de posibles vulnerabilidades en la estructura del código.
- **Ejecución local**: Todo el análisis ocurre localmente en su máquina; el código fuente nunca se envía a ningún lado.

---

## 🖼️ Capturas de pantalla

### Gráfico de código interactivo
Visualice toda su base de código como un gráfico interactivo con archivos, clases, funciones y sus relaciones.

![Gráfico principal](screenshots/main-graph.jpg)

### Configuración del servidor MCP — Descripción general
CodeMaps ejecuta un servidor MCP con endpoints HTTP y WebSocket, proporcionando a los agentes de IA acceso estructurado a la arquitectura de su proyecto.

![Descripción general MCP](screenshots/mcp-overview.jpg)

### Herramientas MCP
Más de 10 herramientas integradas para agentes de IA: analizar proyectos, obtener contexto del gráfico, buscar nodos, detectar patrones, ejecutar escaneos de seguridad y más.

![Herramientas MCP](screenshots/mcp-tools.jpg)

### Recursos MCP
Los recursos proporcionan a los agentes de IA resúmenes de proyectos de alto nivel, exportaciones completas del gráfico y playbooks de ejecución autónoma.

![Recursos MCP](screenshots/mcp-resources.jpg)

---

## 📦 Instalación

Descargue la última versión para su plataforma desde la página de [Releases](https://github.com/Zilk102/CodeMaps/releases).

La aplicación no requiere una instalación compleja y funciona inmediatamente en **Windows**, **Linux** y **macOS**.

### Inicio rápido

```bash
# Descargue el último release para su plataforma
# Windows: CodeMaps-x.x.x-win-x64.exe
# Linux: CodeMaps-x.x.x-linux-x86_64.AppImage (o .deb, .rpm)

# ¡Ejecútelo — no se necesita instalación!
```

---

## 🛠️ Desarrollo

El proyecto está construido con el siguiente stack: **Electron + React + TypeScript + Vite**. La visualización de gráficos utiliza Sigma.js.

### Requisitos previos

- Node.js 20+
- npm o yarn

### Ejecución local

```bash
# Clonar el repositorio
git clone https://github.com/Zilk102/CodeMaps.git
cd CodeMaps

# Instalar dependencias
npm install

# Iniciar la aplicación en modo desarrollo
npm run dev
```

### Compilación

```bash
# Crear build de producción (Portable)
npm run build:portable

# O compilar todos los formatos
npm run build
```

---

## 🤝 Contribución

¡Damos la bienvenida a cualquier ayuda en el desarrollo del proyecto! Por favor, lea la [guía de contribución](CONTRIBUTING.md) antes de crear un Pull Request.

---

## 📄 Licencia

El proyecto se distribuye bajo la licencia MIT. Consulte el archivo [LICENSE](LICENSE) para más detalles.
