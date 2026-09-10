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

// ── Lista Curada de Campanhas e Lojas AWIN ─────────────────────────────────────
const AWIN_DEALS = [
  // 1. CLOVIS CALÇADOS — OUTLET
  {
    store: 'Clovis Calçados',
    mid: 107702,
    targetUrl: 'https://www.clovis.com.br/outlet',
    title: 'Queima de Estoque Outlet Clovis',
    price: 'A partir de R$ 29,90',
    discount: 'Até 75% OFF',
    imageUrl: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?q=80&w=800',
    badge: '🚨 *ACHADINHO: OUTLET CLOVIS ABASTECIDO* 👟🔥',
    highlights: [
      'Tênis, rasteirinhas e sandálias a preço de atacado',
      'Ponta de estoque com numerações limitadas',
      'Entrega garantida para todo o Brasil'
    ]
  },

  // 2. CLOVIS CALÇADOS — BOLSAS
  {
    store: 'Clovis Calçados',
    mid: 107702,
    targetUrl: 'https://www.clovis.com.br/bolsa99',
    title: 'Especial Bolsas & Mochilas Selecionadas',
    price: 'Por apenas R$ 99,90',
    discount: 'Preço Especial Fixo',
    imageUrl: 'https://a1.awin1.com/ads/awin/107702/imgbolsas1080x1080-1739358335160.jpg',
    badge: '👜 *SELEÇÃO EXCLUSIVA DE BOLSAS* ✨',
    highlights: [
      'Modelos transversais, de ombro e mochilas modernas',
      'Acabamento premium e espaço interno ideal',
      'Parcelamento facilitado no cartão'
    ]
  },

  // 3. KABUM! BR (INSCRITO OFICIAL - ID: 17729)
  {
    store: 'KaBuM! Brasil Oficial',
    mid: 17729,
    targetUrl: 'https://www.kabum.com.br',
    title: 'Hardware, Periféricos Gamers & Eletrônicos',
    price: 'Ofertas Ninja com Desconto no PIX',
    discount: 'Até 60% OFF',
    imageUrl: 'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?q=80&w=800',
    badge: '🎮 *OFERTA NINJA KABUM! BRASIL* ⚡🖥️',
    highlights: [
      'SSDs, memórias, mouses, teclados mecânicos e monitores gamers',
      'Maior e-commerce de tecnologia e games da América Latina',
      'Descontos exclusivos no PIX e envio rápido com garantia'
    ]
  },

  // 4. NIKE BR
  {
    store: 'Nike Oficial',
    mid: 17652,
    targetUrl: 'https://www.nike.com.br',
    title: 'Tênis e Vestuário Esportivo Nike Oficial',
    price: 'Ofertas com Desconto Direto',
    discount: 'Até 50% OFF',
    imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=800',
    badge: '✔️ *OFERTA EXCLUSIVA NIKE BRASIL* 🏃‍♂️💨',
    highlights: [
      'Tênis casuais, corrida e vestuário esportivo original',
      'Linhas Air Max, Revolution e vestuário Dri-FIT',
      'Compra 100% segura direto na Loja Nike Oficial'
    ]
  },

  // 4. MIZUNO BR
  {
    store: 'Mizuno Brasil',
    mid: 51271,
    targetUrl: 'https://www.mizuno.com.br',
    title: 'Linha de Alta Performance Mizuno Wave',
    price: 'Preços Promocionais de Fábrica',
    discount: 'Até 45% OFF',
    imageUrl: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?q=80&w=800',
    badge: '⚡ *MIZUNO RUNNING & PERFORMANCE* 👟🏅',
    highlights: [
      'Amortecimento Wave icônico para caminhada e corrida',
      'Durabilidade extrema e conforto anatômico',
      'Condições especiais no e-commerce oficial'
    ]
  },

  // 5. OLYMPIKUS BR
  {
    store: 'Olympikus Brasil',
    mid: 17558,
    targetUrl: 'https://www.olympikus.com.br',
    title: 'Tênis Esportivos & Linha Corre Olympikus',
    price: 'A partir de R$ 129,90',
    discount: 'Melhor Custo-Benefício',
    imageUrl: 'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?q=80&w=800',
    badge: '🇧🇷 *A MARCA NÚMERO 1 DO BRASIL* 🏆',
    highlights: [
      'Líder nacional em conforto para o dia a dia e academia',
      'Tecnologia desenvolvida e testada por atletas brasileiros',
      'Envio rápido com frete econômico'
    ]
  },

  // 6. HAVAIANAS BR
  {
    store: 'Havaianas Oficial',
    mid: 19883,
    targetUrl: 'https://www.havaianas.com.br',
    title: 'Sandálias, Chinelos & Coleções Especiais',
    price: 'A partir de R$ 24,90',
    discount: 'Queima de Temporada',
    imageUrl: 'https://images.unsplash.com/photo-1603808033192-082d6919d3e1?q=80&w=800',
    badge: '🩴 *OFERTA IMPERDÍVEL HAVAIANAS* ☀️🌴',
    highlights: [
      'Linhas clássicas, estampadas, glitter e licenciadas',
      'Todo o conforto e originalidade Havaianas',
      'Monte seu kit e aproveite as promoções'
    ]
  },

  // 7. STANLEY BR
  {
    store: 'Stanley Brasil',
    mid: 30559,
    targetUrl: 'https://www.stanley-pmi.com.br',
    title: 'Copos, Garrafas & Cuias Térmicas Originais',
    price: 'Garantia Vitalícia de Fábrica',
    discount: 'Frete e Condições Especiais',
    imageUrl: 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?q=80&w=800',
    badge: '🧊 *PRODUTO ORIGINAL STANLEY BRASIL* 🍺🔒',
    highlights: [
      'Bebida gelada por horas com isolamento a vácuo',
      'Qualidade lendária em aço inoxidável 18/8',
      'Original com garantia vitalícia oficial'
    ]
  },

  // 8. HOPE LINGERIE BR
  {
    store: 'HOPE Lingerie',
    mid: 107039,
    targetUrl: 'https://www.hopelingerie.com.br',
    title: 'Moda Íntima, Lingeries & Pijamas Premium',
    price: 'Kits & Promoções Ativas',
    discount: 'Até 50% OFF no Bazar',
    imageUrl: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?q=80&w=800',
    badge: '👙 *ESPECIAL HOPE LINGERIE BRASIL* ✨💖',
    highlights: [
      'Conforto absoluto sem costura e tecidos nobres',
      'Kits promocionais de calcinhas e sutiãs de alta sustentação',
      'Descontos exclusivos direto no site oficial'
    ]
  },

  // 9. SHARK & NINJA BR
  {
    store: 'Shark-Ninja Brasil',
    mid: 105763,
    targetUrl: 'https://www.ninjabrasil.com.br',
    title: 'Eletroportáteis Ninja Creami & Air Fryers',
    price: 'Tecnologia de Ponta na Sua Cozinha',
    discount: 'Desconto à Vista / Parcelado',
    imageUrl: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?q=80&w=800',
    badge: '🌪️ *NINJA & SHARK: OS MAIS VIRAIS DO MUNDO* 🍦💎',
    highlights: [
      'Ninja Creami: sorvetes e sobremesas proteicas caseiras',
      'Air Fryers Ninja com tecnologia DualZone',
      'Cuidado capilar e aspiradores inteligentes Shark'
    ]
  },

  // 10. LEGO BR
  {
    store: 'LEGO Brasil Oficial',
    mid: 30511,
    targetUrl: 'https://www.legobrasil.com.br',
    title: 'Sets Colecionáveis, Star Wars, Technic & Botanicals',
    price: 'Colecionáveis Oficiais com Envio Seguro',
    discount: 'Linhas Exclusivas Disponíveis',
    imageUrl: 'https://images.unsplash.com/photo-1585366119957-e9730b6d0f60?q=80&w=800',
    badge: '🧱 *OFERTA LEGO OFICIAL BRASIL* 🪐🤖',
    highlights: [
      'Sets de montar para todas as idades e colecionadores',
      'Linhas temáticas Star Wars, Marvel, Harry Potter e Icons',
      'Produto 100% original com envio protegido'
    ]
  },

  // 11. VIVARA BR
  {
    store: 'Vivara Oficial',
    mid: 17662,
    targetUrl: 'https://www.vivara.com.br',
    title: 'Life by Vivara, Relógios & Joias Selecionadas',
    price: 'Oportunidades Especiais de Presente',
    discount: 'Parcelamento em até 10x',
    imageUrl: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?q=80&w=800',
    badge: '💍 *SELEÇÃO ESPECIAL VIVARA* 💎🎁',
    highlights: [
      'Berloques colecionáveis de prata Life by Vivara',
      'Relógios internacionais Tommy Hilfiger e Lacoste',
      'Embalagem para presente exclusiva da marca'
    ]
  },

  // 12. JBL BR
  {
    store: 'JBL Brasil Oficial',
    mid: 18761,
    targetUrl: 'https://www.jbl.com.br',
    title: 'Caixas de Som Bluetooth & Fones TWS JBL',
    price: 'Som Lendário com Garantia de 1 Ano',
    discount: 'Até 40% OFF em Selecionados',
    imageUrl: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?q=80&w=800',
    badge: '🔊 *SOM POTENTE JBL ORIGINAL* 🎧🔥',
    highlights: [
      'Fones sem fio linha Wave e caixas Go, Flip e Charge',
      'Bateria de longa duração e resistência à água',
      'Garantia oficial Harman do Brasil'
    ]
  },

  // 13. PHEBO BR
  {
    store: 'Perfumaria Phebo',
    mid: 76378,
    targetUrl: 'https://www.phebo.com.br',
    title: 'Perfumaria Fina, Sabonetes & Kits Tradicionais',
    price: 'Aroma Icônico & Tradição Brasileira',
    discount: 'Kits com Desconto',
    imageUrl: 'https://images.unsplash.com/photo-1528740561666-dc2479dc08ab?q=80&w=800',
    badge: '🌸 *PERFUMARIA PHEBO BRASIL* 🧼✨',
    highlights: [
      'Fragrâncias clássicas e sofisticadas com alta fixação',
      'Kits de presente com sabonetes e cremes corporais',
      'Tradição desde 1930 direto na sua casa'
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
