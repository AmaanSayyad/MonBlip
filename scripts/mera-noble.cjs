// Yarn 1 binds every @noble/hashes request to the global ^1.8.0 resolution, including the
// exact 2.2.0 that Mera and its @noble/curves 2.2.0 need. Mera rejects every key under 1.8.0.
const fs = require('fs');
const path = require('path');

const modules = path.join(__dirname, '..', 'node_modules');
const source = path.join(modules, '@noble', 'hashes-mera');
const mera = path.join(modules, '@category-labs', 'mera');
const target = path.join(mera, 'node_modules', '@noble', 'hashes');

if (fs.existsSync(source) && fs.existsSync(mera)) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });
}
