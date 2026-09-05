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
  WA_GROUP_NAME: 'PreçoSmart Ofertas 🔥',
  WA_GROUP_INVITE_CODE: 'Lo3ONNfAXVh5cEe2Pg6gM7',
  WA_GROUP_JID: '120363428098199018@g.us',
  INSTAGRAM_WEBHOOK_URL: 'https://hook.us2.make.com/m4ofe3ag7teo1y5r6qgmxcl7y2igs2le',
  AFFILIATE_AMAZON: 'precosmartapp-20',
  AFFILIATE_ML: 'azs5603820',
  AFFILIATE_SHOPEE: '18361251220',
  AFFILIATE_MAGALU: 'precosmartvip',
  OWNER_NUMBER: '5511945868954,5511913157990'
};

const envPath = path.join(__dirname, '.env');

// Se o arquivo .env não existir, cria automaticamente com as configurações padrão
if (!fs.existsSync(envPath)) {
  try {
    const defaultLines = Object.entries(DEFAULTS).map(([k, v]) => `${k}=${v}`).join('\n');
    fs.writeFileSync(envPath, defaultLines + '\n', 'utf8');
  } catch (e) {}
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
