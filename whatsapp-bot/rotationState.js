/**
 * @file rotationState.js — Estado PERSISTENTE da rotação de ofertas AWIN.
 * @description Guarda quais produtos/cupons já foram postados para que reinícios do bot
 * (deploy, sleep do Render) NÃO voltem ao início das listas e repitam as mesmas ofertas.
 * Usa MongoDB (MONGO_URI) quando disponível, com fallback em arquivo local (awinRotationState.json).
 */
'use strict';

const { initDatabase, createStore } = require('./db');

const STATE_ID = 'main';
const store = createStore('awinRotationState');

let state = null;
let loading = null;

function emptyState() {
  return { v: 1, counter: 0, recentBrands: [], sent: {}, cycles: {}, voucherSent: {}, isAutoPilotActive: true };
}

async function load() {
  if (state) return state;
  if (!loading) {
    loading = (async () => {
      try { await initDatabase(); } catch (e) {}
      let saved = null;
      try { saved = await store.get(STATE_ID, null); } catch (e) {}
      const valid = saved && typeof saved === 'object' && saved.v === 1 && saved.sent && typeof saved.sent === 'object';
      state = valid ? { ...emptyState(), ...saved } : emptyState();
      return state;
    })();
  }
  return loading;
}

async function save() {
  if (!state) return;
  try {
    await store.set(STATE_ID, state);
  } catch (e) {
    console.warn('[AWIN-ROTATION] Falha ao salvar estado da rotação:', e.message);
  }
}

module.exports = { load, save };
