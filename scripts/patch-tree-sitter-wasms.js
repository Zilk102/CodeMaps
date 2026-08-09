/**
 * tree-sitter-wasms@0.1.13 ships a self-dependency:
 *   "dependencies": { "tree-sitter-wasms": "^0.1.11" }
 *
 * electron-builder 26's node-module collector treats that as an unbounded
 * cycle and OOMs while "searching for node modules". Strip the self-edge
 * after install so packaging can finish. Upstream fix:
 * https://github.com/electron-userland/electron-builder/pull/10070
 */
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'node_modules', 'tree-sitter-wasms', 'package.json');

if (!fs.existsSync(pkgPath)) {
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const deps = pkg.dependencies;
if (!deps || !Object.prototype.hasOwnProperty.call(deps, 'tree-sitter-wasms')) {
  process.exit(0);
}

delete deps['tree-sitter-wasms'];
if (Object.keys(deps).length === 0) {
  delete pkg.dependencies;
} else {
  pkg.dependencies = deps;
}

fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log('Patched tree-sitter-wasms: removed self-dependency');
