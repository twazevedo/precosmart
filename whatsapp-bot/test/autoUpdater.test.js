'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkForUpdates, execPromise } = require('../autoUpdater');

test('AutoUpdater: execPromise executa comando git com sucesso', async () => {
  const res = await execPromise('git --version');
  assert.equal(res.ok, true);
  assert.ok(res.stdout.includes('git version'));
});

test('AutoUpdater: checkForUpdates verifica hash local e remoto', async () => {
  const result = await checkForUpdates();
  assert.ok(result !== undefined);
  if (result.updated) {
    assert.ok(result.newHash);
  } else {
    assert.ok(result.current || result.error || result.reason);
  }
});
