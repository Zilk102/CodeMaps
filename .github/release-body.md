# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **Планы разбиения god-файлов.** Раньше `analyze_decomposition` отвечал только «вынести модуль», и агенту приходилось читать файл на 2400 строк, чтобы понять, где резать. Теперь он возвращает ещё и `splitPlans` для худших файлов (или для файла, переданного в новом аргументе `filePath`): объявления файла, сгруппированные в кластеры, которые держатся вместе. У каждого кластера есть предлагаемое имя файла, список символов и число строк, нужные ему общие помощники и кластеры, в которые он обращается. Вместе оказываются символы, которые вызывают друг друга или делят одно слово-тему; помощники, используемые по всему файлу, и «связующие» символы вроде таблицы маршрутов выносятся отдельно; большие таблицы данных на уровне модуля считаются символами, а `heaviest` и `coverage` показывают, когда настоящая проблема в одной огромной константе. Работает для TypeScript/JavaScript (API компилятора) и для всех языков на tree-sitter, методы называются по классу или получателю. План эвристический: он сообщает, насколько чисто файл распадается (`confidence`, `cohesion`), и прямо говорит, когда не распадается.
- **Тестовые файлы других языков не распознавались в `get_blast_radius`.** `_test.go`, `test_*.py`, `*_test.py`, `*Test.java` и `*_test.rs` теперь считаются тестами.

### 🇬🇧 Changes (EN)

- **Split plans for god files.** `analyze_decomposition` used to answer "extract a module" and nothing more, so an agent had to read a 2,400-line file to find where to cut it. It now also returns `splitPlans` for the worst files (or for the file you pass in the new `filePath` argument): the file's declarations grouped into clusters that belong together, each with a suggested file name, its symbols and line count, the shared helpers it needs and the clusters it calls into. Symbols that call each other or share a topic word end up together; helpers used all over the file and "wiring" symbols such as a route table are set aside; large module-level data tables count as symbols, and `heaviest` and `coverage` say when one huge constant is the real problem. Works for TypeScript/JavaScript (compiler API) and for every tree-sitter language, with methods qualified by their class or receiver. The plan is a heuristic: it reports how cleanly the file falls apart (`confidence`, `cohesion`) and says so when it does not.
- **Test files of other languages were not recognised in `get_blast_radius`.** `_test.go`, `test_*.py`, `*_test.py`, `*Test.java` and `*_test.rs` are now counted as tests.

### 🇨🇳 变更 (ZH)

- **god 文件的拆分方案。** 以前 `analyze_decomposition` 只会回答“提取一个模块”，智能体不得不通读 2400 行的文件才能找到下刀的位置。现在它还会为最糟糕的文件（或通过新增的 `filePath` 参数指定的文件）返回 `splitPlans`：把文件中的声明分组为应当放在一起的簇，每个簇都有建议的文件名、符号列表和行数、它需要的共享辅助函数以及它调用的其他簇。互相调用或共享主题词的符号会归为一组；被整个文件使用的辅助函数和路由表之类的“串联”符号会单独列出；模块级的大型数据表也算作符号，`heaviest` 和 `coverage` 会指出真正的问题是否只是一个巨大的常量。支持 TypeScript/JavaScript（编译器 API）和所有基于 tree-sitter 的语言，方法以所属类或接收者命名。方案是启发式的：它会报告文件拆分得有多干净（`confidence`、`cohesion`），拆不干净时也会明确说明。
- **`get_blast_radius` 无法识别其他语言的测试文件。** `_test.go`、`test_*.py`、`*_test.py`、`*Test.java` 和 `*_test.rs` 现在都会被计为测试。
