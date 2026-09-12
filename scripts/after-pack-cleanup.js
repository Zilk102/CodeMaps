const fs = require('fs/promises');
const path = require('path');

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function removeIfPresent(targetPath) {
  if (!(await pathExists(targetPath))) {
    return false;
  }

  await fs.rm(targetPath, { recursive: true, force: true });
  return true;
}

exports.default = async function afterPack(context) {
  const kuzuRoot = path.join(
    context.appOutDir,
    'resources',
    'app.asar.unpacked',
    'node_modules',
    'kuzu'
  );
  const nativeModulePath = path.join(kuzuRoot, 'kuzujs.node');
  const cleanupTargets = [
    path.join(kuzuRoot, 'kuzu-source'),
    path.join(kuzuRoot, 'node_modules', '.bin'),
  ];

  if (!(await pathExists(nativeModulePath))) {
    throw new Error(`[afterPack] Missing Kuzu native module: ${nativeModulePath}`);
  }

  const removedTargets = [];
  for (const targetPath of cleanupTargets) {
    if (await removeIfPresent(targetPath)) {
      removedTargets.push(targetPath);
    }
  }

  for (const targetPath of cleanupTargets) {
    if (await pathExists(targetPath)) {
      throw new Error(`[afterPack] Failed to remove packaged Kuzu artifact: ${targetPath}`);
    }
  }

  if (removedTargets.length > 0) {
    console.log(`[afterPack] Removed packaged Kuzu build artifacts:\n${removedTargets.join('\n')}`);
  } else {
    console.log('[afterPack] No packaged Kuzu build artifacts needed cleanup');
  }
};
