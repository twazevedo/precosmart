/**
 * @file formatter.js — PreçoSmart Bot v2.0
 * @description Templates de mensagens ricas para WhatsApp:
 *  - Oferta completa com análise anti-fraude
 *  - Resumo matinal Top 3
 *  - Mensagem de boas-vindas
 *  - Flash sale urgente
 */
'use strict';

const { getAffiliateUrl, getBestCoupon, getTopDeals } = require('./catalog');

const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const now  = ()  => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
const pct  = (v) => `${Math.round(v)}%`;

/** ── Oferta completa ──────────────────────────────────────────────────────── */
function buildOfferMessage(product) {
  const sorted   = [...product.quotes].sort((a, b) => a.pix - b.pix);
  const cheapest = sorted[0];
  const pricier  = sorted[sorted.length - 1];
  const coupon   = getBestCoupon(cheapest.store, cheapest.pix);
  const final    = coupon ? coupon.finalPrice : cheapest.pix;
  const saving30 = product.history30dAvg - cheapest.pix;
  const savPct   = saving30 > 0 ? ((saving30 / product.history30dAvg) * 100) : 0;
  const isReal   = cheapest.pix < product.history30dAvg * 0.97;
  const isFlash  = savPct >= 15;
  const badge    = isReal ? '✅ *Promoção Autêntica*' : '⚠️ *Verifique o histórico*';
  const url      = getAffiliateUrl(cheapest.store, product.title);

  const otherStores = sorted.slice(1, 4).map((q) =>
    `  • ${q.store}: ${brl(q.pix)} → ${getAffiliateUrl(q.store, product.title)}`
  ).join('\n');

  const couponBlock = coupon
    ? `\n🎟️ *CUPOM:* \`${coupon.code}\` — ${coupon.desc}\n💰 *PREÇO FINAL: ${brl(final)}* (economia de ${brl(coupon.saving)})`
    : '';

  const flashBanner = isFlash ? '\n🚨 *FLASH DEAL — ESTOQUE LIMITADO!* 🚨' : '';

  return `${isFlash ? '🔥🔥🔥' : '⚡'} *PreçoSmart — Oferta do Dia!* ${isFlash ? '🔥🔥🔥' : '⚡'}${flashBanner}

${product.emoji} *${product.title}*
📂 _${product.category}_

━━━━━━━━━━━━━━━━━━━━━━
🏆 *MENOR PREÇO AGORA:*
🏪 *${cheapest.store}* → *${brl(cheapest.pix)}* no Pix
📦 ${product.shipping[cheapest.store] || 'Consultar frete'}
🔗 ${url}${couponBlock}

━━━━━━━━━━━━━━━━━━━━━━
🔍 *Compare nas 5 lojas:*
${otherStores}
  • ${pricier.store}: ${brl(pricier.pix)} (mais caro)

━━━━━━━━━━━━━━━━━━━━━━
📊 *Análise PreçoSmart:*
${badge}
${savPct > 0 ? `📉 ${pct(savPct)} abaixo da média dos últimos 30 dias` : '📊 Preço estável — sem variação relevante'}
💡 Diferença entre lojas: *${brl(pricier.pix - cheapest.pix)}*
💳 No cartão: *${brl(cheapest.card)}* em até ${cheapest.installments || 10}x sem juros

━━━━━━━━━━━━━━━━━━━━━━
🤖 _PreçoSmart Bot • Eletrônicos 24h_
⏰ _${now()}_
📲 _Encaminhe para quem precisa economizar!_`;
}

/** ── Resumo matinal Top 3 ─────────────────────────────────────────────────── */
function buildMorningMessage() {
  const top3 = getTopDeals(3);
  const dateStr = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long'
  });

  const items = top3.map((p, i) => {
    const medals = ['🥇', '🥈', '🥉'];
    const coupon = getBestCoupon(p.cheapest.store, p.cheapest.pix);
    const final  = coupon ? coupon.finalPrice : p.cheapest.pix;
    const url    = getAffiliateUrl(p.cheapest.store, p.title);
    return `${medals[i]} ${p.emoji} *${p.title.split(' ').slice(0, 6).join(' ')}...*\n   💰 ${brl(final)} na ${p.cheapest.store}${coupon ? ` com \`${coupon.code}\`` : ''} (${pct(p.discPct)} OFF)\n   🔗 ${url}`;
  }).join('\n\n');

  return `☀️ *Bom dia! Top 3 Ofertas de Hoje!*
📅 _${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}_

${items}

━━━━━━━━━━━━━━━━━━━━━━
💡 *Dica do dia:* Sempre use o cupom destacado!
📲 *Compartilhe* com amigos que curtem economizar!
🔔 Próxima oferta completa às *10h*

🤖 _PreçoSmart Bot — Eletrônicos com Preço Justo_`;
}

/** ── Boas-vindas para novos membros ──────────────────────────────────────── */
function buildWelcomeMessage() {
  return `👋 *Bem-vindo ao PreçoSmart Ofertas!* 🔥

Aqui você recebe automaticamente:
✅ *Melhores ofertas* em eletrônicos todos os dias
✅ *Cupons ativos* com o maior desconto disponível
✅ *Comparativo em tempo real* nas 5 maiores lojas:
   Amazon • Shopee • Mercado Livre • KaBuM! • AliExpress
✅ *Anti-Fraude "Metade do Dobro"* — nunca pague errado
✅ *Flash Deals* — alertas de estoque limitado 🚨

⏰ *Horários de envio automático:*
   🌅 09:55 — Resumo Top 3 do Dia
   🔔 10:00 — Oferta #1
   🔔 18:00 — Oferta #2 (pico do varejo)
   🌙 21:00 — Oferta #3 (horário nobre)

━━━━━━━━━━━━━━━━━━━━━━
🔗 *Extensão Grátis para Chrome:*
github.com/twazevedo/precosmart-extensao
_Compara preços enquanto você navega nas lojas!_

🤖 _Bot PreçoSmart — 100% Automático & Gratuito_`;
}

/** ── Alerta Flash Sale ───────────────────────────────────────────────────── */
function buildFlashSaleMessage(product) {
  const sorted   = [...product.quotes].sort((a, b) => a.pix - b.pix);
  const cheapest = sorted[0];
  const coupon   = getBestCoupon(cheapest.store, cheapest.pix);
  const final    = coupon ? coupon.finalPrice : cheapest.pix;
  const url      = getAffiliateUrl(cheapest.store, product.title);

  return `🚨🚨🚨 *FLASH SALE — TEMPO LIMITADO!* 🚨🚨🚨

${product.emoji} *${product.title}*

⚡ *${brl(final)}* na ${cheapest.store}${coupon ? ` com \`${coupon.code}\`` : ''}
🔗 *Garanta agora →* ${url}

⏳ _Oferta pode acabar a qualquer momento!_
🤖 _PreçoSmart Bot • ${now()}_`;
}

module.exports = { buildOfferMessage, buildMorningMessage, buildWelcomeMessage, buildFlashSaleMessage };
