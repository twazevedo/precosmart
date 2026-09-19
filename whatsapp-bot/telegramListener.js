/**
 * @file telegramListener.js — Monitor Autônomo de Canais Telegram (Radar Awin / KaBuM)
 * Conecta via MTProto (GramJS) à conta pessoal para escutar canais fechados de afiliados
 * e repassar promoções instantaneamente para o WhatsApp com link de afiliado PreçoSmart.
 */
'use strict';

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');

let tgClient = null;
let isListening = false;

/**
 * Inicia o monitoramento de canais do Telegram
 * @param {object} params
 * @param {function} params.onDealReceived - Callback executado quando uma oferta é detectada
 * @param {function} params.logEntry - Função de log do bot
 */
async function startTelegramChannelListener({ onDealReceived, logEntry = console.log }) {
  const apiId = parseInt(process.env.TELEGRAM_API_ID || '0', 10);
  const apiHash = process.env.TELEGRAM_API_HASH || '';
  const sessionString = process.env.TELEGRAM_STRING_SESSION || '';

  if (!apiId || !apiHash || !sessionString) {
    logEntry('TG_LISTENER', 'ℹ️ Espelhamento de canais do Telegram desativado (aguardando TELEGRAM_STRING_SESSION).');
    return { isRunning: false };
  }

  try {
    logEntry('TG_LISTENER', '📡 Conectando ao Telegram para monitoramento do canal KaBuM/Awin...');
    const stringSession = new StringSession(sessionString);
    tgClient = new TelegramClient(stringSession, apiId, apiHash, {
      connectionRetries: 5,
      autoReconnect: true
    });

    await tgClient.connect();

    if (!await tgClient.isUserAuthorized()) {
      logEntry('WARN', '⚠️ Sessão do Telegram expirada ou inválida. Gere uma nova com loginTelegram.js');
      return { isRunning: false };
    }

    const me = await tgClient.getMe();
    logEntry('TG_LISTENER', `✅ Conectado ao Telegram como: ${me.firstName || 'Afiliado'} (@${me.username || me.phone})`);

    // Canais ou palavras-chave monitoradas (ex: kabum, awin)
    const keywords = (process.env.TELEGRAM_SOURCE_CHANNELS || 'kabum,awin')
      .toLowerCase()
      .split(/[,;\s]+/)
      .filter(Boolean);

    // Mapeia os canais que correspondem às palavras-chave
    const dialogs = await tgClient.getDialogs({ limit: 100 });
    const targetChatIds = new Set();
    const monitoredNames = [];

    for (const d of dialogs) {
      const title = (d.title || '').toLowerCase();
      if (keywords.some(kw => title.includes(kw))) {
        if (d.id) {
          targetChatIds.add(d.id.toString());
          monitoredNames.push(d.title);
        }
      }
    }

    logEntry('TG_LISTENER', `🎯 Canais mapeados para monitoramento (${monitoredNames.length}): ${monitoredNames.join(' • ')}`);

    // Listener de novas mensagens em tempo real
    tgClient.addEventHandler(async (event) => {
      try {
        const message = event.message;
        if (!message) return;

        const chatId = message.chatId ? message.chatId.toString() : '';
        const chat = await message.getChat().catch(() => null);
        const chatTitle = chat?.title || 'Canal Telegram';
        const titleLower = chatTitle.toLowerCase();

        // Verifica se é de um dos canais monitorados
        const isTarget = targetChatIds.has(chatId) || keywords.some(kw => titleLower.includes(kw));
        if (!isTarget) return;

        const text = (message.message || '').trim();
        if (!text && !message.media) return;

        logEntry('TG_SPY', `⚡ Nova mensagem interceptada no canal "${chatTitle}": ${text.substring(0, 50)}...`);

        // Baixa mídia (foto) se houver
        let buffer = null;
        if (message.media) {
          try {
            buffer = await tgClient.downloadMedia(message.media, {});
          } catch (mediaErr) {
            logEntry('WARN', 'Falha ao baixar imagem do Telegram: ' + mediaErr.message);
          }
        }

        if (typeof onDealReceived === 'function') {
          await onDealReceived({
            text,
            buffer,
            chatTitle,
            date: message.date
          });
        }
      } catch (handlerErr) {
        logEntry('ERROR', 'Erro no processamento do evento Telegram: ' + handlerErr.message);
      }
    }, new NewMessage({ incoming: true }));

    isListening = true;
    return { isRunning: true, client: tgClient };
  } catch (err) {
    logEntry('WARN', 'Erro ao inicializar Telegram Channel Listener: ' + err.message);
    return { isRunning: false, error: err.message };
  }
}

module.exports = {
  startTelegramChannelListener
};
