'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const bot = fs.readFileSync(path.resolve(__dirname, '../bot.js'), 'utf8');
const panel = fs.readFileSync(path.resolve(__dirname, '../../android-app/dist/index.html'), 'utf8');
const guardian = fs.readFileSync(path.resolve(__dirname, '../guardian.js'), 'utf8');
const backup = fs.readFileSync(path.resolve(__dirname, '../backup-server.js'), 'utf8');

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


test('internal supervisor health endpoint is authenticated and includes operational telemetry', () => {
  assert.match(bot, /app\\.get\\('\\/api\\/internal\\/health', requireApiAuth,/);
  const internalHealth = bot.match(/app\\.get\\('\\/api\\/internal\\/health'[\\s\\S]*?\\n\\}\\);/)?.[0] || '';
  for (const field of ['pid:', 'uptimeSec:', 'connected:', 'qrReady:', 'lastDispatchAgoSec:', 'autopilot:', 'queueLength:', 'rssMb:']) {
    assert.ok(internalHealth.includes(field), `missing internal health field: ${field}`);
  }
  assert.doesNotMatch(internalHealth, /groupJid|botUser|recentLogs|qrCodeDataUrl/);
});

test('guardian and backup supervisors use the authenticated internal health endpoint', () => {
  assert.match(guardian, /\\/api\\/internal\\/health/);
  assert.match(guardian, /x-api-key/);
  assert.match(backup, /\\/api\\/internal\\/health/);
  assert.match(backup, /x-api-key/);
});
