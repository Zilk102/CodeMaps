# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **Поиск дублей больше не зависит от набора файлов и порядка.** Раньше идентификаторы токенов зависели от порядка первого появления, а пары копий внутри корзины сопоставлялись только с первой, поэтому инструмент `find_duplicates` и `npm run duplicates` давали разный результат на одном проекте, а добавление постороннего файла могло скрыть группу. Теперь идентификаторы считаются по тексту токена, сопоставляются все пары, потоки сортируются по файлу, а слишком короткая копия не отбрасывает всю группу. После исправления нашлись и убраны ещё 9 скрытых групп, у CodeMaps на себе 0 групп.
- **Шапка не налезает на переключатель языка в узком окне:** при ширине меньше 1100 px кнопки «Открыть проект», «Закрыть проект», «Настройки MCP» и «Рабочая область» показывают только иконки с подсказкой.
- **Сложность функций:** 9 функций со сложностью 11 приведены к 8 и меньше, порог `npm run quality` снижен с 15 до 10 и остаётся пустым. Тесты: 519 -> 521.

### 🇬🇧 Changes (EN)

- **Duplicate search no longer depends on the file set or file order.** Token ids used to follow first-seen order and copies within a bucket were only paired with the first one, so `find_duplicates` and `npm run duplicates` could disagree on the same project, and adding an unrelated file could hide a group. Ids are now derived from the token text, all pairs are matched, streams are sorted by file, and one short copy no longer drops its whole group. The fix uncovered 9 more hidden groups, which were removed: CodeMaps shows 0 groups on itself.
- **The title bar no longer overlaps the language switcher in a narrow window:** below 1100 px the Open project, Close project, MCP settings and Workspace buttons show only their icon, with a tooltip.
- **Function complexity:** 9 functions of complexity 11 are down to 8 or less, and the `npm run quality` threshold drops from 15 to 10 and stays empty. Tests: 519 -> 521.

### 🇨🇳 变更 (ZH)

- **重复代码检测不再依赖文件集合和顺序。** 以前令牌编号取决于首次出现的顺序，且同一桶内的副本只与第一个配对，因此 `find_duplicates` 与 `npm run duplicates` 在同一项目上可能结果不同，加入无关文件还可能让某一组消失。现在编号由令牌文本计算，所有配对都会匹配，文件流按文件排序，一个过短的副本也不再使整组被丢弃。修复后又发现并清除了 9 个隐藏的重复组：CodeMaps 对自身的结果为 0 组。
- **窄窗口中标题栏不再与语言切换器重叠：** 宽度小于 1100 px 时，“打开项目”“关闭项目”“MCP 设置”和“工作区”按钮只显示图标，并带有提示。
- **函数复杂度：** 9 个复杂度为 11 的函数降到 8 或更低，`npm run quality` 的阈值从 15 降到 10，结果仍为空。测试：519 -> 521。
