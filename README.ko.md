<div align="center">
  <img src="assets/icon.png" alt="CodeMaps" width="96" height="96" />

# CodeMaps

**코드의 "살아 있는 설계도": 사람에게는 인터랙티브 의존성 지도를, AI 에이전트에게는 깔끔한 코드를 쓰기 위한 아키텍처 컨텍스트를 MCP 서버로 제공합니다.**

[![Release](https://img.shields.io/github/v/release/Zilk102/CodeMaps?style=flat-square&color=00ff9d)](https://github.com/Zilk102/CodeMaps/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/Zilk102/CodeMaps/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/Zilk102/CodeMaps/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Zilk102/CodeMaps?style=flat-square)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20Linux-informational?style=flat-square)

[🇺🇸 English](README.md) · [🇷🇺 Русский](README.ru.md) · [🇨🇳 简体中文](README.zh-CN.md) · [🇪🇸 Español](README.es.md) · [🇯🇵 日本語](README.ja.md) · [🇰🇷 한국어](README.ko.md)

</div>

CodeMaps는 프로젝트를 디렉터리, 파일, 클래스, 함수와 그 사이의 연결로 이루어진 그래프로 인덱싱하고, 이를 두 가지 방식으로 제공합니다.

- **사람에게**는 인터랙티브 지도로: 새로 합류한 개발자가 무엇이 무엇과 연결되어 있는지, 파일을 건드리기 전에 무엇이 그 파일에 의존하는지 볼 수 있습니다.
- **AI 에이전트**(Claude Code, Claude Desktop, Cursor, Trae 및 모든 MCP 클라이언트)에게는 크기가 제한된 22개의 도구로: 저장소 전체를 읽지 않고도 _이걸 바꾸면 무엇이 깨지는지_, _이미 쓸 만한 헬퍼가 있는지_, _내 수정이 거대한 파일이나 복제 코드를 늘리지 않았는지_ 에 답합니다.

모든 것이 로컬에서 실행되며, 소스 코드는 컴퓨터 밖으로 나가지 않습니다.

![지도로 본 프로젝트](screenshots/graph-hierarchy.png)

## 왜 필요한가

grep과 파일 읽기만 가진 에이전트는 헤맵니다. CodeMaps는 프로젝트 지도, 변경의 영향 범위, 자신의 수정에 대한 검사를 컨텍스트 창에 들어가는 짧은 답변으로 제공합니다.

|                     | 얻는 것                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **빠른 파악**       | 낯선 프로젝트의 진입점, 계층, 경계를 한 번의 호출로(`prepare_project_context`).                                      |
| **안전한 변경**     | 수정 전에 직접·간접 의존 대상을 영역별로(`get_blast_radius`), 배럴 재내보내기 포함.                                  |
| **깔끔한 코드**     | `validate_architecture_changes`가 바꾼 파일만 검사: 거대한 파일, 복제, 긴/복잡한 메서드, 허브.                       |
| **저렴한 읽기**     | 함수 본문을 뺀 파일 골격을 줄 번호와 함께(`get_semantic_skeleton`).                                                  |
| **레거시 리팩터링** | 비대한 모듈과 God 클래스의 분해 가이드(`analyze_decomposition`).                                                     |
| **출력 상한**       | 모든 응답에 크기 상한이 있고 생략된 내용은 `_compaction`에 표시되어, 한 번의 호출이 컨텍스트를 넘치게 하지 않습니다. |

## 스크린샷

파일을 선택하면 그 함수와 의존 대상이 보입니다.

![선택한 파일](screenshots/graph-selection.png)

어떤 에이전트에서도 사용할 수 있는 MCP 서버와 도구.

![MCP 도구](screenshots/mcp-tools.png)

## 설치

[Releases](https://github.com/Zilk102/CodeMaps/releases/latest)에서 최신 빌드를 내려받으세요.

- **Windows**: 설치 프로그램(`-setup-x64.exe`), 포터블(`-win-x64.exe`) 또는 `.zip`
- **Linux**: `.AppImage`, `.deb`, `.rpm` 또는 `.tar.gz`

macOS 빌드는 아직 배포하지 않습니다. `PATH`의 Node.js 22+는 Kuzu 그래프 데이터베이스를 사용하는 세 도구(`calculate_blast_radius_v2`, `analyze_activity_heatmap`, `analyze_pr_impact`)에만 필요하며, 나머지는 없어도 동작합니다.

CodeMaps는 분석한 각 프로젝트 안의 `.codemaps/` 폴더에 파생 캐시를 저장합니다. 해당 프로젝트의 `.gitignore`에 추가하세요.

## AI 에이전트 연결

CodeMaps를 실행한 뒤:

```bash
# Claude Code, 모든 프로젝트에 적용
claude mcp add --transport http --scope user codemaps http://127.0.0.1:3005/mcp
```

- **Claude Desktop**은 `mcp-remote` 브리지로, **Cursor**와 **Trae**는 URL로 연결합니다. 앱의 **MCP 설정 → 연결**에 복사 버튼이 있는 스니펫이 준비되어 있습니다.
- 에이전트가 `prepare_task_context`부터 시작하도록 `codemaps-agent-autopilot` 스킬(`.claude/skills/`)을 추가하고, 모든 수정을 자동으로 검증하는 선택형 **훅**도 사용할 수 있습니다.

전체 가이드: [docs/CLAUDE_INTEGRATION.md](docs/CLAUDE_INTEGRATION.md)

## 지원 언어

| 지원 수준         | 언어                                                         | 제공되는 것                                                                                                                 |
| ----------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **시맨틱**        | TypeScript, TSX, JavaScript                                  | TypeScript 컴파일러로 임포트 해석, 배럴 재내보내기                                                                          |
| **프로젝트 해석** | Go, Python, Java, Rust                                       | 임포트를 파일과 심볼까지 해석(go.mod, Cargo 워크스페이스, 패키지, `__init__`), 같은 패키지 내 참조, 타입 이름이 붙은 메서드 |
| **구조적**        | C/C++, C#, PHP, Ruby, Zig, Swift, Kotlin, Bash (tree-sitter) | 선언과 임포트. 타입을 고려한 해석은 하지 않음                                                                               |
| **제한적**        | HTML, CSS, Vue                                               | 파일과 기본 구조                                                                                                            |
| **메타데이터**    | Markdown (ADR), YAML                                         | 코드와 연결된 아키텍처 결정 기록                                                                                            |

파일 간 의존성 정확도는 시맨틱 수준이 가장 높으며, 다른 수준에서는 연결을 강한 단서로 보고 검색으로 확인하세요.

## 문서

| 문서                                                     | 내용                                       |
| -------------------------------------------------------- | ------------------------------------------ |
| [docs/CLAUDE_INTEGRATION.md](docs/CLAUDE_INTEGRATION.md) | Claude Code와 Desktop 설정, 스킬, 검증 훅  |
| [docs/MCP_TOOLS.md](docs/MCP_TOOLS.md)                   | 22개 도구와 4개 리소스 레퍼런스(자동 생성) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)             | CodeMaps의 구성과 그 이유                  |
| [CONTRIBUTING.md](CONTRIBUTING.md)                       | 개발 환경, 검사, 릴리스 절차               |
| [CHANGELOG.md](CHANGELOG.md)                             | 버전별 변경 사항                           |

## 개발

```bash
git clone https://github.com/Zilk102/CodeMaps.git
cd CodeMaps
yarn install        # yarn만 지원
npm run dev         # Vite + Electron
npm run verify      # CI가 실행하는 모든 것: lint, 포맷, 타입, 테스트, 빌드
npm run mcp:smoke   # 실행 중인 인스턴스에서 모든 MCP 도구 호출
```

기술 스택은 Electron, React, TypeScript, Vite이며, 그래프 레이아웃은 elkjs가, 파싱은 tree-sitter와 TypeScript 컴파일러가 담당합니다. Node.js 22+가 필요합니다.

## 기여, 보안, 라이선스

풀 리퀘스트를 열기 전에 [CONTRIBUTING.md](CONTRIBUTING.md)를, 취약점 신고는 [SECURITY.md](SECURITY.md)를 읽어 주세요. [MIT 라이선스](LICENSE)로 배포됩니다.
