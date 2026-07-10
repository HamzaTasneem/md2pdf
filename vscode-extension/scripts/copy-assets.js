const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const assets = path.join(root, 'assets');
fs.mkdirSync(assets, { recursive: true });

fs.copyFileSync(
  path.join(root, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'),
  path.join(assets, 'mermaid.min.js')
);
fs.copyFileSync(
  path.join(root, 'node_modules', 'highlight.js', 'styles', 'github.css'),
  path.join(assets, 'hljs.css')
);
console.log('extension assets copied');
