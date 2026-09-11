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
        // Foto falhou (link inválido ou timeout do Telegram). Prossegue para envio de texto.
        console.warn('[TELEGRAM] Falha ao enviar foto, tentando texto:', photoErr2.response?.data?.description || photoErr2.message);
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
    // Fallback final: envia texto sem formatação caso Markdown tenha quebrado
    try {
      const resp = await axios.post(endpoint + '/sendMessage', {
        chat_id: TELEGRAM_CHAT_ID,
        text: caption.substring(0, 4096),
        reply_markup: inlineKeyboard
      }, { timeout: 10000 });
      return { ok: true, messageId: resp.data.result?.message_id };
    } catch (finalErr) {
      console.error('[TELEGRAM] Erro crítico ao enviar mensagem:', finalErr.response?.data?.description || finalErr.message);
      return { ok: false, error: finalErr.message };
    }
  }
}

module.exports = {
  isTelegramConfigured,
  broadcastTelegramDeal
};
