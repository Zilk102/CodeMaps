# Release v{{VERSION}} 🚀

## 🇷🇺 Русская версия

### Hotfix интерфейса: шрифты, отступы и стартовый экран

Это быстрый исправляющий релиз поверх `v1.1.16`. Он убирает самые грубые визуальные проблемы: переломанные пропорции, слишком тяжёлый моноширинный интерфейс, некорректный стартовый layout с пустым проводником и лишнюю визуальную “грязь”, которая делала приложение похожим на неаккуратную debug-сборку.

**Что нового:**

- **🔤 Исправлена типографика:** внешний импорт Google Fonts убран, а глобальный UI больше не принудительно рендерится моноширинным шрифтом.
- **🧱 Исправлен стартовый layout:** боковая панель проводника теперь не показывается до открытия проекта, поэтому главный экран больше не зажат в сломанной двухпанельной сетке.
- **📏 Пересобрана геометрия шапки:** title bar стал компактнее, спокойнее по визуальному весу и больше не выглядит как набор случайных капсул с разными отступами.
- **🗂 Дочищен экран недавних проектов:** размеры текста, интервалы и карточки приведены к более читаемой и стабильной иерархии.
- **⚡ Убран лишний рендер-шум:** уменьшены blur и тяжелые тени на карточках, toast-уведомлениях и модалках, чтобы интерфейс ощущался легче и работал стабильнее.

---

## 🇺🇸 English Version

### UI Hotfix: Fonts, Spacing, and Startup Layout

This is a corrective hotfix on top of `v1.1.16`. It removes the most visible regressions: distorted spacing, an overly monospace-heavy UI, a broken startup layout with an empty explorer sidebar, and overly aggressive visual effects that made the app feel rough and unstable.

**Key Highlights:**

- **🔤 Typography fixed:** the external Google Fonts import is gone, and the entire UI is no longer forced into a monospace font.
- **🧱 Startup layout fixed:** the explorer sidebar now stays hidden until a project is opened, so the landing screen is no longer squeezed into a broken split layout.
- **📏 Header geometry cleaned up:** the title bar is more compact, visually calmer, and no longer feels like a row of mismatched pills with inconsistent spacing.
- **🗂 Recent-projects screen refined:** text sizing, spacing, and card hierarchy were rebalanced to make the landing experience readable again.
- **⚡ Reduced render noise:** blur and heavy shadow usage were toned down across cards, toasts, and modals so the interface feels lighter and renders more smoothly.

---

## 🇨🇳 中文版本

### 界面热修复：字体、间距与启动布局

这是针对 `v1.1.16` 的修复版本。它解决了最明显的界面回退问题：错乱的间距、过度使用等宽字体、启动时空白资源管理器挤压首页布局，以及过重的视觉特效造成的粗糙与卡顿感。

**主要更新：**

- **🔤 修复字体系统：** 去掉了外部 Google Fonts 导入，并取消了整个界面强制使用等宽字体的做法。
- **🧱 修复启动布局：** 在项目未打开前不再显示左侧资源管理器，因此首页不会再被挤进错误的分栏布局里。
- **📏 清理顶部栏几何结构：** title bar 变得更紧凑、更克制，不再像一排间距失控的胶囊按钮。
- **🗂 优化最近项目首页：** 文本尺寸、留白和卡片层级重新调整，恢复了正常的可读性。
- **⚡ 降低渲染负担：** 卡片、toast 通知和弹窗上的模糊与重阴影被减弱，让界面更轻、更顺滑。
