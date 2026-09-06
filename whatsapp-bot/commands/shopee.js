/**
 * @file shopee.js — Comando !shopee
 */
'use strict';

const { PRODUCTS } = require('../catalog');
const { buildOfferMessage } = require('../formatter');

module.exports = {
  name: '!shopee',
  description: 'Dispara 1 oferta com foto e comissão garantida da Shopee',
  adminOnly: true,
  async execute({ isGroup, replyToUser, sendProductMessage, logEntry }) {
    const shopeeProducts = PRODUCTS.filter(p => p.quotes.some(q => q.store === 'Shopee'));
    if (shopeeProducts.length === 0) {
      await replyToUser({ text: '⚠️ Nenhuma oferta da Shopee disponível no momento.' });
      return;
    }
    const p = shopeeProducts[Math.floor(Math.random() * shopeeProducts.length)];
    const caption = buildOfferMessage(p);
    await sendProductMessage(p, caption);
    if (!isGroup) await replyToUser({ text: '✅ Produto da Shopee enviado para os grupos VIP!' });
    logEntry('ADMIN', 'Comando !shopee executado com sucesso: ' + p.title);
  }
};
