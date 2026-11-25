'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dist = path.resolve(__dirname, '..', 'dist');
const read = (name) => fs.readFileSync(path.join(dist, name), 'utf8');

test('manifest declares the PreçoSmart standalone application', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.name, 'PreçoSmart Admin');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon) => icon.src === '/icons/icon.svg'));
});

test('main page links manifest and registers service worker only on HTTPS', () => {
  const html = read('index.html');
  assert.match(html, /rel="manifest"/);
  assert.match(html, /serviceWorker\.register\('\/service-worker\.js'\)/);
  assert.match(html, /location\.protocol === 'https:'/);
});

test('service worker does not intercept API or cross-origin requests', () => {
  const worker = read('service-worker.js');
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(worker, /request\.method !== 'GET'/);
  assert.doesNotMatch(worker, /caches\.open\([^)]*api/i);
});

test('offline fallback does not claim that administrative actions succeeded', () => {
  const offline = read('offline.html');
  assert.match(offline, /sem conexão/i);
  assert.match(offline, /não executa comandos/i);
});
