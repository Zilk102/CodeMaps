import fs from 'node:fs';
import path from 'node:path';

const version = process.argv[2]?.trim();

if (!version) {
  console.error('Usage: node scripts/generate-release-body.mjs <version>');
  process.exit(1);
}

const repoRoot = process.cwd();
const templatePath = path.join(repoRoot, '.github', 'release-body.md');
const outputPath = path.join(repoRoot, '.github', 'release-body.generated.md');

const template = fs.readFileSync(templatePath, 'utf8');
const output = template.replaceAll('{{VERSION}}', version);

fs.writeFileSync(outputPath, output, 'utf8');
console.log(`Generated release body for v${version}: ${outputPath}`);
