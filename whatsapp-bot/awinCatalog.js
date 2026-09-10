/**
 * @file awinCatalog.js — Catálogo & Rotação Inteligente de Afiliados AWIN
 * @description Gerencia campanhas oficiais AWIN com rotação round-robin sem repetição e links encurtados.
 */
'use strict';

const { shortenUrl } = require('./linkShortener');

const AWIN_PUBLISHER_ID = process.env.AWIN_PUBLISHER_ID || '3077915';
const CLICKREF = 'ROBOT3MIN';

/**
 * Monta o link oficial de afiliado AWIN com rastreamento.
 * @param {number|string} mid - Merchant ID na AWIN
 * @param {string} targetUrl - URL de destino da loja
 * @returns {string} URL de rastreamento AWIN
 */
function buildAwinUrl(mid, targetUrl) {
  return `https://www.awin1.com/cread.php?awinmid=${mid}&awinaffid=${AWIN_PUBLISHER_ID}&clickref=${CLICKREF}&ued=${encodeURIComponent(targetUrl)}`;
}

// ── Lista Curada Exclusiva de Lojas APROVADAS na AWIN ─────────────────────────
// Apenas anunciantes onde a conta já está confirmada e ativa (KaBuM e Clovis)
const AWIN_DEALS = [
  // 1. KABUM! — HARDWARE, SSD & UPGRADE
  {
    store: 'KaBuM! Brasil Oficial',
    mid: 17729,
    targetUrl: 'https://www.kabum.com.br/hardware',
    title: 'Hardware, SSDs NVMe & Peças para PC',
    price: 'Descontos Exclusivos no PIX',
    discount: 'Até 50% OFF',
    imageUrl: 'https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?q=80&w=800',
    badge: '⚡ *KABUM! OFERTA RELÂMPAGO DE HARDWARE* 💻🚀',
    highlights: [
      'SSDs M.2 NVMe, memórias RAM e processadores em super oferta',
      'Velocidade ultra rápida para jogos, boot e trabalho pesado',
      'Entrega rápida Ninja com garantia oficial de fábrica'
    ]
  },

  // 2. KABUM! — PERIFÉRICOS & SETUP GAMER
  {
    store: 'KaBuM! Brasil Oficial',
    mid: 17729,
    targetUrl: 'https://www.kabum.com.br/perifericos',
    title: 'Mouses, Teclados Mecânicos & Headsets Gamers',
    price: 'Preços Promocionais de Lançamento',
    discount: 'Até 60% OFF',
    imageUrl: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?q=80&w=800',
    badge: '🎯 *ACHADINHO NINJA KABUM! — SETUP GAMER* 🖱️✨',
    highlights: [
      'Mouses com sensor óptico de alta precisão e iluminação RGB',
      'Teclados mecânicos e headsets com áudio surround',
      'Melhor custo-benefício gamer com desconto no PIX'
    ]
  },

  // 3. CLOVIS CALÇADOS — OUTLET & CALÇADOS
  {
    store: 'Clovis Calçados',
    mid: 107702,
    targetUrl: 'https://www.clovis.com.br/outlet',
    title: 'Queima de Estoque Outlet Clovis',
    price: 'A partir de R$ 29,90',
    discount: 'Até 75% OFF',
    imageUrl: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?q=80&w=800',
    badge: '🚨 *CLOVIS CALÇADOS — QUEIMA DE ESTOQUE TOTAL!* 👠👟',
    highlights: [
      'Tênis casuais, sandálias e rasteirinhas a preço de fábrica',
      'Ponta de estoque com numerações limitadas',
      'Entrega garantida para todo o Brasil'
    ]
  },

  // 4. CLOVIS CALÇADOS — BOLSAS & MOCHILAS CHENSON
  {
    store: 'Clovis Calçados',
    mid: 107702,
    targetUrl: 'https://www.clovis.com.br/bolsa99',
    title: 'Especial Bolsas e Mochilas Chenson Selecionadas',
    price: 'Por apenas R$ 99,90',
    discount: 'Preço Especial Fixo',
    imageUrl: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?q=80&w=800',
    badge: '👜 *ESPECIAL BOLSAS & MOCHILAS POR R$ 99* ✨',
    highlights: [
      'Modelos transversais, de ombro e mochilas modernas Chenson',
      'Acabamento premium e espaço interno ideal para o dia a dia',
      'Parcelamento facilitado no cartão e compra 100% segura'
    ]
  }
];

let currentAwinIndex = 0;

/**
 * Obtém a próxima oferta da rotação AWIN sem repetir sequencialmente.
 * Gera link oficial AWIN e encurta via TinyURL.
 * @returns {Promise<object>} Objeto da oferta pronto para disparo
 */
async function getNextAwinDeal() {
  const deal = AWIN_DEALS[currentAwinIndex];
  // Avança o ponteiro circular (round-robin)
  currentAwinIndex = (currentAwinIndex + 1) % AWIN_DEALS.length;

  const rawAwinUrl = buildAwinUrl(deal.mid, deal.targetUrl);
  const shortUrl = await shortenUrl(rawAwinUrl);

  const highlightsText = deal.highlights.map(h => `✅ ${h}`).join('\n');

  const text = `${deal.badge}

🏷️ *${deal.title}*
🏪 *Loja:* ${deal.store}
💰 *Preço:* ${deal.price} (${deal.discount})

${highlightsText}

🛒 *Compre com desconto verificado aqui:*
👉 ${shortUrl}

✈️ *Mais ofertas e cupons exclusivos no Telegram:*
👉 https://t.me/+VLYDUl2KP78xNTg5

⚠️ *Aviso:* Estoque e preços podem variar a qualquer momento. Oferta oficial verificada pelo PreçoSmart.`;

  return {
    ...deal,
    rawUrl: rawAwinUrl,
    url: shortUrl,
    text
  };
}

module.exports = {
  AWIN_DEALS,
  buildAwinUrl,
  getNextAwinDeal
};
