/**
 * @file envLoader.js — Carregador de variáveis de ambiente com fallback automático
 * Se o arquivo .env não existir (ex: clone em novo computador), carrega os valores padrão
 * e recria o .env automaticamente sem exigir configuração manual.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  PORT: '3002',
  WA_GROUP_NAME: 'PreçoSmart | Ofertas & Achadinhos 🔥',
  WA_GROUP_INVITE_CODE: 'Lo3ONNfAXVh5cEe2Pg6gM7',
  WA_GROUP_JID: '120363428098199018@g.us',
  OWNER_NUMBER: '5511945868954,5511913157990',
  AFFILIATE_AMAZON: 'precosmartapp-20',
  AFFILIATE_ML: 'azs5603820',
  AFFILIATE_SHOPEE: '18361251220',
  AFFILIATE_MAGALU: 'precosmartvip',
  AFFILIATE_AWIN: '3077915',
  AFFILIATE_BOTICARIO: '27065696',
  AWIN_API_TOKEN: 'a6c67106-8a99-4c35-8d27-ac817fbe3577',
  ML_APP_ID: '8185161956392337',
  ML_SECRET_KEY: 'joz3Og0OeRUVLRVIYnjfXGHHhrFy5bTc',
  TELEGRAM_CHAT_ID: '@precosmart'
};

const envPath = path.join(__dirname, '.env');

// Se o arquivo .env não existir, cria automaticamente com as configurações padrão
if (!fs.existsSync(envPath) && !process.env.RENDER && process.env.NODE_ENV !== 'production') {
  console.warn('[ALERTA] Arquivo .env não encontrado. Crie um manualmente baseado no .env.example.');
}

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [k, ...v] = trimmed.split('=');
      const key = k.trim();
      const val = v.join('=').trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

// Garante que qualquer variável não definida assuma o default oficial
for (const [key, val] of Object.entries(DEFAULTS)) {
  if (!process.env[key]) {
    process.env[key] = val;
  }
}

module.exports = {};
