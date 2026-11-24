'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const botSource = fs.readFileSync(path.join(__dirname, '../bot.js'), 'utf8');

test('pause endpoint preserves pending offers instead of clearing the queue', () => {
  const pauseStart = botSource.indexOf("app.all(['/api/pause']");
  const resumeStart = botSource.indexOf("app.all(['/api/resume']", pauseStart);
  assert.notEqual(pauseStart, -1);
  assert.notEqual(resumeStart, -1);
  const pauseHandler = botSource.slice(pauseStart, resumeStart);
  assert.match(pauseHandler, /isAutoPilotActive = false/);
  assert.doesNotMatch(pauseHandler, /dealQueue\.length\s*=\s*0/);
  assert.match(pauseHandler, /queueLength:\s*dealQueue\.length/);
});

test('resume endpoint restarts the queue worker', () => {
  const resumeStart = botSource.indexOf("app.all(['/api/resume']");
  const statusStart = botSource.indexOf("app.get('/api/autopilot-status'", resumeStart);
  const resumeHandler = botSource.slice(resumeStart, statusStart);
  assert.match(resumeHandler, /isAutoPilotActive = true/);
  assert.match(resumeHandler, /triggerDealQueueWorker\(\)/);
});

test('queue worker checks autopilot state before taking more work', () => {
  assert.match(botSource, /while\s*\(dealQueue\.length\s*>\s*0\s*&&\s*isAutoPilotActive\)/);
});

test('failed delivery is not logged as a successful publication', () => {
  assert.match(botSource, /successfulTargets === 0[\s\S]{0,500}dealQueue\.unshift\(deal\)/);
  assert.match(botSource, /Oferta enviada para \$\{successfulTargets\} de \$\{jidsToSend\.length\}/);
});
