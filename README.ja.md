<div align="center">
  <img src="assets/icon.png" alt="CodeMaps" width="96" height="96" />

# CodeMaps

**コードの「生きた設計図」。人にはインタラクティブな依存関係マップを、AI エージェントにはクリーンなコードを書くためのアーキテクチャ情報を MCP サーバー経由で提供します。**

[![Release](https://img.shields.io/github/v/release/Zilk102/CodeMaps?style=flat-square&color=00ff9d)](https://github.com/Zilk102/CodeMaps/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/Zilk102/CodeMaps/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/Zilk102/CodeMaps/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Zilk102/CodeMaps?style=flat-square)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20Linux-informational?style=flat-square)

[🇺🇸 English](README.md) · [🇷🇺 Русский](README.ru.md) · [🇨🇳 简体中文](README.zh-CN.md) · [🇪🇸 Español](README.es.md) · [🇯🇵 日本語](README.ja.md) · [🇰🇷 한국어](README.ko.md)

</div>

CodeMaps はプロジェクトを、ディレクトリ・ファイル・クラス・関数とそれらの関係からなるグラフとしてインデックス化し、次の 2 通りで提供します。

- **人に対して**はインタラクティブなマップとして。新しいメンバーが、何が何とつながっているか、ファイルを変更する前に何がそれに依存しているかを確認できます。
- **AI エージェント**（Claude Code、Claude Desktop、Cursor、Trae、その他の MCP クライアント）に対しては、21 個のサイズ制限付きツールとして。リポジトリ全体を読まずに、_これを変えると何が壊れるか_、_すでに使えるヘルパーはあるか_、_自分の変更が巨大ファイルやクローンを増やしていないか_ に答えます。

すべてローカルで動作し、ソースコードがマシンの外に出ることはありません。

![マップとしてのプロジェクト](screenshots/graph-hierarchy.png)

## なぜ必要か

grep とファイル読み込みだけのエージェントは迷子になります。CodeMaps は、プロジェクトのマップ、変更の影響範囲、自分の編集のチェックを、コンテキストに収まる短い回答で提供します。

|                      | 得られるもの                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **全体把握**         | 見慣れないプロジェクトのエントリーポイント、レイヤー、境界を 1 回の呼び出しで（`prepare_project_context`）。          |
| **安全な変更**       | 編集前に、直接・間接の依存元を領域別に（`get_blast_radius`）。バレルの再エクスポートも対象。                          |
| **クリーンなコード** | `validate_architecture_changes` が変更したファイルだけを検査：巨大ファイル、クローン、長大・複雑なメソッド、ハブ。    |
| **低コストな読解**   | 関数本体を除いたファイルの骨格を行番号付きで（`get_semantic_skeleton`）。                                             |
| **レガシーの改修**   | 肥大化したモジュールや God クラスの分解ガイダンス（`analyze_decomposition`）。                                        |
| **出力の上限**       | すべての応答にサイズ上限があり、省略分は `_compaction` に記載されるため、1 回の呼び出しでコンテキストがあふれません。 |

## スクリーンショット

ファイルを選ぶと、その関数と依存先が見えます。

![選択したファイル](screenshots/graph-selection.png)

あらゆるエージェントから使える MCP サーバーとツール。

![MCP ツール](screenshots/mcp-tools.png)

## インストール

[Releases](https://github.com/Zilk102/CodeMaps/releases/latest) から最新ビルドをダウンロードします。

- **Windows**：インストーラー（`-setup-x64.exe`）、ポータブル版（`-win-x64.exe`）、または `.zip`
- **Linux**：`.AppImage`、`.deb`、`.rpm`、または `.tar.gz`

macOS 向けビルドはまだ公開していません。Node.js 22+ が `PATH` に必要なのは、Kuzu グラフデータベースを使う 3 つのツール（`calculate_blast_radius_v2`、`analyze_activity_heatmap`、`analyze_pr_impact`）だけで、それ以外は不要です。

CodeMaps は解析した各プロジェクト内の `.codemaps/` フォルダーに派生キャッシュを保存します。そのプロジェクトの `.gitignore` に追加してください。

## AI エージェントに接続する

CodeMaps を起動してから：

```bash
# Claude Code、すべてのプロジェクトで利用
claude mcp add --transport http --scope user codemaps http://127.0.0.1:3005/mcp
```

- **Claude Desktop** は `mcp-remote` ブリッジ経由、**Cursor** と **Trae** は URL で接続します。アプリの **MCP 設定 → 接続** に、コピーボタン付きのスニペットがあります。
- エージェントが `prepare_task_context` から始めるよう `codemaps-agent-autopilot` スキル（`.claude/skills/`）を追加し、すべての編集を自動で検証する任意の**フック**も利用できます。

詳しいガイド：[docs/CLAUDE_INTEGRATION.md](docs/CLAUDE_INTEGRATION.md)

## 対応言語

| 対応レベル           | 言語                                                 | 得られるもの                                                                                                                                                                          |
| -------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **セマンティック**   | TypeScript、TSX、JavaScript                          | TypeScript コンパイラによるインポート解決、バレルの再エクスポート                                                                                                                     |
| **プロジェクト解決** | Go、Python、Java、Rust、C/C++、C#、Kotlin、PHP、Ruby | インポートをファイルとシンボルまで解決（go.mod、Cargo ワークスペース、パッケージ、`__init__`、`#include` パス、名前空間、PSR-4、`require`）、同一パッケージ内の参照、型名付きメソッド |
| **構造**             | Zig、Swift、Bash（tree-sitter）                      | 宣言とインポート。型を考慮した解決は行いません                                                                                                                                        |
| **限定**             | HTML、CSS、Vue                                       | ファイルと基本的な構造                                                                                                                                                                |
| **メタデータ**       | Markdown（ADR）、YAML                                | コードに紐づくアーキテクチャ決定記録                                                                                                                                                  |

ファイル間の依存関係の精度はセマンティックが最も高く、他のレベルでは関係を有力な手がかりとして扱い、検索で確認してください。

## ドキュメント

| ドキュメント                                             | 内容                                                     |
| -------------------------------------------------------- | -------------------------------------------------------- |
| [docs/CLAUDE_INTEGRATION.md](docs/CLAUDE_INTEGRATION.md) | Claude Code と Desktop の設定、スキル、検証フック        |
| [docs/MCP_TOOLS.md](docs/MCP_TOOLS.md)                   | 21 個のツールと 4 個のリソースのリファレンス（自動生成） |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)             | CodeMaps の構成とその理由                                |
| [CONTRIBUTING.md](CONTRIBUTING.md)                       | 開発環境、チェック、リリース手順                         |
| [CHANGELOG.md](CHANGELOG.md)                             | 各バージョンの変更内容                                   |

## 開発

```bash
git clone https://github.com/Zilk102/CodeMaps.git
cd CodeMaps
yarn install        # サポートしているのは yarn のみ
npm run dev         # Vite + Electron
npm run verify      # CI が実行するすべて：lint、フォーマット、型、テスト、ビルド
npm run mcp:smoke   # 実行中のインスタンスですべての MCP ツールを呼び出す
```

技術スタックは Electron、React、TypeScript、Vite です。グラフのレイアウトは elkjs、解析は tree-sitter と TypeScript コンパイラを使います。Node.js 22+ が必要です。

## コントリビュート、セキュリティ、ライセンス

プルリクエストの前に [CONTRIBUTING.md](CONTRIBUTING.md) を、脆弱性の報告は [SECURITY.md](SECURITY.md) をご覧ください。[MIT ライセンス](LICENSE) で公開されています。
