/**
 * @file catalogo.js — Comando !revista e !catalogo
 */
'use strict';

const BOT_ID = process.env.AFFILIATE_BOTICARIO || '27065696';

module.exports = {
  name: '!revista',
  aliases: ['!catalogo', '!catalogos', '!revistas'],
  description: 'Exibe as Revistas e Catálogos Digitais Oficiais do Grupo Boticário',
  adminOnly: false,
  async execute({ replyToUser, logEntry }) {
    const text = 
      '📖 *REVISTAS & CATÁLOGOS DIGITAIS (CICLO ATUAL)* 🌸\n\n' +
      'Folheie as revistas virtuais oficiais pelo celular e aproveite descontos e lançamentos exclusivos:\n\n' +
      '🌸 *O Boticário (Revista do Ciclo):*\n' +
      '🔗 https://minhaloja.boticario.com.br/redirect/' + BOT_ID + '?to=/pdf?id=1773&origin=boticario&utm_source=portal_bot&utm_medium=precosmart\n\n' +
      '💄 *Quem Disse, Berenice?:*\n' +
      '🔗 https://minhaloja.quemdisseberenice.com.br/redirect/' + BOT_ID + '/?origin=boticario&utm_source=portal_bot&utm_medium=precosmart\n\n' +
      '✨ *Eudora:*\n' +
      '🔗 https://minhaloja.eudora.com.br/redirect/' + BOT_ID + '/?origin=boticario&utm_source=portal_bot&utm_medium=precosmart\n\n' +
      '🇫🇷 *O.U.i Paris (Alta Perfumaria Francesa):*\n' +
      '🔗 https://minhaloja.ouiparis.com/redirect/' + BOT_ID + '/?origin=boticario&utm_source=portal_bot&utm_medium=precosmart\n\n' +
      '🚚 *Produtos 100% Originais direto da marca com entrega rápida e amostras grátis!*';

    await replyToUser({ text });
    logEntry('CMD', 'Comando !revista executado — Catálogos digitais enviados');
  }
};