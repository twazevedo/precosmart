'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'dist');
const required = ['index.html', 'manifest.webmanifest', 'service-worker.js', 'offline.html', 'icons/icon.svg'];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) {
    console.error('Arquivo PWA ausente:', file);
    process.exitCode = 1;
  }
}
if (!process.exitCode) console.log('Arquivos básicos do PWA encontrados.');
