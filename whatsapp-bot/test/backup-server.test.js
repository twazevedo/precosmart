'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackupConfig, evaluateClusterState } = require('../backup-server');

const cfg = loadBackupConfig({
  PORT: '10000',
  BACKUP_PORT: '10001',
  BACKUP_FAILOVER_THRESHOLD: '3',
  BACKUP_MAX_DISCONNECTED_SEC: '180',
  BACKUP_AUTO_FAILBACK: 'false',
});

test('config: carrega portas padrão e limites corretos', () => {
  assert.equal(cfg.primaryPort, 10000);
  assert.equal(cfg.backupPort, 10001);
  assert.equal(cfg.failoverThreshold, 3);
  assert.equal(cfg.maxDisconnectedSec, 180);
  assert.equal(cfg.autoFailback, false);
});

test('standby com primário saudável: permanece em STANDBY', () => {
  const result = evaluateClusterState(
    {
      role: 'STANDBY',
      primaryFails: 0,
      primaryHealth: { ok: true, connected: true, disconnectedForSec: 0 },
      consecutiveSuccesses: 10,
      manualOverride: null,
    },
    cfg
  );
  assert.equal(result.nextRole, 'STANDBY');
  assert.equal(result.action, 'stay');
});

test('standby com falhas abaixo do limite: tolera oscilação temporária', () => {
  const result = evaluateClusterState(
    {
      role: 'STANDBY',
      primaryFails: 2, // limite é 3
      primaryHealth: null,
      consecutiveSuccesses: 0,
      manualOverride: null,
    },
    cfg
  );
  assert.equal(result.nextRole, 'STANDBY');
  assert.equal(result.action, 'stay');
});

test('standby atinge limite de falhas: aciona failover e assume ACTIVE', () => {
  const result = evaluateClusterState(
    {
      role: 'STANDBY',
      primaryFails: 3,
      primaryHealth: null,
      consecutiveSuccesses: 0,
      manualOverride: null,
    },
    cfg
  );
  assert.equal(result.nextRole, 'ACTIVE');
  assert.equal(result.action, 'promote');
  assert.match(result.reason, /Servidor primário inativo/);
});

test('standby detecta WhatsApp desconectado por tempo excessivo no primário: assume ACTIVE', () => {
  const result = evaluateClusterState(
    {
      role: 'STANDBY',
      primaryFails: 0,
      primaryHealth: { ok: true, connected: false, disconnectedForSec: 250 }, // limite é 180
      consecutiveSuccesses: 1,
      manualOverride: null,
    },
    cfg
  );
  assert.equal(result.nextRole, 'ACTIVE');
  assert.equal(result.action, 'promote');
  assert.match(result.reason, /WhatsApp no servidor primário desconectado/);
});

test('comando manual de force-failover: promove imediatamente a ACTIVE', () => {
  const result = evaluateClusterState(
    {
      role: 'STANDBY',
      primaryFails: 0,
      primaryHealth: { ok: true, connected: true },
      consecutiveSuccesses: 10,
      manualOverride: 'force-failover',
    },
    cfg
  );
  assert.equal(result.nextRole, 'ACTIVE');
  assert.equal(result.action, 'promote');
});

test('comando manual de force-standby: retorna imediatamente a STANDBY', () => {
  const result = evaluateClusterState(
    {
      role: 'ACTIVE',
      primaryFails: 0,
      primaryHealth: { ok: true, connected: true },
      consecutiveSuccesses: 10,
      manualOverride: 'force-standby',
    },
    cfg
  );
  assert.equal(result.nextRole, 'STANDBY');
  assert.equal(result.action, 'demote');
});

test('modo ACTIVE sem auto-failback: continua ativo para evitar instabilidade', () => {
  const result = evaluateClusterState(
    {
      role: 'ACTIVE',
      primaryFails: 0,
      primaryHealth: { ok: true, connected: true },
      consecutiveSuccesses: 5,
      manualOverride: null,
    },
    cfg
  );
  assert.equal(result.nextRole, 'ACTIVE');
  assert.equal(result.action, 'stay');
});

test('modo ACTIVE com auto-failback ativado: retorna a STANDBY quando primário recupera', () => {
  const autoCfg = Object.assign({}, cfg, { autoFailback: true, recoveryThreshold: 4 });
  const result = evaluateClusterState(
    {
      role: 'ACTIVE',
      primaryFails: 0,
      primaryHealth: { ok: true, connected: true },
      consecutiveSuccesses: 4,
      manualOverride: null,
    },
    autoCfg
  );
  assert.equal(result.nextRole, 'STANDBY');
  assert.equal(result.action, 'demote');
  assert.match(result.reason, /Servidor primário restabelecido/);
});
