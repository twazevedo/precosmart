/**
 * @file telegram.js — Canal de Ofertas PreçoSmart no Telegram (Multicanal)
 */
'use strict';

const axios = require('axios');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID || '';

function isTelegramConfigured() {
  return Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
}

function sanitizeError(err) {
  if (!err) return '';
  const desc = err.response?.data?.description || err.message || '';
  return String(desc).replace(/bot[0-9]+:[a-zA-Z0-9_-]+/g, 'bot[REDACTED]');
}

/**
 * Envia uma oferta formatada com botões inline para o canal do Telegram.
 * Possui múltiplos fallbacks contra erros de Markdown e links de imagens externos.
 * @param {object} deal - { title, price, oldPrice, url, imageUrl, text, badge }
 */
async function broadcastTelegramDeal(deal) {
  if (!isTelegramConfigured()) {
    return { ok: true, simulated: true, reason: 'TELEGRAM_BOT_TOKEN não configurado' };
  }

  const endpoint = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN;
  
  let targetUrl = deal.url;
  if (!targetUrl && deal.text) {
    const linkMatch = deal.text.match(/https?:\/\/[^\s]+/);
    if (linkMatch) targetUrl = linkMatch[0];
  }

  // Botões inline para cliques diretos no Telegram
  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: '🛒 Comprar com Desconto', url: targetUrl || 'https://precosmart.com.br' }
      ],
      [
        { text: '🌐 Ver no PreçoSmart', url: 'https://precosmart.com.br' },
        { text: '👥 Grupo VIP WhatsApp', url: process.env.WA_GROUP_INVITE_CODE ? `https://chat.whatsapp.com/${process.env.WA_GROUP_INVITE_CODE}` : 'https://precosmart.com.br' }
      ]
    ]
  };

  const caption = deal.text || ('🔥 *' + (deal.title || 'Oferta') + '*\n\n💰 Por apenas: *' + (deal.price || '') + '*\n\n🔗 ' + (deal.url || ''));

  // 1. Tenta envio com foto (se fornecida)
  if (deal.imageUrl) {
    try {
      const resp = await axios.post(endpoint + '/sendPhoto', {
        chat_id: TELEGRAM_CHAT_ID,
        photo: deal.imageUrl,
        caption: caption.substring(0, 1024),
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard
      }, { timeout: 10000 });
      return { ok: true, messageId: resp.data.result?.message_id };
    } catch (photoErr) {
      if (photoErr.response?.status === 429) {
        console.warn('[TELEGRAM] Rate limit (429) atingido. Aguardando próximo ciclo.');
        return { ok: false, error: 'Rate limit (429)' };
      }
      // Se falhou com Markdown, tenta sem Markdown
      try {
        const resp = await axios.post(endpoint + '/sendPhoto', {
          chat_id: TELEGRAM_CHAT_ID,
          photo: deal.imageUrl,
          caption: caption.substring(0, 1024),
          reply_markup: inlineKeyboard
        }, { timeout: 10000 });
        return { ok: true, messageId: resp.data.result?.message_id };
      } catch (photoErr2) {
        if (photoErr2.response?.status === 429) {
          return { ok: false, error: 'Rate limit (429)' };
        }
        console.warn('[TELEGRAM] Falha ao enviar foto, tentando texto:', sanitizeError(photoErr2));
      }
    }
  }

  // 2. Envio de texto (com fallback garantido)
  try {
    const resp = await axios.post(endpoint + '/sendMessage', {
      chat_id: TELEGRAM_CHAT_ID,
      text: caption.substring(0, 4096),
      parse_mode: 'Markdown',
      reply_markup: inlineKeyboard
    }, { timeout: 10000 });
    return { ok: true, messageId: resp.data.result?.message_id };
  } catch (textErr) {
    if (textErr.response?.status === 429) {
      return { ok: false, error: 'Rate limit (429)' };
    }
    // Fallback final: envia texto sem formatação caso Markdown tenha quebrado
    try {
      const resp = await axios.post(endpoint + '/sendMessage', {
        chat_id: TELEGRAM_CHAT_ID,
        text: caption.substring(0, 4096),
        reply_markup: inlineKeyboard
      }, { timeout: 10000 });
      return { ok: true, messageId: resp.data.result?.message_id };
    } catch (finalErr) {
      console.error('[TELEGRAM] Erro crítico ao enviar mensagem:', sanitizeError(finalErr));
      return { ok: false, error: sanitizeError(finalErr) };
    }
  }
}

/**
 * Envia notificação privada ao administrador via Telegram
 * Requer TELEGRAM_ADMIN_CHAT_ID no .env (separado do canal público)
 */
async function notifyAdmin(eventType, message, extra = {}) {
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!TELEGRAM_BOT_TOKEN || !adminChatId) return { ok: false, reason: 'Admin chat ID não configurado' };

  const icons = {
    CONNECTED: '🟢',
    DISCONNECTED: '🔴',
    DEAL_SENT: '📦',
    ERROR: '🚨',
    DAILY_REPORT: '📊',
    QR_READY: '📱',
    WARNING: '⚠️'
  };

  const icon = icons[eventType] || '🔔';
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const text = `${icon} *[${eventType}] PreçoSmart*\n⏰ ${now}\n\n${message}${
    extra.uptime ? `\n⏱️ Uptime: ${extra.uptime}h` : ''
  }${
    extra.queue ? `\n📥 Fila: ${extra.queue} itens` : ''
  }`;

  try {
    const endpoint = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN;
    const resp = await axios.post(endpoint + '/sendMessage', {
      chat_id: adminChatId,
      text: text.substring(0, 4096),
      parse_mode: 'Markdown'
    }, { timeout: 8000 });
    return { ok: true, messageId: resp.data.result?.message_id };
  } catch (err) {
    console.error('[TELEGRAM ADMIN]', err.response?.data?.description || err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  isTelegramConfigured,
  broadcastTelegramDeal,
  notifyAdmin
};
