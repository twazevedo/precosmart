/**
 * @file formatter.js — PreçoSmart Bot v2.1
 * @description Mensagens limpas, sem assinatura de IA, sem menção à extensão.
 * As ofertas são enviadas como imagem + legenda pelo bot.js.
 */
'use strict';

const { getAffiliateUrl, getBestCoupon, getTopDeals } = require('./catalog');
const { evaluateDeal } = require('./dealScore');

const brl = (v) => (!v || isNaN(v)) ? 'R$ 0,00' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const now  = ()  => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
const pct  = (v) => `${Math.round(v)}%`;

function sanitizeForWhatsApp(text) {
  if (!text) return '';
  return String(text).replace(/[*_~`]/g, '').trim();
}

/** ── Legenda da oferta (vai junto à foto do produto) ───────────────────────── */
function buildOfferCaption(product) {
  if (!product || !product.quotes || product.quotes.length === 0) return '';
  const sorted   = [...product.quotes].sort((a, b) => a.pix - b.pix);
  const cheapest = sorted[0];
  const coupon   = getBestCoupon(cheapest.store, cheapest.pix, product);
  const final    = coupon ? coupon.finalPrice : cheapest.pix;
  const oldPrice = product.history30dAvg;
  const url      = getAffiliateUrl(cheapest.store, product.title);

  // Frases de efeito de alta conversão
  const catchphrases = [
    '🚨 *ACHADO EXCLUSIVO • PREÇO CAIU!* 💥',
    '🔥 *CORRE QUE TÁ VALENDO MUITO!* ⚡',
    '⚡ *OFERTA RELÂMPAGO • ESTOQUE LIMITADO!* 🛒',
    '💥 *PREÇO DERRETEU • APROVEITE!* 🎯',
    '🏷️ *OPORTUNIDADE DO DIA PREÇOSMART!* ⭐'
  ];
  const catchphrase = catchphrases[Math.floor(Math.random() * catchphrases.length)];

  let instructions = '';
  if (coupon) {
    instructions = `\n🎟️ *Cupom:* \`${coupon.code}\` _(toque para copiar)_`;
  } else if (cheapest.store === 'KaBuM!' || cheapest.store === 'Mercado Livre') {
     instructions = `\n💳 _Melhor preço no Pix ou parcelado._`;
  }

  const dealEval = evaluateDeal(product.title, final, oldPrice);
  const scoreBadge = dealEval && dealEval.badge ? `\n\n${dealEval.badge}` : '';

  return `${catchphrase}

${product.emoji} *${sanitizeForWhatsApp(product.title)}*
🏪 Loja: *${cheapest.store} Oficial*

📉 De: ~${brl(oldPrice)}~
💥 *POR APENAS: ${brl(final)}*${instructions}${scoreBadge}

👉 *COMPRE COM DESCONTO AQUI:*
🔗 ${url}

⚡ _Preço e estoque podem variar a qualquer momento._
🛡️ _Compra 100% segura e garantida pela loja oficial._`;
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
    return `${medals[i]} ${p.emoji} *${sanitizeForWhatsApp(p.title.split(' ').slice(0, 6).join(' ') + '...')}*\n   💰 ${brl(final)} na ${p.cheapest.store}${coupon ? ` com \`${coupon.code}\`` : ''} (${pct(p.discPct)} OFF)\n   🔗 ${url}`;
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

${product.emoji} ${sanitizeForWhatsApp(product.title)}

🔥 DE ${brl(oldPrice)} | POR ${brl(final)}${instructions}

🔗 ${url}`;
}

// Mantém compatibilidade com chamadas existentes no bot.js
const buildOfferMessage    = buildOfferCaption;
const buildFlashSaleMessage = (p) => buildFlashCaption(p);

module.exports = { buildOfferCaption, buildFlashCaption, buildMorningMessage, buildWelcomeMessage, buildOfferMessage, buildFlashSaleMessage };
