# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **CodeMaps больше не дублирует сам себя:** детектор клонов на собственном коде показывает 0 групп (было 40), `npm run quality` пуст (функций длиннее 60 строк или сложнее 15 нет, god-классов нет). Общие части вынесены в небольшие модули: правила рисков, адаптеры стека, панели интерфейса, привязки главного процесса. Поведение и вывод инструментов не изменились.
- **Новые команды `npm run quality` и `npm run duplicates`** запускают те же измерения CodeMaps на любой папке; они описаны в CLAUDE.md, чтобы новый код не добавлял замечаний. Тесты: 467 -> 519.

### 🇬🇧 Changes (EN)

- **CodeMaps no longer duplicates itself:** the clone detector reports 0 groups on its own code (it was 40), and `npm run quality` is empty (no function over 60 lines or complexity 15, no god classes). Shared parts moved into small modules: risk rules, stack adapters, UI panels, main-process bindings. Behavior and tool output are unchanged.
- **New `npm run quality` and `npm run duplicates` commands** run the same CodeMaps measurements on any folder; they are listed in CLAUDE.md so new code adds no findings. Tests: 467 -> 519.

### 🇨🇳 变更 (ZH)

- **CodeMaps 不再重复自己：** 克隆检测器在其自身代码上报告 0 组（之前是 40 组），`npm run quality` 为空（没有超过 60 行或复杂度超过 15 的函数，也没有 god 类）。共享部分被提取到小模块中：风险规则、技术栈适配器、界面面板、主进程绑定。行为和工具输出保持不变。
- **新增 `npm run quality` 和 `npm run duplicates` 命令**，可对任意文件夹运行 CodeMaps 的同一套度量；它们已写入 CLAUDE.md，使新代码不引入新问题。测试：467 -> 519。
