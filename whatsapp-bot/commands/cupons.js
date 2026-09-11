/**
 * @file cupons.js — Comando !cupons e !cupom
 * Lista cupons oficiais ativos da KaBuM! e Clovis Calçados.
 */
'use strict';

const { getAllActiveVouchers, formatVoucherList } = require('../awinCatalog');

module.exports = {
  name: '!cupons',
  aliases: ['!cupom', '!desconto', '!descontos', '!voucher', '!vouchers'],
  description: 'Exibe os cupons de desconto oficiais ativos da KaBuM e Clovis',
  adminOnly: false,
  async execute({ args, replyToUser, logEntry }) {
    const query = (args || []).join(' ').toLowerCase().trim();
    const vouchers = getAllActiveVouchers();

    if (!query) {
      const fullList = formatVoucherList();
      await replyToUser({ text: fullList });
      logEntry('CMD', 'Comando !cupons executado — lista geral enviada');
      return;
    }

    // Filtra pelo termo buscado (ex: "kabum", "jbl", "rise", "switch")
    const filtered = vouchers.filter(v => {
      const text = `${v.code} ${v.advertiser} ${v.description}`.toLowerCase();
      return text.includes(query);
    });

    if (filtered.length === 0) {
      await replyToUser({
        text: `🔍 Não encontrei cupons ativos específicos para "*${query}*" no momento.\n\n` +
              `Digite \`!cupons\` para ver todos os cupons disponíveis agora!`
      });
      return;
    }

    let msg = `🎟️ *CUPONS ENCONTRADOS PARA "${query.toUpperCase()}" (${filtered.length})* 🔥\n\n`;
    filtered.forEach((v, idx) => {
      msg += `${idx + 1}️⃣ *Cupom:* \`${v.code}\`\n`;
      msg += `🏪 *Loja:* ${v.advertiser || 'KaBuM!'}\n`;
      msg += `📝 ${v.description}\n\n`;
    });
    msg += `⚡ Copie o cupom e aplique no carrinho antes de pagar!`;

    await replyToUser({ text: msg });
    logEntry('CMD', `Comando !cupons executado para o termo "${query}"`);
  }
};
