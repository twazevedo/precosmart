/**
 * @file telegram.js — Módulo do Telegram (Desativado / Removido)
 * Todas as operações do Telegram foram removidas a pedido do usuário.
 * O PreçoSmart opera exclusivamente focado no WhatsApp.
 */
'use strict';

function isTelegramConfigured() {
  return false;
}

async function broadcastTelegramDeal() {
  return { ok: true, disabled: true };
}

async function notifyAdmin() {
  return { ok: true, disabled: true };
}

module.exports = {
  isTelegramConfigured,
  broadcastTelegramDeal,
  notifyAdmin
};
