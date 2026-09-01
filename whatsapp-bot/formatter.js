/**
 * @file formatter.js
 * @description Templates de mensagens formatadas para o WhatsApp Bot PreçoSmart.
 * Gera textos com emojis, preços em BRL e links de afiliado prontos para envio.
 */

'use strict';

const { getAffiliateUrl, getBestCoupon } = require('./catalog');

/**
 * Formata valor para Real Brasileiro.
 * @param {number} value
 * @returns {string}
 */
const brl = (value) =>
  Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Gera o card completo de oferta para envio no WhatsApp.
 * @param {object} product - Produto do catálogo
 * @returns {string} Mensagem formatada
 */
function buildOfferMessage(product) {
  const sortedQuotes = [...product.quotes].sort((a, b) => a.pix - b.pix);
  const cheapest = sortedQuotes[0];
  const most_expensive = sortedQuotes[sortedQuotes.length - 1];

  const coupon = getBestCoupon(cheapest.store, cheapest.pix);
  const finalPrice = coupon ? coupon.finalPrice : cheapest.pix;
  const savings30d = product.history30dAvg - cheapest.pix;
  const savingsPct = Math.round((savings30d / product.history30dAvg) * 100);

  const isAuthentic = cheapest.pix < product.history30dAvg * 0.97;
  const fraudBadge = isAuthentic
    ? '✅ *Promoção Autêntica* (abaixo da média dos últimos 30 dias)'
    : '⚠️ Verifique o histórico antes de comprar';

  const affiliateUrl = getAffiliateUrl(cheapest.store, product.title);
  const shipping = product.shipping[cheapest.store] || 'Consultar frete';

  // Monta comparativo das outras lojas
  const otherStores = sortedQuotes.slice(1, 4).map((q) => {
    const url = getAffiliateUrl(q.store, product.title);
    return `  • ${q.store}: ${brl(q.pix)} → ${url}`;
  }).join('\n');

  const couponSection = coupon
    ? `\n🎟️ *CUPOM DO DIA:* \`${coupon.code}\` (${coupon.store})\n💸 *${coupon.desc}*\n💰 *PREÇO FINAL: ${brl(finalPrice)}*`
    : '';

  const now = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit'
  });

  return `⚡ *PreçoSmart — Oferta Exclusiva!* ⚡

${product.emoji} *${product.title}*
📂 Categoria: _${product.category}_

━━━━━━━━━━━━━━━━━━━━━━
🏆 *MENOR PREÇO AGORA:*
🏪 *${cheapest.store}* → *${brl(cheapest.pix)}* no Pix
📦 ${shipping}
🔗 Ver Oferta: ${affiliateUrl}${couponSection}

━━━━━━━━━━━━━━━━━━━━━━
🔍 *Comparativo nas 5 lojas:*
${otherStores}
  • ${most_expensive.store}: ${brl(most_expensive.pix)}

━━━━━━━━━━━━━━━━━━━━━━
📊 *Análise de Preço:*
${fraudBadge}
${savingsPct > 0 ? `📉 ${savingsPct}% abaixo da média dos últimos 30 dias!` : '📊 Preço estável no período'}
💡 Diferença entre as lojas: *${brl(most_expensive.pix - cheapest.pix)}*

━━━━━━━━━━━━━━━━━━━━━━
🤖 _PreçoSmart Bot • Eletrônicos 24h_
⏰ _Atualizado: ${now}_
📲 _Use o cupom destacado acima para economizar ainda mais!_`;
}

/**
 * Gera mensagem de bom dia com resumo diário.
 * @param {object[]} highlights - Array de produtos em destaque do dia
 * @returns {string}
 */
function buildDailySummaryMessage(highlights) {
  const now = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: '2-digit',
    month: 'long'
  });

  const items = highlights.slice(0, 3).map((p) => {
    const cheapest = [...p.quotes].sort((a, b) => a.pix - b.pix)[0];
    const coupon = getBestCoupon(cheapest.store, cheapest.pix);
    const finalPrice = coupon ? coupon.finalPrice : cheapest.pix;
    return `${p.emoji} *${p.title.split(' ').slice(0, 5).join(' ')}...*\n   ↳ ${brl(finalPrice)} na ${cheapest.store}${coupon ? ` com cupom \`${coupon.code}\`` : ''}`;
  }).join('\n\n');

  return `☀️ *Bom dia! Suas melhores ofertas de hoje!*
📅 _${now.charAt(0).toUpperCase() + now.slice(1)}_

🔥 *Top 3 Eletrônicos Mais Baratos Agora:*

${items}

💡 *Enviaremos os detalhes completos ao longo do dia!*

━━━━━━━━━━━━━━━━━━━━━━
🤖 _Bot PreçoSmart • Atualizado agora_
📲 _Compartilhe este grupo com amigos que adoram economizar!_`;
}

/**
 * Gera mensagem de convite para novos membros.
 * @returns {string}
 */
function buildWelcomeMessage() {
  return `👋 *Bem-vindo ao PreçoSmart Ofertas!* 🔥

Aqui você encontra:
✅ As *melhores ofertas do dia* em eletrônicos
✅ *Cupons com desconto* aplicados automaticamente
✅ *Comparativo em tempo real* nas 5 maiores lojas do Brasil
   (Amazon, Shopee, Mercado Livre, KaBuM!, AliExpress)
✅ *Alerta Anti-Fraude* para nunca pagar a "metade do dobro"

📢 *As ofertas chegam 3x ao dia:*
⏰ 10h • 18h • 21h (horário de Brasília)

💡 *Dica:* Instale também a extensão gratuita para o Chrome:
🔗 https://github.com/twazevedo/precosmart-extensao

━━━━━━━━━━━━━━━━━━━━━━
🤖 _Bot PreçoSmart — 100% Automático & Gratuito_`;
}

module.exports = { buildOfferMessage, buildDailySummaryMessage, buildWelcomeMessage };
