/**
 * @file boticario.js — Comando !boticario
 */
'use strict';

const { PRODUCTS } = require('../catalog');
const { buildOfferMessage } = require('../formatter');

module.exports = {
  name: '!boticario',
  aliases: ['!oboticario', '!eudora'],
  description: 'Dispara 1 oferta com foto oficial do Grupo Boticário / Eudora',
  adminOnly: true,
  async execute({ isGroup, replyToUser, sendProductMessage, logEntry }) {
    const boticarioProducts = PRODUCTS.filter(p => 
      p.quotes.some(q => q.store === 'O Boticário' || q.store === 'Boticário' || q.store === 'Eudora')
    );
    if (boticarioProducts.length === 0) {
      await replyToUser({ text: '⚠️ Nenhuma oferta do Grupo Boticário disponível no momento.' });
      return;
    }
    const p = boticarioProducts[Math.floor(Math.random() * boticarioProducts.length)];
    const caption = buildOfferMessage(p);
    await sendProductMessage(p, caption);
    if (!isGroup) await replyToUser({ text: '🌸 *Oferta do Grupo Boticário Enviada:* ' + p.title });
    logEntry('ADMIN', 'Comando !boticario executado com sucesso: ' + p.title);
  }
};