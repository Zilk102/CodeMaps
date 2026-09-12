# CodeMaps: теги, релизы и порядок выпуска

Этот файл описывает фактический релизный процесс именно для репозитория `CodeMaps`, а не абстрактный GitHub Flow.

## Коротко

- Основной путь релиза здесь: **создать git-тег вида `vX.Y.Z` и запушить его на `origin`**.
- Именно **тег** является источником версии для CI/CD.
- `package.json` в релизных workflow **переписывается из тега автоматически**.
- Имя GitHub Release берется **напрямую из тега** без version-хардкода в workflow.
- Тело GitHub Release генерируется из шаблона `.github/release-body.md` с автоматической подстановкой `{{VERSION}}`.
- Для каждого релиза обязательны описания на **трёх языках: RU / EN / ZH**.
- GitHub Release создается **только** при `push` тега `v*`.
- `workflow_dispatch` в текущем виде может собрать артефакты, но **не публикует GitHub Release**, потому что шаг публикации обернут в `if: startsWith(github.ref, 'refs/tags/v')`.

## Что реально настроено в репозитории

### 1. CI

Файл: `.github/workflows/ci.yml`

- запускается на:
  - `push` в `main`
  - `pull_request` в `main`
  - `push` тегов `v*`
- прогоняет:
  - `npm run lint`
  - `npm run format:check`
  - `npm run typecheck`
  - `npm test`
  - компиляцию `build:renderer` и `build:electron`

### 2. Release

Файл: `.github/workflows/release.yml`

- запускается на:
  - `push` тегов `v*`
  - `workflow_dispatch`
- на Linux и Windows делает:
  - `yarn install --frozen-lockfile`
  - `npm run lint`
  - `npm run typecheck`
  - `npm test`
  - `npm run clean:build`
  - `npm run build:renderer`
  - `npm run build:electron`
  - `node scripts/patch-tree-sitter-wasms.js`
  - `electron-builder`
- затем job `publish`:
  - скачивает артефакты обеих платформ
  - удаляет старые assets у релиза с тем же тегом
  - генерирует итоговое тело релиза из шаблона `.github/release-body.md`
  - публикует GitHub Release через `softprops/action-gh-release`

### 3. Откуда берется версия

- `package.json` сейчас содержит текущую рабочую версию.
- Но в release workflow версия **не берется как источник истины**.
- На релизе workflow делает:
  - Linux: `VERSION="${INPUT_VERSION:-${GITHUB_REF_NAME#v}}"`
  - Windows: версия извлекается из `inputs.version` или из `GITHUB_REF_NAME`
- После этого workflow временно обновляет `package.json` внутри CI job.

Итого: **источник релизной версии = git tag**, а не ручная правка `package.json`.

## Стандартный порядок выпуска релиза

### Шаг 0. Работать только от `main`

```powershell
git switch main
git fetch origin
git pull --ff-only origin main
```

### Шаг 1. Убедиться, что рабочее дерево чистое

```powershell
git status --short
```

Ожидаемый результат: пусто.

### Шаг 2. Обновить release notes

Перед новым релизом обнови:

- `CHANGELOG.md`
- `.github/release-body.md`

Важно:

- `CHANGELOG.md` нужен как история версий в репозитории.
- `.github/release-body.md` используется как шаблон release notes.
- Версия в шаблоне должна указываться через `{{VERSION}}`, а не вручную.
- В шаблоне обязаны быть три секции:
  - `🇷🇺 Русская версия`
  - `🇺🇸 English Version`
  - `🇨🇳 中文版本`

### Шаг 3. Локально прогнать обязательные проверки

```powershell
yarn install --frozen-lockfile
npm run format:check
npm run lint
npm run typecheck
npm test
npm run clean:build
npm run build:renderer
npm run build:electron
node scripts/patch-tree-sitter-wasms.js
node scripts/generate-release-body.mjs 1.1.10
```

Опционально, но очень желательно для этого проекта:

```powershell
$env:MCP_PROJECT_PATH='d:\PROJECT\CodeMaps'
npm run mcp:smoke
```

Примечание: `mcp:smoke` ожидает живой MCP runtime. Если нужен полный smoke, сначала надо поднять сервер.

## Основной релизный путь: через git tag

### Шаг 4. Создать аннотированный тег

Пример для патч-релиза `v1.1.10`:

```powershell
git tag -a v1.1.10 -m "release: v1.1.10"
```

Проверить:

```powershell
git tag --sort=-creatordate | Select-Object -First 10
git show v1.1.10 --stat
```

### Шаг 5. Запушить тег

```powershell
git push origin v1.1.10
```

Не надо делать `git push --tags`, если не хочешь случайно вытолкнуть старые локальные теги.

### Шаг 6. Что произойдет автоматически

После `git push origin v1.1.10` GitHub Actions сделает следующее:

1. `ci.yml` отработает на теге.
2. `release.yml` соберет Linux и Windows артефакты.
3. Версия в `package.json` внутри workflow будет установлена в `1.1.10`.
4. Workflow сгенерирует `.github/release-body.generated.md` из шаблона.
5. Будет создан GitHub Release для тега `v1.1.10` с именем `v1.1.10`.
6. В релиз будут приложены артефакты из папки `release/`:
   - `CodeMaps-...`
   - `latest*.yml`

## Примеры типовых релизов

### Патч-релиз

```powershell
git switch main
git fetch origin
git pull --ff-only origin main
git status --short

npm run format:check
npm run lint
npm run typecheck
npm test

git tag -a v1.1.10 -m "release: v1.1.10"
git push origin v1.1.10
```

### Минорный релиз

```powershell
git switch main
git pull --ff-only origin main

# Обновить CHANGELOG.md и шаблон .github/release-body.md

npm run format:check
npm run lint
npm run typecheck
npm test
npm run clean:build
npm run build:renderer
npm run build:electron

git tag -a v1.2.0 -m "release: v1.2.0"
git push origin v1.2.0
```

### Хотфикс-релиз

```powershell
git switch main
git pull --ff-only origin main

# Влить фикс в main

npm run format:check
npm run lint
npm run typecheck
npm test

git tag -a v1.1.10 -m "release: hotfix v1.1.10"
git push origin v1.1.10
```

## Если тег создали ошибочно

### Удалить локальный тег

```powershell
git tag -d v1.1.10
```

### Удалить тег на удаленке

```powershell
git push origin :refs/tags/v1.1.10
```

После этого можно создать правильный тег заново:

```powershell
git tag -a v1.1.10 -m "release: v1.1.10"
git push origin v1.1.10
```

## Если нужно переиздать тот же тег

Обычно лучше **не переписывать существующий тег**, а выпускать следующую версию, например `v1.1.11`.

Но если совсем прижало, технический порядок такой:

```powershell
git tag -d v1.1.10
git push origin :refs/tags/v1.1.10
git tag -a v1.1.10 -m "release: v1.1.10"
git push origin v1.1.10
```

Это переписывает историю релиза и должно использоваться только осознанно.

## Что делает `workflow_dispatch`

Файл: `.github/workflows/release.yml`

Сейчас ручной запуск workflow:

- принимает `version`
- обновляет версию внутри CI job
- генерирует итоговое тело релиза из шаблона
- собирает артефакты

Но:

- шаг `Create Release` выполняется только при `refs/tags/v*`
- значит **ручной запуск сам по себе GitHub Release не публикует**

Итого:

- `workflow_dispatch` годится для тестовой сборки релизного контура
- для настоящего релиза нужен **git tag**

## Какие команды реально полезны в работе

### Посмотреть последние теги

```powershell
git tag --sort=-creatordate | Select-Object -First 20
```

### Посмотреть, какой коммит помечен тегом

```powershell
git show v1.1.9 --stat
```

### Посмотреть последние коммиты с тегами

```powershell
git log --oneline --decorate -20
```

### Проверить релизные workflow локально по смыслу

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run clean:build
npm run build:renderer
npm run build:electron
```

### Собрать portable Windows локально

```powershell
npm run build:portable
```

### Собрать полный пакет локально

```powershell
npm run build
```

## Где лежат артефакты

Согласно `package.json`:

- output directory: `release`

Типовые имена:

- Windows:
  - `CodeMaps-${version}-win-x64.exe`
  - `CodeMaps-${version}-setup-x64.exe`
  - `CodeMaps-${version}-win-x64.zip`
- Linux:
  - `CodeMaps-${version}-linux-x64.AppImage`
  - `CodeMaps-${version}-linux-x64.deb`
  - `CodeMaps-${version}-linux-x64.rpm`
  - `CodeMaps-${version}-linux-x64.tar.gz`

Дополнительно публикуются:

- `latest*.yml`

Они важны для `electron-updater`.

## Важные подводные камни именно этого репозитория

### 1. Не полагаться на `package.json` как на источник версии релиза

Workflow сам переписывает `package.json` из тега. Поэтому:

- можно не делать отдельный commit только ради bump версии перед релизом,
- но changelog и release notes все равно надо поддерживать руками.

### 2. Не пушить все теги разом

Используй:

```powershell
git push origin v1.1.10
```

а не:

```powershell
git push --tags
```

### 3. `workflow_dispatch` не заменяет теговый релиз

Это важно: ручной запуск workflow сейчас не публикует release.

## Рекомендуемый практический шаблон на каждый релиз

```powershell
git switch main
git fetch origin
git pull --ff-only origin main
git status --short

# Обновить CHANGELOG.md и шаблон .github/release-body.md

yarn install --frozen-lockfile
npm run format:check
npm run lint
npm run typecheck
npm test
npm run clean:build
npm run build:renderer
npm run build:electron
node scripts/generate-release-body.mjs X.Y.Z

git tag -a vX.Y.Z -m "release: vX.Y.Z"
git push origin vX.Y.Z
```

После этого:

1. проверить GitHub Actions для тега
2. открыть GitHub Release
3. убедиться, что приложились оба набора артефактов
4. убедиться, что `latest*.yml` тоже присутствуют
5. убедиться, что имя релиза совпадает с тегом
6. убедиться, что в теле релиза есть RU / EN / ZH секции

## Мини-чеклист релиз-менеджера

- `main` синхронизирован с `origin/main`
- рабочее дерево чистое
- `CHANGELOG.md` обновлен
- шаблон `.github/release-body.md` обновлен
- в release notes есть RU / EN / ZH секции
- `format:check`, `lint`, `typecheck`, `test` прошли
- сборка прошла
- генерация `node scripts/generate-release-body.mjs X.Y.Z` прошла
- создан аннотированный тег `vX.Y.Z`
- тег запушен одной командой `git push origin vX.Y.Z`
- GitHub Actions на теге зелёные
- GitHub Release создан
- assets приложены
- auto-update метафайлы `latest*.yml` приложены
