/**
 * @file shopee.js — Comando !shopee
 */
'use strict';

const { PRODUCTS } = require('../catalog');
const { getNextShopeeProduct } = require('../shopeeCatalog');
const { buildOfferMessage } = require('../formatter');

module.exports = {
  name: '!shopee',
  description: 'Dispara 1 oferta com foto e comissão garantida da Shopee',
  adminOnly: true,
  async execute({ isGroup, replyToUser, sendProductMessage, logEntry }) {
    const fallbackList = PRODUCTS.filter(item => item.quotes.some(q => q.store === 'Shopee'));
    const p = getNextShopeeProduct() || fallbackList[Math.floor(Math.random() * fallbackList.length)];
    if (!p) {
      await replyToUser({ text: 'Nenhuma oferta da Shopee disponivel no momento.' });
      return;
    }
    const caption = buildOfferMessage(p);
    await sendProductMessage(p, caption);
    if (!isGroup) await replyToUser({ text: '✅ Produto da Shopee enviado para os grupos VIP!' });
    logEntry('ADMIN', 'Comando !shopee executado com sucesso: ' + p.title);
  }
};
