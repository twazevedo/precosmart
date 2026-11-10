'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig, evaluateHealth, backoffMs } = require('../guardian');

const cfg = loadConfig({ PORT: '10000', AWIN_INTERVAL_MINUTES: '3' });
const MIN = 60000;

const healthy = {
  ok: true, connected: true, qrReady: false, uptimeSec: 3600, connectedForSec: 3600,
  lastDispatchAgoSec: 120, autopilot: true, nightMode: false, queueLength: 0, rssMb: 250,
};
const run = (over = {}, ctx = {}) => evaluateHealth({
  sinceBootMs: 60 * MIN, httpFails: 0, health: { ...healthy, ...over }, disconnectedForMs: 0, ...ctx,
}, cfg);

test('config: limite de "sem envio" é no mínimo 15 min e cresce com o intervalo', () => {
  assert.equal(cfg.staleDispatchMs, 15 * MIN);
  assert.equal(loadConfig({ AWIN_INTERVAL_MINUTES: '10' }).staleDispatchMs, 50 * MIN);
});

test('bot saudável: nenhuma ação', () => {
  assert.equal(run().action, 'ok');
});

test('HTTP sem resposta: só reinicia após falhas seguidas e fora do início do boot', () => {
  const down = (httpFails, sinceBootMs) => evaluateHealth({ sinceBootMs, httpFails, health: null, disconnectedForMs: 0 }, cfg);
  assert.equal(down(2, 10 * MIN).action, 'ok');
  assert.equal(down(4, 30000).action, 'ok'); // ainda subindo
  assert.equal(down(4, 10 * MIN).action, 'restart');
});

test('processo "zumbi": conectado, mas sem enviar ofertas, reinicia', () => {
  const r = run({ lastDispatchAgoSec: 20 * 60 });
  assert.equal(r.action, 'restart');
  assert.match(r.reason, /sem enviar ofertas/);
});

test('conectado e nunca enviou desde que conectou: reinicia', () => {
  assert.equal(run({ lastDispatchAgoSec: null, connectedForSec: 20 * 60 }).action, 'restart');
});

test('recém-reconectado não é considerado parado, mesmo com último envio antigo', () => {
  assert.equal(run({ lastDispatchAgoSec: 3 * 3600, connectedForSec: 120 }).action, 'ok');
});

test('piloto automático desligado ou modo noturno: não cobra envios', () => {
  assert.equal(run({ lastDispatchAgoSec: 3 * 3600, autopilot: false }).action, 'ok');
  assert.equal(run({ lastDispatchAgoSec: 3 * 3600, nightMode: true }).action, 'ok');
});

test('WhatsApp desconectado: tolera reconexão normal, reinicia se passar do limite', () => {
  assert.equal(run({ connected: false, connectedForSec: 0 }, { disconnectedForMs: 2 * MIN }).action, 'ok');
  assert.equal(run({ connected: false, connectedForSec: 0 }, { disconnectedForMs: 7 * MIN }).action, 'restart');
});

test('deslogado (QR pendente): NÃO entra em loop de restart, só avisa', () => {
  const r = run({ connected: false, connectedForSec: 0, qrReady: true }, { disconnectedForMs: 60 * MIN });
  assert.equal(r.action, 'needs-qr');
});

test('memória acima do limite reinicia, até durante o boot', () => {
  assert.equal(run({ rssMb: 1200 }).action, 'restart');
  assert.equal(run({ rssMb: 1200 }, { sinceBootMs: 10000 }).action, 'restart');
});

test('período de carência do boot ignora desconexão', () => {
  assert.equal(run({ connected: false, connectedForSec: 0 }, { sinceBootMs: 60000, disconnectedForMs: 60 * MIN }).action, 'ok');
});

test('backoff cresce e é limitado a 2 minutos', () => {
  assert.equal(backoffMs(1), 3000);
  assert.equal(backoffMs(2), 6000);
  assert.equal(backoffMs(3), 12000);
  assert.equal(backoffMs(20), 120000);
});
