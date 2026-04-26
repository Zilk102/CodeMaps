const fs = require('fs');
const { globSync } = require('fast-glob');

const files = globSync('electron/**/*.ts', { absolute: true });
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('console.log') || content.includes('console.error') || content.includes('console.warn')) {
    if (!content.includes('electron-log/main')) {
      content = "import log from 'electron-log/main';\n" + content;
    }
    content = content.replace(/console\.log/g, 'log.info');
    content = content.replace(/console\.error/g, 'log.error');
    content = content.replace(/console\.warn/g, 'log.warn');
    fs.writeFileSync(file, content);
    console.log('Updated ' + file);
  }
});
