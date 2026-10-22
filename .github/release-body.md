# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **v1.1.44 ломала воркер Kuzu в установленных сборках.** Новый модуль восстановления базы назывался `kuzuRecovery.ts` (с маленькой k), а правило `asarUnpack` — `Kuzu*.js` и различает регистр, поэтому файл остался внутри `app.asar`, где системный Node, запускающий воркер, не может его прочитать, и воркер падал с кодом 1 при старте. Теперь модуль называется `KuzuRecovery.ts`. Новый тест обходит все файлы, которые загружает воркер, и падает, если какой-то не покрыт `asarUnpack`; исправление проверено запуском воркера из настоящей упакованной сборки на копии повреждённой базы.

### 🇬🇧 Changes (EN)

- **v1.1.44 broke the Kuzu worker in installed builds.** The new database-recovery helper was named `kuzuRecovery.ts` (lower-case k) while the `asarUnpack` rule is `Kuzu*.js` and is case-sensitive, so the file stayed inside `app.asar`, where the system Node that runs the worker cannot read it, and the worker exited with code 1 at start-up. The helper is now `KuzuRecovery.ts`. A new test walks every file the worker loads and fails if one is not covered by `asarUnpack`; the fix was verified by running the worker from a real packaged build against a copy of a damaged database.

### 🇨🇳 变更 (ZH)

- **v1.1.44 在安装版中破坏了 Kuzu worker。** 新的数据库恢复模块名为 `kuzuRecovery.ts`（小写 k），而 `asarUnpack` 规则 `Kuzu*.js` 区分大小写，导致该文件留在 `app.asar` 内，运行 worker 的系统 Node 无法读取，worker 启动时以代码 1 退出。该模块现已改名为 `KuzuRecovery.ts`。新增测试会遍历 worker 加载的所有文件，如有文件未被 `asarUnpack` 覆盖就会失败；修复已通过在真实打包产物中对损坏数据库的副本运行 worker 得到验证。
