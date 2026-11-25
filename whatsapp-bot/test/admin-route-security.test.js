'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const bot = fs.readFileSync(path.resolve(__dirname, '../bot.js'), 'utf8');
const panel = fs.readFileSync(path.resolve(__dirname, '../../android-app/dist/index.html'), 'utf8');

test('public health endpoint exposes only a minimal liveness response', () => {
  assert.match(bot, /app\.get\('\/api\/health', \(req, res\) => res\.json\(\{ ok: true \}\)\)/);
  const healthRoute = bot.match(/app\.get\('\/api\/health'[\s\S]*?\);/)?.[0] || '';
  assert.doesNotMatch(healthRoute, /pid:|groupJid|queueLength|rssMb|qrReady/);
});

test('operational status and analytics endpoints require API authentication', () => {
  assert.match(bot, /app\.get\('\/api\/status', requireApiAuth,/);
  assert.match(bot, /app\.get\('\/api\/analytics', requireApiAuth,/);
});

test('existing admin panel sends its in-memory key when reading status', () => {
  assert.match(panel, /x-api-key': apiKey/);
});
