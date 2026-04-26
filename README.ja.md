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

**CodeMaps** は、コードベースのアーキテクチャを可視化し、AI アシスタントにアーキテクチャの文脈を提供する強力なツールです。このアプリケーションは、プロジェクトの「ライブ」依存関係グラフを構築し、開発者とニューラルネットワークが構造、関係、技術的負債をよりよく理解できるようにします。

## 🚀 主な機能

- **自動グラフ構築**: AST と tree-sitter を介した深い意味論的コード分析により、ファイル、クラス、関数間の関係を特定します。
- **Model Context Protocol (MCP) 統合**: CodeMaps は MCP サーバーとして機能し、AI アシスタント（例：Trae、Claude、Cursor）がプロジェクトのアーキテクチャを「見て」、依存関係を分析し、変更の影響を予測できるようにします。
- **アーキテクチャ分析**:
  - **Blast Radius**: 特定のモジュールを変更した場合の影響を評価します。
  - **Health Score**: 循環依存関係とアーキテクチャの反パターンを特定します。
  - **Security Scanner**: コード構造における潜在的な脆弱性の基本検索を行います。
- **ローカル実行**: すべての分析はお使いのマシン上でローカルに行われます。ソースコードはどこにも送信されません。

---

## 🖼️ スクリーンショット

### インタラクティブなコードグラフ
ファイル、クラス、関数、およびそれらの関係を含む、コードベース全体をインタラクティブなグラフとして視覚化します。

![メイングラフ](screenshots/main-graph.jpg)

### MCP サーバー設定 — 概要
CodeMaps は HTTP と WebSocket のエンドポイントを備えた MCP サーバーを実行し、AI エージェントにプロジェクトのアーキテクチャへの構造化されたアクセスを提供します。

![MCP 概要](screenshots/mcp-overview.jpg)

### MCP ツール
AI エージェント向けの 10 以上の組み込みツール：プロジェクト分析、グラフコンテキストの取得、ノード検索、パターン検出、セキュリティスキャンの実行など。

![MCP ツール](screenshots/mcp-tools.jpg)

### MCP リソース
リソースは、AI エージェントに高レベルのプロジェクトサマリー、完全なグラフエクスポート、および自律実行プレイブックを提供します。

![MCP リソース](screenshots/mcp-resources.jpg)

---

## 📦 インストール

[Releases](https://github.com/Zilk102/CodeMaps/releases) ページから、お使いのプラットフォーム用の最新バージョンをダウンロードしてください。

このアプリケーションは複雑なインストールを必要とせず、**Windows**、**Linux**、**macOS**ですぐに動作します。

### クイックスタート

```bash
# お使いのプラットフォーム用の最新リリースをダウンロード
# Windows: CodeMaps-x.x.x-win-x64.exe
# Linux: CodeMaps-x.x.x-linux-x86_64.AppImage (または .deb、.rpm)

# 実行するだけ — インストール不要！
```

---

## 🛠️ 開発

プロジェクトは、**Electron + React + TypeScript + Vite** のスタックで構築されています。グラフの可視化には Sigma.js を使用しています。

### 前提条件

- Node.js 20+
- npm または yarn

### ローカルでの実行

```bash
# リポジトリのクローン
git clone https://github.com/Zilk102/CodeMaps.git
cd CodeMaps

# 依存関係のインストール
npm install

# 開発モードでアプリケーションを起動
npm run dev
```

### ビルド

```bash
# プロダクションビルドの作成（ポータブル）
npm run build:portable

# またはすべての形式をビルド
npm run build
```

---

## 🤝 貢献

プロジェクトの開発にあらゆる支援を歓迎します！Pull Request を作成する前に、[貢献ガイド](CONTRIBUTING.md) をお読みください。

---

## 📄 ライセンス

このプロジェクトは MIT ライセンスの下で配布されています。詳細は [LICENSE](LICENSE) ファイルをご覧ください。
