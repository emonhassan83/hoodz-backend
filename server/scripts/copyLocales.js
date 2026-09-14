const fs = require('node:fs');
const path = require('node:path');

const source = path.join(process.cwd(), 'src', 'app', 'locales');
const target = path.join(process.cwd(), 'dist', 'app', 'locales');

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.cpSync(source, target, { recursive: true });

console.log('Locale files copied successfully.');
