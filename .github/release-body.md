# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **Глобальный фикс отступов**: Удален конфликтный CSS-сброс `* { padding: 0 }`, который ломал все Tailwind-классы отступов (`px-`, `py-`). Теперь все кнопки, бейджи и панели выглядят идеально и не прилипают к краям.
- **Интерактивность**: Добавлены и улучшены hover/active состояния (`transition-all`, `hover:-translate-y-0.5`, `shadow-md`) для карточек недавних проектов.
- **Z-index и перекрытия**: Добавлен отступ `pb-24` для скролл-контейнера `RecentProjects`, чтобы проекты больше не перекрывались фиксированным переключателем языков.

### 🇬🇧 Changes (EN)

- **Global Padding Fix**: Removed conflicting CSS reset `* { padding: 0 }` that was breaking all Tailwind padding classes (`px-`, `py-`). All buttons, badges, and panels now look perfect and are not stuck to edges.
- **Interactivity**: Added and improved hover/active states (`transition-all`, `hover:-translate-y-0.5`, `shadow-md`) for recent project cards.
- **Z-index & Overlaps**: Added `pb-24` padding to the `RecentProjects` scroll container so projects no longer overlap with the fixed language switcher.

### 🇨🇳 变更 (ZH)

- **全局内边距修复**：删除了破坏所有 Tailwind 内边距类（`px-`、`py-`）的冲突 CSS 重置 `* { padding: 0 }`。现在所有的按钮、徽章和面板看起来都很完美，不再紧贴边缘。
- **交互性**：为最近的项目卡片添加并改进了悬停/活动状态（`transition-all`、`hover:-translate-y-0.5`、`shadow-md`）。
- **Z-index & 重叠**：为 `RecentProjects` 滚动容器添加了 `pb-24` 内边距，因此项目不再与固定的语言切换器重叠。
