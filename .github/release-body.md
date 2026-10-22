# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **Инструменты Kuzu (`calculate_blast_radius_v2`, `analyze_activity_heatmap`, `analyze_pr_impact`) падали с «Kuzu background worker exited with code 3221225477».** База графа, повреждённая прежними пересекающимися сохранениями, приводила к аварийному завершению нативной библиотеки (access violation) при воспроизведении журнала, поэтому воркер умирал, не успев сообщить об ошибке, и восстановление из v1.1.44 не запускалось. Теперь воркер, умерший при старте (Windows 0xC0000005/0xC0000409, SIGSEGV/SIGABRT), тоже считается признаком повреждённого кэша: файлы откладываются в сторону и создаётся новая база. Проверено на копии базы, которая роняла воркер на машине автора.

### 🇬🇧 Changes (EN)

- **The Kuzu tools (`calculate_blast_radius_v2`, `analyze_activity_heatmap`, `analyze_pr_impact`) failed with "Kuzu background worker exited with code 3221225477".** A graph database left damaged by the earlier overlapping saves made the native library crash (access violation) while replaying its write-ahead log, so the worker died before any error could be reported and the v1.1.44 recovery never ran. A worker that dies at start-up (Windows 0xC0000005/0xC0000409, SIGSEGV/SIGABRT) is now also treated as a damaged cache: the files are moved aside and a fresh database is created. Verified against a copy of the database that crashed on the maintainer's machine.

### 🇨🇳 变更 (ZH)

- **Kuzu 工具（`calculate_blast_radius_v2`、`analyze_activity_heatmap`、`analyze_pr_impact`）报错“Kuzu background worker exited with code 3221225477”。** 先前重叠保存留下的损坏图数据库会让原生库在重放预写日志时崩溃（访问冲突），worker 在报告错误之前就已退出，因此 v1.1.44 的恢复逻辑从未运行。现在，启动时退出的 worker（Windows 0xC0000005/0xC0000409、SIGSEGV/SIGABRT）也会被视为缓存损坏：相关文件会被移到一旁并创建新数据库。已用在维护者机器上导致崩溃的数据库副本验证。
