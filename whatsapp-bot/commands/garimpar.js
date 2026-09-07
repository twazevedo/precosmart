/**
 * @file garimpar.js — Comando !garimpar / !garimpeiros
 * Coleta as melhores promoções de todas as categorias do portal Garimpeiros.com.br
 * e posta no grupo VIP do WhatsApp com os links tratados.
 */
'use strict';

const { fetchAllGarimpeirosDeals } = require('../garimpeirosCrawler');
const { processMessageText } = require('../mirror');

module.exports = {
  name: '!garimpar',
  aliases: ['!garimpeiros', '!achadinhos'],
  description: 'Extrai promoções de todas as categorias do Garimpeiros e enfileira no grupo VIP',
  adminOnly: true,
  async execute({ waSocket, groupJid, replyToUser, logEntry }) {
    await replyToUser({ text: '⛏️ *Iniciando Garimpo...* Extraindo as melhores promoções de todas as categorias do Garimpeiros.com.br!' });
    logEntry('GARIMPO', 'Iniciando extração do portal Garimpeiros.com.br');

    try {
      const deals = await fetchAllGarimpeirosDeals(3);
      if (deals.length === 0) {
        return replyToUser({ text: '⚠️ Nenhuma promoção nova encontrada no portal no momento.' });
      }

      const targetJid = process.env.WA_GROUP_JID || groupJid;
      let postedCount = 0;

      // Dispara as primeiras 5 melhores ofertas imediatamente com imagens
      for (const deal of deals.slice(0, 5)) {
        try {
          if (deal.imageUrl) {
            await waSocket.sendMessage(targetJid, {
              image: { url: deal.imageUrl },
              caption: deal.formattedText
            });
          } else {
            await waSocket.sendMessage(targetJid, { text: deal.formattedText });
          }
          postedCount++;
          // Delay de 2.5 segundos entre mensagens para evitar bloqueio
          await new Promise(r => setTimeout(r, 2500));
        } catch (err) {
          logEntry('WARN', 'Falha ao postar oferta do garimpo: ' + err.message);
        }
      }

      await replyToUser({
        text: `✅ *Garimpo Concluído!* ${postedCount} promoções de alta conversão foram disparadas no Grupo VIP!`
      });
      logEntry('GARIMPO', `${postedCount} ofertas do Garimpeiros enviadas para ${targetJid}`);
    } catch (err) {
      logEntry('ERROR', 'Erro no comando !garimpar: ' + err.message);
      await replyToUser({ text: '❌ Erro ao garimpar ofertas: ' + err.message });
    }
  }
};
