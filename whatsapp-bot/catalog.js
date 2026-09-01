/**
 * @file catalog.js
 * @description Catálogo de produtos eletrônicos com links de afiliado embutidos
 * para o Bot de Ofertas PreçoSmart.
 */

'use strict';

// ============================================================================
// CONFIGURAÇÃO DE AFILIADOS
// ============================================================================
const AFFILIATE = {
  amazon: 'precosmartapp-20',
  shopee: '18361251220',
  ml: 'azs5603820'
};

// ============================================================================
// CUPONS ATIVOS
// ============================================================================
const COUPONS = [
  { code: 'TECH10',      store: 'KaBuM!',         discount: 0.10, type: 'percent', desc: '-10% em hardware e periféricos' },
  { code: 'PRIME15',     store: 'Amazon',          discount: 15,   type: 'fixed',   desc: '-R$ 15 em eletrônicos para Prime' },
  { code: 'SHOPEE20',    store: 'Shopee',          discount: 20,   type: 'fixed',   desc: '-R$ 20 em tech acima de R$ 150' },
  { code: 'MELI10',      store: 'Mercado Livre',   discount: 0.10, type: 'percent', desc: '-10% em lojas oficiais' },
  { code: 'ALIEXPRESS25',store: 'AliExpress',      discount: 25,   type: 'fixed',   desc: '-R$ 25 em produtos Choice' }
];

// ============================================================================
// CATÁLOGO DE PRODUTOS
// ============================================================================
const PRODUCTS = [
  {
    id: 'rtx-4060',
    emoji: '🎮',
    title: 'Placa de Vídeo GeForce RTX 4060 8GB GDDR6',
    category: 'Hardware & PC',
    history30dMin: 2199,
    history30dAvg: 2089,
    quotes: [
      { store: 'KaBuM!',       pix: 1899.90, card: 2199.90, installments: 10 },
      { store: 'AliExpress',   pix: 1949.00, card: 2090.00, installments: 6  },
      { store: 'Mercado Livre',pix: 1999.00, card: 2149.00, installments: 10 },
      { store: 'Amazon',       pix: 2049.00, card: 2049.00, installments: 10 },
      { store: 'Shopee',       pix: 2099.00, card: 2249.00, installments: 10 }
    ],
    shipping: {
      'KaBuM!':       'Entrega Ninja (1-2 dias)',
      'Amazon':       'Prime Grátis',
      'Mercado Livre':'Full ML (Amanhã)',
      'Shopee':       'Frete Grátis',
      'AliExpress':   'Remessa Conforme'
    }
  },
  {
    id: 'iphone-15',
    emoji: '📱',
    title: 'Smartphone Apple iPhone 15 128GB',
    category: 'Smartphones',
    history30dMin: 4899,
    history30dAvg: 4799,
    quotes: [
      { store: 'KaBuM!',       pix: 4699.90, card: 5199.90, installments: 10 },
      { store: 'Mercado Livre',pix: 4749.00, card: 4999.00, installments: 10 },
      { store: 'Shopee',       pix: 4799.00, card: 4999.00, installments: 10 },
      { store: 'Amazon',       pix: 4899.00, card: 4899.00, installments: 10 },
      { store: 'AliExpress',   pix: 5120.00, card: 5390.00, installments: 6  }
    ],
    shipping: {
      'KaBuM!':       'Entrega Ninja (1-2 dias)',
      'Amazon':       'Prime Grátis',
      'Mercado Livre':'Full ML (Amanhã)',
      'Shopee':       'Frete Grátis',
      'AliExpress':   'Remessa Conforme'
    }
  },
  {
    id: 'ps5-slim',
    emoji: '🕹️',
    title: 'Console PlayStation 5 Slim 1TB com Leitor',
    category: 'Games & Consoles',
    history30dMin: 3799,
    history30dAvg: 3649,
    quotes: [
      { store: 'Shopee',       pix: 3499.00, card: 3799.00, installments: 10 },
      { store: 'Amazon',       pix: 3599.00, card: 3599.00, installments: 10 },
      { store: 'Mercado Livre',pix: 3649.00, card: 3849.00, installments: 10 },
      { store: 'KaBuM!',       pix: 3699.90, card: 3999.90, installments: 10 },
      { store: 'AliExpress',   pix: 3890.00, card: 4120.00, installments: 6  }
    ],
    shipping: {
      'Shopee':       'Frete Grátis',
      'Amazon':       'Prime Grátis',
      'Mercado Livre':'Full ML (Amanhã)',
      'KaBuM!':       'Entrega Ninja (1-2 dias)',
      'AliExpress':   'Remessa Conforme'
    }
  },
  {
    id: 'smart-tv-55',
    emoji: '📺',
    title: 'Smart TV 55" 4K UHD Samsung Crystal QLED',
    category: 'TV & Vídeo',
    history30dMin: 2799,
    history30dAvg: 2649,
    quotes: [
      { store: 'Amazon',       pix: 2499.00, card: 2499.00, installments: 10 },
      { store: 'Mercado Livre',pix: 2549.00, card: 2699.00, installments: 10 },
      { store: 'Shopee',       pix: 2599.00, card: 2799.00, installments: 10 },
      { store: 'KaBuM!',       pix: 2699.90, card: 2999.90, installments: 10 },
      { store: 'AliExpress',   pix: 2890.00, card: 3090.00, installments: 6  }
    ],
    shipping: {
      'Amazon':       'Prime Grátis',
      'Mercado Livre':'Full ML (Amanhã)',
      'Shopee':       'Frete Grátis',
      'KaBuM!':       'Entrega Ninja',
      'AliExpress':   'Remessa Conforme'
    }
  },
  {
    id: 'monitor-ultragear',
    emoji: '🖥️',
    title: 'Monitor Gamer LG UltraGear 27" 144Hz 1ms IPS',
    category: 'Monitores',
    history30dMin: 1299,
    history30dAvg: 1189,
    quotes: [
      { store: 'KaBuM!',       pix: 1099.90, card: 1249.90, installments: 10 },
      { store: 'Mercado Livre',pix: 1189.00, card: 1249.00, installments: 10 },
      { store: 'Shopee',       pix: 1199.00, card: 1299.00, installments: 10 },
      { store: 'Amazon',       pix: 1249.00, card: 1249.00, installments: 10 },
      { store: 'AliExpress',   pix: 1290.00, card: 1390.00, installments: 6  }
    ],
    shipping: {
      'KaBuM!':       'Entrega Ninja (1-2 dias)',
      'Mercado Livre':'Full ML (Amanhã)',
      'Shopee':       'Frete Grátis',
      'Amazon':       'Prime Grátis',
      'AliExpress':   'Remessa Conforme'
    }
  },
  {
    id: 'ssd-nvme-1tb',
    emoji: '💾',
    title: 'SSD NVMe M.2 1TB Kingston NV2 PCIe 4.0',
    category: 'Hardware & PC',
    history30dMin: 349,
    history30dAvg: 319,
    quotes: [
      { store: 'AliExpress',   pix: 289.00, card: 309.00, installments: 6  },
      { store: 'Shopee',       pix: 319.00, card: 339.00, installments: 10 },
      { store: 'KaBuM!',       pix: 349.90, card: 379.90, installments: 10 },
      { store: 'Mercado Livre',pix: 359.00, card: 389.00, installments: 10 },
      { store: 'Amazon',       pix: 379.00, card: 379.00, installments: 10 }
    ],
    shipping: {
      'AliExpress':   'Remessa Conforme',
      'Shopee':       'Frete Grátis',
      'KaBuM!':       'Entrega Ninja (1-2 dias)',
      'Mercado Livre':'Full ML (Amanhã)',
      'Amazon':       'Prime Grátis'
    }
  },
  {
    id: 'nintendo-switch-oled',
    emoji: '🎮',
    title: 'Nintendo Switch OLED 64GB Branco',
    category: 'Games & Consoles',
    history30dMin: 2499,
    history30dAvg: 2349,
    quotes: [
      { store: 'KaBuM!',       pix: 2199.90, card: 2499.90, installments: 10 },
      { store: 'Shopee',       pix: 2249.00, card: 2499.00, installments: 10 },
      { store: 'Amazon',       pix: 2299.00, card: 2299.00, installments: 10 },
      { store: 'Mercado Livre',pix: 2349.00, card: 2499.00, installments: 10 },
      { store: 'AliExpress',   pix: 2490.00, card: 2690.00, installments: 6  }
    ],
    shipping: {
      'KaBuM!':       'Entrega Ninja (1-2 dias)',
      'Shopee':       'Frete Grátis',
      'Amazon':       'Prime Grátis',
      'Mercado Livre':'Full ML (Amanhã)',
      'AliExpress':   'Remessa Conforme'
    }
  },
  {
    id: 'headset-sony-wh1000xm5',
    emoji: '🎧',
    title: 'Fone Bluetooth Sony WH-1000XM5 Noise Cancelling',
    category: 'Áudio',
    history30dMin: 1599,
    history30dAvg: 1449,
    quotes: [
      { store: 'Amazon',       pix: 1299.00, card: 1299.00, installments: 10 },
      { store: 'KaBuM!',       pix: 1349.90, card: 1499.90, installments: 10 },
      { store: 'Mercado Livre',pix: 1399.00, card: 1499.00, installments: 10 },
      { store: 'Shopee',       pix: 1449.00, card: 1549.00, installments: 10 },
      { store: 'AliExpress',   pix: 1480.00, card: 1590.00, installments: 6  }
    ],
    shipping: {
      'Amazon':       'Prime Grátis',
      'KaBuM!':       'Entrega Ninja (1-2 dias)',
      'Mercado Livre':'Full ML (Amanhã)',
      'Shopee':       'Frete Grátis',
      'AliExpress':   'Remessa Conforme'
    }
  }
];

/**
 * Retorna URL da loja com a tag de afiliado embutida.
 * @param {string} store
 * @param {string} productTitle
 * @returns {string}
 */
function getAffiliateUrl(store, productTitle) {
  const enc = encodeURIComponent(productTitle);
  switch (store) {
    case 'Amazon':
      return `https://www.amazon.com.br/s?k=${enc}&tag=${AFFILIATE.amazon}`;
    case 'Shopee':
      return `https://shopee.com.br/search?keyword=${enc}&aff_id=${AFFILIATE.shopee}`;
    case 'Mercado Livre':
      return `https://lista.mercadolivre.com.br/${enc}?matt_tool=${AFFILIATE.ml}`;
    case 'KaBuM!':
      return `https://www.kabum.com.br/busca/${enc}`;
    case 'AliExpress':
      return `https://pt.aliexpress.com/wholesale?SearchText=${enc}`;
    default:
      return '#';
  }
}

/**
 * Encontra o melhor cupom para a loja mais barata.
 * @param {string} cheapestStore
 * @param {number} pixPrice
 * @returns {{ code: string, finalPrice: number, saving: number, desc: string } | null}
 */
function getBestCoupon(cheapestStore, pixPrice) {
  // Procura cupom específico para a loja mais barata
  const storeCoupon = COUPONS.find((c) => c.store === cheapestStore);
  // Fallback: melhor cupom geral por valor de desconto
  const bestGeneric = COUPONS.reduce((best, c) => {
    const saving = c.type === 'percent' ? pixPrice * c.discount : c.discount;
    const bestSaving = best ? (best.type === 'percent' ? pixPrice * best.discount : best.discount) : 0;
    return saving > bestSaving ? c : best;
  }, null);

  const coupon = storeCoupon || bestGeneric;
  if (!coupon) return null;

  const saving = coupon.type === 'percent'
    ? parseFloat((pixPrice * coupon.discount).toFixed(2))
    : coupon.discount;

  return {
    code: coupon.code,
    store: coupon.store,
    finalPrice: parseFloat((pixPrice - saving).toFixed(2)),
    saving,
    desc: coupon.desc
  };
}

/**
 * Retorna um produto aleatório do catálogo a cada chamada.
 * @returns {object}
 */
function getRandomProduct() {
  return PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
}

/**
 * Retorna o produto do dia baseado no índice do dia do ano.
 * @returns {object}
 */
function getDailyProduct() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return PRODUCTS[dayOfYear % PRODUCTS.length];
}

module.exports = {
  PRODUCTS,
  COUPONS,
  AFFILIATE,
  getAffiliateUrl,
  getBestCoupon,
  getRandomProduct,
  getDailyProduct
};
