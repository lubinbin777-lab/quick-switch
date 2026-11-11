import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extension = path.join(root, 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.commands['toggle-palette'].suggested_key.mac, 'Command+E');
assert.equal(manifest.incognito, 'not_allowed');
assert.equal(manifest.host_permissions, undefined);
assert.equal(manifest.action, undefined, '不应声明 action，否则快捷键页会多出「激活该扩展程序」');
for (const file of [manifest.background.service_worker, 'popup.html', ...Object.values(manifest.icons), 'palette.js', 'content.js', 'core.mjs', 'service.mjs', 'popup.js', 'popup.css', 'overlay.html', 'overlay.js', 'overlay.css', 'frame-sessions.mjs']) {
  assert.ok(fs.existsSync(path.join(extension, file)), `Missing extension file: ${file}`);
}
const files = fs.readdirSync(extension).filter(file => /\.(m?js)$/.test(file));
for (const file of files) {
  const check = spawnSync(process.execPath, ['--check', path.join(extension, file)], { encoding: 'utf8' });
  assert.equal(check.status, 0, `${file}: ${check.stderr}`);
}
console.log(`Manifest、${files.length} 个 JS 文件及资源路径检查通过。`);
