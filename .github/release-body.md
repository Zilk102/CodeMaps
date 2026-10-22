# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **Инструменты Kuzu продолжали падать после v1.1.43 там, где база уже была повреждена.** Перекрывающиеся сохранения, исправленные в v1.1.43, оставили в журнале записи базы (WAL) дубликаты строк, поэтому базу нельзя было даже открыть («Found duplicated primary key»), и падали `calculate_blast_radius_v2`, `analyze_activity_heatmap`, `analyze_pr_impact` и сохранение графа. Поскольку база — лишь кэш проанализированного графа, CodeMaps теперь заменяет базу, которую невозможно открыть из-за повреждения: файлы откладываются в сторону (хранится только последний комплект) и создаётся новая база. Блокировка другим процессом повреждением не считается. Проверено на копии реальной повреждённой базы.

### 🇬🇧 Changes (EN)

- **The Kuzu tools kept failing after v1.1.43 on machines where the database was already damaged.** The overlapping saves fixed in v1.1.43 had left duplicate rows in the database's write-ahead log (WAL), so the database could not even be opened ("Found duplicated primary key") and `calculate_blast_radius_v2`, `analyze_activity_heatmap`, `analyze_pr_impact` and graph persistence all failed. Because the database is only a cache of the analysed graph, CodeMaps now replaces a database that cannot be opened because it is damaged: the files are moved aside (only the latest set is kept) and a fresh database is created. A lock held by another process is never treated as damage. Verified against a copy of a real damaged database.

### 🇨🇳 变更 (ZH)

- **在数据库已损坏的机器上，v1.1.43 之后 Kuzu 工具仍然失败。** v1.1.43 中修复的重叠保存已在数据库的预写日志（WAL）中留下重复行，导致数据库甚至无法打开（“Found duplicated primary key”），`calculate_blast_radius_v2`、`analyze_activity_heatmap`、`analyze_pr_impact` 和图持久化全部失败。由于数据库只是已分析图的缓存，CodeMaps 现在会替换因损坏而无法打开的数据库：把文件移到一旁（只保留最新一组）并创建新的数据库。被其他进程占用的锁不会被视为损坏。已在真实损坏数据库的副本上验证。
