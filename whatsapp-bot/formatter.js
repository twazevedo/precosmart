/**
 * @file formatter.js — PreçoSmart Bot v2.1
 * @description Mensagens limpas, sem assinatura de IA, sem menção à extensão.
 * As ofertas são enviadas como imagem + legenda pelo bot.js.
 */
'use strict';

const { getAffiliateUrl, getBestCoupon, getTopDeals } = require('./catalog');

const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const now  = ()  => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
const pct  = (v) => `${Math.round(v)}%`;

/** ── Legenda da oferta (vai junto à foto do produto) ───────────────────────── */
function buildOfferCaption(product) {
  const sorted   = [...product.quotes].sort((a, b) => a.pix - b.pix);
  const cheapest = sorted[0];
  const coupon   = getBestCoupon(cheapest.store, cheapest.pix, product);
  const final    = coupon ? coupon.finalPrice : cheapest.pix;
  const oldPrice = product.history30dAvg;
  const url      = getAffiliateUrl(cheapest.store, product.title);

  // Frases de efeito curtas
  const catchphrases = [
    '🔥 OFERTA IMPERDÍVEL',
    '🚨 PREÇO CAIU',
    '⚡ CORRE QUE TÁ BARATO',
    '🎯 ACHADO DO DIA',
    '💣 EXPLOSÃO DE OFERTA'
  ];
  const catchphrase = catchphrases[Math.floor(Math.random() * catchphrases.length)];

  let instructions = '';
  if (coupon) {
    instructions = `\n↪️ Cupom: *${coupon.code}* (${coupon.desc})`;
  } else if (cheapest.store === 'KaBuM!' || cheapest.store === 'Mercado Livre') {
     instructions = `\n↪️ Menor preço no Pix.`;
  }

  const storeBadge = cheapest.store === 'Magazine Luiza'
    ? '\n\n💙 *Divulgador Autorizado Magazine Luiza* 💙\n🔒 *Compra 100% Segura e Garantida pelo Magalu*\n🚚 *Entrega Rápida ou Retire Grátis na Loja*\n🎟️ *Vitrine de Cupons:* https://especiais.magazineluiza.com.br/magazinevoce/cupons/?showcase=magazineprecosmartvip'
    : '';

  return `${catchphrase}

${product.emoji} ${product.title}

🔥 DE ${brl(oldPrice)} | POR ${brl(final)}${instructions}

🔗 ${url}${storeBadge}`;
}

/** ── Resumo matinal (texto simples, sem foto) ─────────────────────────────── */
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
💡 Use o cupom destacado para economizar ainda mais!
📲 Compartilhe com quem também quer economizar!
🔔 Próxima oferta às *10h*`;
}

/** ── Boas-vindas (sem menção à extensão) ─────────────────────────────────── */
function buildWelcomeMessage() {
  return `👋 *Bem-vindo ao PreçoSmart Ofertas!* 🔥

Aqui você recebe automaticamente:
✅ *Melhores ofertas* em eletrônicos todos os dias
✅ *Cupons ativos* com o maior desconto disponível
✅ *Comparativo em tempo real* nas maiores lojas:
   Magazine Luiza • Amazon • Mercado Livre • Shopee • KaBuM!
✅ *Anti-Fraude "Metade do Dobro"* — nunca pague errado
✅ *Flash Deals* quando o estoque está acabando 🚨

⏰ *Horários de envio automático:*
   🌅 09:55 — Top 3 melhores do dia
   🔔 10:00 — Oferta #1
   🔔 18:00 — Oferta #2
   🌙 21:00 — Oferta #3 ou Flash Sale

Divulgue o grupo para seus amigos! 💚`;
}

/** ── Flash Sale (vai junto à foto do produto) ─────────────────────────────── */
function buildFlashCaption(product) {
  const sorted   = [...product.quotes].sort((a, b) => a.pix - b.pix);
  const cheapest = sorted[0];
  const coupon   = getBestCoupon(cheapest.store, cheapest.pix);
  const final    = coupon ? coupon.finalPrice : cheapest.pix;
  const oldPrice = product.history30dAvg;
  const url      = getAffiliateUrl(cheapest.store, product.title);

  let instructions = '';
  if (coupon) {
    instructions = `\n↪️ Aplique o cupom "${coupon.code}" no carrinho.`;
  }

  return `🚨 FLASH SALE — ESTOQUE LIMITADO

${product.emoji} ${product.title}

🔥 DE ${brl(oldPrice)} | POR ${brl(final)}${instructions}

🔗 ${url}`;
}

// Mantém compatibilidade com chamadas existentes no bot.js
const buildOfferMessage    = buildOfferCaption;
const buildFlashSaleMessage = (p) => buildFlashCaption(p);

module.exports = { buildOfferCaption, buildFlashCaption, buildMorningMessage, buildWelcomeMessage, buildOfferMessage, buildFlashSaleMessage };
