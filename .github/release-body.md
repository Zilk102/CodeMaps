# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **`setup_project` больше не переключает проект, открытый в окне.** Раньше настройка чужого проекта агентом открывала его в окне CodeMaps и заодно трогала базу, кэш, наблюдатель за файлами и список недавних проектов. Теперь для открытого проекта используется уже построенный граф, а для любого другого граф строится в памяти тем же способом, что и в CI-гарде, без записи в состояние приложения. Результат и baseline те же, что были. Проверено на живом приложении: число узлов открытого проекта до и после настройки другого проекта совпадает.
- Внутреннее хранилище анализа теперь изолировано на время одного вызова, поэтому параллельная сборка графа в памяти не влияет на открытый проект. Тесты: 888 -> 891.

### 🇬🇧 Changes (EN)

- **`setup_project` no longer switches the project open in the window.** Setting up another project used to open it in the CodeMaps window and also touch the database, the cache, the file watcher and the recent projects list. Now the already built graph is used for the open project, and for any other project the graph is built in memory the same way as in the CI guard, without writing to the app state. The result and the baseline are the same as before. Verified on the live app: the node count of the open project is identical before and after setting up another project.
- The internal analysis store is now isolated for the duration of one call, so building a graph in memory cannot affect the open project. Tests: 888 -> 891.

### 🇨🇳 变更 (ZH)

- **`setup_project` 不再切换窗口中打开的项目。** 以前配置另一个项目会让 CodeMaps 窗口打开它，并同时改动数据库、缓存、文件监视器和最近项目列表。现在对已打开的项目直接使用已构建的图，对其他项目则以与 CI 守门工具相同的方式在内存中构建图，不写入应用状态。结果和 baseline 与之前相同。已在运行中的应用上验证：配置另一个项目前后，已打开项目的节点数完全一致。
- 内部分析存储现在在单次调用期间相互隔离，因此在内存中构建图不会影响已打开的项目。测试：888 -> 891。
