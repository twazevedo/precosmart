/**
 * @file top.js — Comando !top / !ofertas / !destaques
 * Dispara instantaneamente um resumo visual com o TOP 5 de produtos mais vendidos
 * e maiores descontos reais do dia para acelerar a primeira venda.
 */
'use strict';

const { getTopDeals, getAffiliateUrl, getBestCoupon } = require('../catalog');

module.exports = {
  name: '!top',
  aliases: ['!ofertas', '!destaques', '!vendas'],
  description: 'Publica o ranking oficial com as 5 melhores ofertas e mais vendidas do dia',
  adminOnly: true,
  async execute({ waSocket, groupJid, replyToUser, logEntry }) {
    const top = getTopDeals(5);

    let message = `🔥 *TOP 5 OFERTAS CAMPEÃS DE VENDAS DO DIA!* 🔥\n\n` +
      `Separamos os itens mais vendidos e com os maiores descontos reais verificados no radar de hoje:\n\n`;

    top.forEach((p, idx) => {
      const cheapest = p.cheapest;
      const coupon = getBestCoupon(cheapest.store, cheapest.pix, p);
      const finalPrice = coupon ? coupon.finalPrice : cheapest.pix;
      const url = getAffiliateUrl(cheapest.store, p.title);
      const discount = Math.round(p.discPct);

      message += `${idx + 1}️⃣ *${p.title}*\n` +
        `🏪 Loja: *${cheapest.store}* (${p.shipping[cheapest.store] || 'Frete Rápido'})\n` +
        `📉 De: ~R$ ${p.history30dAvg.toFixed(2).replace('.', ',')}~\n` +
        `💥 *Por apenas: R$ ${finalPrice.toFixed(2).replace('.', ',')}* (${discount}% OFF)\n` +
        (coupon ? `🎟️ Cupom: *${coupon.code}*\n` : '') +
        `🔗 *Comprar com Desconto:* ${url}\n\n`;
    });

    message += `⚡ *Estoque limitado e cupons sujeitos a esgotar a qualquer momento!*\n` +
      `🛒 Aproveite para garantir o seu antes que o preço suba.`;

    const targetJid = process.env.WA_GROUP_JID || groupJid;
    if (targetJid) {
      await waSocket.sendMessage(targetJid, { text: message });
      await replyToUser({ text: '🚀 *Top 5 Ofertas Mais Vendidas disparadas no Grupo VIP!*' });
      logEntry('ADMIN', 'Comando !top disparado com sucesso para ' + targetJid);
    } else {
      await replyToUser({ text: message });
    }
  }
};
