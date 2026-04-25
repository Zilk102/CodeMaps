const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const targets = ['dist-renderer', 'dist-electron', 'release'];

for (const target of targets) {
  const resolvedPath = path.join(projectRoot, target);
  if (fs.existsSync(resolvedPath)) {
    fs.rmSync(resolvedPath, { recursive: true, force: true });
    console.log(`Removed ${resolvedPath}`);
  }
}
