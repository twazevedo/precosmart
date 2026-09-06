/**
 * @file magalu.js — Comando !magalu
 */
'use strict';

const { getNextMagaluProduct } = require('../catalog');
const { buildOfferMessage } = require('../formatter');

module.exports = {
  name: '!magalu',
  description: 'Dispara 1 oferta do Magazine Luiza com cupom exclusivo',
  adminOnly: true,
  async execute({ isGroup, replyToUser, sendProductMessage, logEntry }) {
    const product = getNextMagaluProduct();
    if (!product) {
      await replyToUser({ text: '❌ Nenhum produto da Magazine Luiza disponível no catálogo.' });
      return;
    }
    const caption = buildOfferMessage(product);
    await sendProductMessage(product, caption);
    if (!isGroup) await replyToUser({ text: '💙 *Oferta Magalu Postada:* ' + product.title });
    logEntry('ADMIN', 'Comando !magalu executado: ' + product.title);
  }
};
