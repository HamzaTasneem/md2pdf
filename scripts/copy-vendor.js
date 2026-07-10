const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const vendor = path.join(root, 'src', 'vendor');
fs.mkdirSync(vendor, { recursive: true });

fs.copyFileSync(
  path.join(root, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'),
  path.join(vendor, 'mermaid.min.js')
);
fs.copyFileSync(
  path.join(root, 'node_modules', 'highlight.js', 'styles', 'github.css'),
  path.join(vendor, 'hljs.css')
);
console.log('vendor assets copied');
