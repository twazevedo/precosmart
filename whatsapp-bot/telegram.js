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

/**
 * Envia uma oferta formatada com botões inline para o canal do Telegram
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
        { text: '👥 Grupo VIP WhatsApp', url: 'https://chat.whatsapp.com/Lo3ONNfAXVh5cEe2Pg6gM7' }
      ]
    ]
  };

  const caption = deal.text || ('🔥 *' + (deal.title || 'Oferta') + '*\n\n💰 Por apenas: *' + (deal.price || '') + '*\n\n🔗 ' + (deal.url || ''));

  try {
    if (deal.imageUrl) {
      const resp = await axios.post(endpoint + '/sendPhoto', {
        chat_id: TELEGRAM_CHAT_ID,
        photo: deal.imageUrl,
        caption: caption.substring(0, 1024),
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard
      }, { timeout: 10000 });
      return { ok: true, messageId: resp.data.result.message_id };
    } else {
      const resp = await axios.post(endpoint + '/sendMessage', {
        chat_id: TELEGRAM_CHAT_ID,
        text: caption.substring(0, 4096),
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard
      }, { timeout: 10000 });
      return { ok: true, messageId: resp.data.result.message_id };
    }
  } catch (err) {
    console.error('Erro ao enviar oferta para Telegram:', err.response?.data?.description || err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  isTelegramConfigured,
  broadcastTelegramDeal
};
