# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **Пути относительно корня проекта не понимались.** `analyze_decomposition` с `filePath: "internal/app/handlers.go"` возвращал пустоту, работал только абсолютный путь. Теперь `get_node_dependencies`, `get_blast_radius`, `calculate_blast_radius_v2`, `get_semantic_skeleton` и `analyze_decomposition` принимают абсолютный путь, путь относительно корня проекта (с `./` или без, с `#символ`, с любым слешем) или точный id узла. Если ссылка ничего не нашла, сообщение подсказывает, что передать.
- **`validate_architecture_changes` сообщал о клоне, не говоря где.** Свидетельства были только у пяти самых больших групп, поэтому клон из меньшей группы выглядел как голое имя файла. Теперь каждая копия каждой группы приходит с файлом и диапазоном строк и местами, где код продублирован («26 дублированных строк в admin_users.go:164-189; тот же код есть в admin_users.go:220-245»), а список клонов больше не обрезается до 15 групп.
- **Файл, который собирает граф объектов или маршруты, получал высокий fan-out.** Файл с конструктором, регистрацией или функцией настройки (`New`, `Register`, `Routes`, `Setup`, `create_app` и т. п.) по замыслу собирает другие модули, и порог fan-out для него теперь вдвое выше. Точки входа вроде `main.go` и раньше были исключены.
- **Известные ограничения.** Поиск клонов находит код, совпадающий с точностью до имён, чисел и строк. Блоки, которые скопировали и потом изменили (другое число операторов, лишняя ветка), не показываются.

### 🇬🇧 Changes (EN)

- **Paths relative to the project root were not understood.** `analyze_decomposition` with `filePath: "internal/app/handlers.go"` returned nothing and only an absolute path worked. `get_node_dependencies`, `get_blast_radius`, `calculate_blast_radius_v2`, `get_semantic_skeleton` and `analyze_decomposition` now accept an absolute path, a path relative to the project root (with or without `./`, with a `#symbol`, with either slash) or the exact node id. A reference that matches nothing now says what to pass.
- **`validate_architecture_changes` reported a clone without saying where.** Only the five biggest groups carried evidence, so a clone in a smaller group showed up as a bare file name. Every copy of every group now comes with its file and line range and the places it is duplicated at ("26 duplicated lines at admin_users.go:164-189; the same code is also at admin_users.go:220-245"), and the clone list is no longer cut to 15 groups.
- **A file that builds the object graph or the routes was flagged for high fan-out.** A file that declares a constructor, registration or setup function (`New`, `Register`, `Routes`, `Setup`, `create_app`, ...) composes other modules by design and now gets twice the fan-out threshold. Entry points such as `main.go` were already exempt.
- **Known limits.** Clone detection finds code that is the same up to names, numbers and strings. Blocks that were copied and then edited (a different number of statements, an extra branch) are not reported.

### 🇨🇳 变更 (ZH)

- **相对于项目根目录的路径无法识别。** 使用 `filePath: "internal/app/handlers.go"` 调用 `analyze_decomposition` 会返回空结果，只有绝对路径有效。现在 `get_node_dependencies`、`get_blast_radius`、`calculate_blast_radius_v2`、`get_semantic_skeleton` 和 `analyze_decomposition` 接受绝对路径、相对于项目根目录的路径（可带或不带 `./`，可带 `#符号`，斜杠方向不限）或确切的节点 id。引用无法匹配时，提示信息会说明应传入什么。
- **`validate_architecture_changes` 报告了克隆却没说明位置。** 只有最大的五组带有证据，所以较小一组中的克隆只显示为一个文件名。现在每组的每个副本都带有文件、行号范围以及重复出现的位置（“admin_users.go:164-189 有 26 行重复；相同代码还在 admin_users.go:220-245”），克隆列表也不再被截断为 15 组。
- **负责组装对象图或路由的文件被判为高扇出。** 声明了构造、注册或初始化函数（`New`、`Register`、`Routes`、`Setup`、`create_app` 等）的文件，按设计本就会组合其他模块，其扇出阈值现在提高一倍。`main.go` 之类的入口此前已被豁免。
- **已知限制。** 克隆检测只能找到在名称、数字和字符串之外完全相同的代码。复制后又被修改的代码块（语句数量不同、多出一个分支）不会被报告。
