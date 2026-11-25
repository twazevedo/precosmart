'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('initDB never deletes existing products, stores or quotes when a seed store is missing', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'precosmart-db-'));
  const databasePath = path.join(tempDir, 'test.sqlite');
  const script = `
    import { db, initDB } from ${JSON.stringify(path.join(projectRoot, 'src/db.js')) .replace(/\\\\/g, '/')};
    initDB();
    db.prepare("DELETE FROM stores WHERE name = 'Shopee'").run();
    const before = {
      stores: db.prepare('SELECT COUNT(*) AS n FROM stores').get().n,
      products: db.prepare('SELECT COUNT(*) AS n FROM products').get().n,
      quotes: db.prepare('SELECT COUNT(*) AS n FROM price_quotes').get().n
    };
    initDB();
    const after = {
      stores: db.prepare('SELECT COUNT(*) AS n FROM stores').get().n,
      products: db.prepare('SELECT COUNT(*) AS n FROM products').get().n,
      quotes: db.prepare('SELECT COUNT(*) AS n FROM price_quotes').get().n
    };
    console.log(JSON.stringify({ before, after }));
    db.close();
  `;

  try {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: { ...process.env, PRECOSMART_DB_PATH: databasePath }
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const outputLine = result.stdout.trim().split('\n').at(-1);
    const { before, after } = JSON.parse(outputLine);
    assert.deepEqual(after, before, 'second initialization must preserve every existing row');
    assert.equal(after.stores, 4);
    assert.equal(after.products, 8);
    assert.ok(after.quotes > 0);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
