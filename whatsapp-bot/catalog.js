/**
 * @file catalog.js — PreçoSmart Bot v2.1
 * @description 15 produtos com imageUrl real, 8 cupons, motor de ranking por desconto.
 */
'use strict';

const AFFILIATE = {
  amazon:  'precosmartapp-20',
  shopee:  '18361251220',
  ml:      'azs5603820'
};

const COUPONS = [
  { code: 'PRIME15',     store: 'Amazon',        discount: 15,   type: 'fixed',   desc: '-R$\u00a015 para membros Prime'              },
  { code: 'SHOPEE20',    store: 'Shopee',        discount: 20,   type: 'fixed',   desc: '-R$\u00a020 em tech acima de R$\u00a0150'        },
  { code: 'MELI10',      store: 'Mercado Livre', discount: 0.10, type: 'percent', desc: '-10% em lojas oficiais'                 },
  { code: 'SHOPEE50',    store: 'Shopee',        discount: 50,   type: 'fixed',   desc: '-R$\u00a050 acima de R$\u00a0300'               },
  { code: 'AMZNWELCOME', store: 'Amazon',        discount: 0.05, type: 'percent', desc: '-5% extra para novos clientes Prime'    }
];

const PRODUCTS = [
  {
    id: 'rtx-4060', emoji: '🎮',
    title: 'Placa de Vídeo GeForce RTX 4060 8GB GDDR6',
    category: 'Hardware & PC',
    history30dAvg: 2089, history30dMin: 2199,
    imageUrl: 'https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?q=80&w=600',
    quotes: [
      { store: 'Mercado Livre', pix: 1999.00, card: 2149.00, installments: 10 },
      { store: 'Amazon',        pix: 2049.00, card: 2049.00, installments: 10 },
      { store: 'Shopee',        pix: 2099.00, card: 2249.00, installments: 10 }
    ],
    shipping: { 'Amazon': 'Prime Grátis', 'Mercado Livre': 'Full ML (Amanhã)', 'Shopee': 'Frete Grátis' }
  },
  {
    id: 'iphone-15', emoji: '📱',
    title: 'Smartphone Apple iPhone 15 128GB',
    category: 'Smartphones',
    history30dAvg: 4799, history30dMin: 4899,
    imageUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=600',
    quotes: [
      { store: 'Mercado Livre', pix: 4749.00, card: 4999.00, installments: 10 },
      { store: 'Shopee',        pix: 4799.00, card: 4999.00, installments: 10 },
      { store: 'Amazon',        pix: 4899.00, card: 4899.00, installments: 10 }
    ],
    shipping: { 'Amazon': 'Prime Grátis', 'Mercado Livre': 'Full ML (Amanhã)', 'Shopee': 'Frete Grátis' }
  },
  {
    id: 'ps5-slim', emoji: '🕹️',
    title: 'Console PlayStation 5 Slim 1TB com Leitor',
    category: 'Games & Consoles',
    history30dAvg: 3649, history30dMin: 3799,
    imageUrl: 'https://images.unsplash.com/photo-1486401899868-0e435ed85128?q=80&w=600',
    quotes: [
      { store: 'Shopee',        pix: 3499.00, card: 3799.00, installments: 10 },
      { store: 'Amazon',        pix: 3599.00, card: 3599.00, installments: 10 },
      { store: 'Mercado Livre', pix: 3649.00, card: 3849.00, installments: 10 }
    ],
    shipping: { 'Shopee': 'Frete Grátis', 'Amazon': 'Prime Grátis', 'Mercado Livre': 'Full ML (Amanhã)' }
  },
  {
    id: 'smart-tv-55', emoji: '📺',
    title: 'Smart TV 55" 4K QLED Samsung Crystal',
    category: 'TV & Vídeo',
    history30dAvg: 2649, history30dMin: 2799,
    imageUrl: 'https://images.unsplash.com/photo-1593640408182-31c70c8268f5?q=80&w=600',
    quotes: [
      { store: 'Amazon',        pix: 2499.00, card: 2499.00, installments: 10 },
      { store: 'Mercado Livre', pix: 2549.00, card: 2699.00, installments: 10 },
      { store: 'Shopee',        pix: 2599.00, card: 2799.00, installments: 10 }
    ],
    shipping: { 'Amazon': 'Prime Grátis', 'Mercado Livre': 'Full ML (Amanhã)', 'Shopee': 'Frete Grátis' }
  },
  {
    id: 'monitor-ultragear', emoji: '🖥️',
    title: 'Monitor Gamer LG UltraGear 27" 144Hz 1ms IPS',
    category: 'Monitores',
    history30dAvg: 1189, history30dMin: 1299,
    imageUrl: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?q=80&w=600',
    quotes: [
      { store: 'Mercado Livre', pix: 1189.00, card: 1249.00, installments: 10 },
      { store: 'Shopee',        pix: 1199.00, card: 1299.00, installments: 10 },
      { store: 'Amazon',        pix: 1249.00, card: 1249.00, installments: 10 }
    ],
    shipping: { 'Mercado Livre': 'Full ML (Amanhã)', 'Shopee': 'Frete Grátis', 'Amazon': 'Prime Grátis' }
  },
  {
    id: 'ssd-nvme-1tb', emoji: '💾',
    title: 'SSD NVMe M.2 1TB Kingston NV2 PCIe 4.0',
    category: 'Hardware & PC',
    history30dAvg: 319, history30dMin: 349,
    imageUrl: 'https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?q=80&w=600',
    quotes: [
      { store: 'Shopee',        pix: 319.00,  card: 339.00,  installments: 10 },
      { store: 'Mercado Livre', pix: 359.00,  card: 389.00,  installments: 10 },
      { store: 'Amazon',        pix: 379.00,  card: 379.00,  installments: 10 }
    ],
    shipping: { 'Shopee': 'Frete Grátis', 'Mercado Livre': 'Full ML (Amanhã)', 'Amazon': 'Prime Grátis' }
  },
  {
    id: 'nintendo-switch-oled', emoji: '🎮',
    title: 'Nintendo Switch OLED 64GB Branco',
    category: 'Games & Consoles',
    history30dAvg: 2349, history30dMin: 2499,
    imageUrl: 'https://images.unsplash.com/photo-1486401899868-0e435ed85128?q=80&w=600',
    quotes: [
      { store: 'Shopee',        pix: 2249.00, card: 2499.00, installments: 10 },
      { store: 'Amazon',        pix: 2299.00, card: 2299.00, installments: 10 },
      { store: 'Mercado Livre', pix: 2349.00, card: 2499.00, installments: 10 }
    ],
    shipping: { 'Shopee': 'Frete Grátis', 'Amazon': 'Prime Grátis', 'Mercado Livre': 'Full ML (Amanhã)' }
  },
  {
    id: 'headset-wh1000xm5', emoji: '🎧',
    title: 'Fone Sony WH-1000XM5 Noise Cancelling Bluetooth',
    category: 'Áudio',
    history30dAvg: 1449, history30dMin: 1599,
    imageUrl: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?q=80&w=600',
    quotes: [
      { store: 'Amazon',        pix: 1299.00, card: 1299.00, installments: 10 },
      { store: 'Mercado Livre', pix: 1399.00, card: 1499.00, installments: 10 },
      { store: 'Shopee',        pix: 1449.00, card: 1549.00, installments: 10 }
    ],
    shipping: { 'Amazon': 'Prime Grátis', 'Mercado Livre': 'Full ML (Amanhã)', 'Shopee': 'Frete Grátis' }
  },
  {
    id: 'galaxy-s24-ultra', emoji: '📲',
    title: 'Samsung Galaxy S24 Ultra 256GB Titanium',
    category: 'Smartphones',
    history30dAvg: 6299, history30dMin: 6799,
    imageUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=600',
    quotes: [
      { store: 'Amazon',        pix: 5799.00, card: 5799.00, installments: 10 },
      { store: 'Mercado Livre', pix: 5899.00, card: 6199.00, installments: 10 },
      { store: 'Shopee',        pix: 6099.00, card: 6399.00, installments: 10 }
    ],
    shipping: { 'Amazon': 'Prime Grátis', 'Mercado Livre': 'Full ML (Amanhã)', 'Shopee': 'Frete Grátis' }
  },
  {
    id: 'notebook-dell-g15', emoji: '💻',
    title: 'Notebook Dell G15 i5-12500H RTX 3050 16GB 512GB',
    category: 'Notebooks',
    history30dAvg: 3849, history30dMin: 4199,
    imageUrl: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?q=80&w=600',
    quotes: [
      { store: 'Amazon',        pix: 3499.00, card: 3499.00, installments: 10 },
      { store: 'Mercado Livre', pix: 3699.00, card: 3999.00, installments: 10 },
      { store: 'Shopee',        pix: 3799.00, card: 3999.00, installments: 10 }
    ],
    shipping: { 'Amazon': 'Prime Grátis', 'Mercado Livre': 'Full ML (Amanhã)', 'Shopee': 'Frete Grátis' }
  },
  {
    id: 'airpods-pro-2', emoji: '🎵',
    title: 'Apple AirPods Pro 2ª Geração com MagSafe',
    category: 'Áudio',
    history30dAvg: 1749, history30dMin: 1999,
    imageUrl: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?q=80&w=600',
    quotes: [
      { store: 'Amazon',        pix: 1549.00, card: 1549.00, installments: 10 },
      { store: 'Mercado Livre', pix: 1649.00, card: 1799.00, installments: 10 },
      { store: 'Shopee',        pix: 1749.00, card: 1899.00, installments: 10 }
    ],
    shipping: { 'Amazon': 'Prime Grátis', 'Mercado Livre': 'Full ML (Amanhã)', 'Shopee': 'Frete Grátis' }
  },
  {
    id: 'ryzen-5-7600x', emoji: '🔧',
    title: 'Processador AMD Ryzen 5 7600X 6-Core 4.7GHz AM5',
    category: 'Hardware & PC',
    history30dAvg: 1249, history30dMin: 1399,
    imageUrl: 'https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?q=80&w=600',
    quotes: [
      { store: 'Shopee',        pix: 1199.00, card: 1299.00, installments: 10 },
      { store: 'Amazon',        pix: 1249.00, card: 1249.00, installments: 10 },
      { store: 'Mercado Livre', pix: 1299.00, card: 1399.00, installments: 10 }
    ],
    shipping: { 'Shopee': 'Frete Grátis', 'Amazon': 'Prime Grátis', 'Mercado Livre': 'Full ML (Amanhã)' }
  },
  {
    id: 'xiaomi-14-ultra', emoji: '📷',
    title: 'Xiaomi 14 Ultra 512GB Câmera Leica 5G',
    category: 'Smartphones',
    history30dAvg: 5499, history30dMin: 5999,
    imageUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=600',
    quotes: [
      { store: 'Shopee',        pix: 4999.00, card: 5299.00, installments: 10 },
      { store: 'Mercado Livre', pix: 5199.00, card: 5499.00, installments: 10 },
      { store: 'Amazon',        pix: 5399.00, card: 5399.00, installments: 10 }
    ],
    shipping: { 'Shopee': 'Frete Grátis', 'Mercado Livre': 'Full ML (Amanhã)', 'Amazon': 'Prime Grátis' }
  },
  {
    id: 'kindle-scribe', emoji: '📚',
    title: 'Amazon Kindle Scribe 32GB com Caneta Premium',
    category: 'E-readers & Tablets',
    history30dAvg: 1399, history30dMin: 1599,
    imageUrl: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?q=80&w=600',
    quotes: [
      { store: 'Amazon',        pix: 1199.00, card: 1199.00, installments: 10 },
      { store: 'Mercado Livre', pix: 1299.00, card: 1399.00, installments: 10 },
      { store: 'Shopee',        pix: 1349.00, card: 1499.00, installments: 10 }
    ],
    shipping: { 'Amazon': 'Prime Grátis', 'Mercado Livre': 'Full ML (Amanhã)', 'Shopee': 'Frete Grátis' }
  },
  {
    id: 'gopro-hero13', emoji: '🎥',
    title: 'Câmera de Ação GoPro HERO 13 Black 5.3K',
    category: 'Câmeras & Drones',
    history30dAvg: 2649, history30dMin: 2999,
    imageUrl: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?q=80&w=600',
    quotes: [
      { store: 'Amazon',        pix: 2299.00, card: 2299.00, installments: 10 },
      { store: 'Mercado Livre', pix: 2499.00, card: 2699.00, installments: 10 },
      { store: 'Shopee',        pix: 2599.00, card: 2799.00, installments: 10 }
    ],
    shipping: { 'Amazon': 'Prime Grátis', 'Mercado Livre': 'Full ML (Amanhã)', 'Shopee': 'Frete Grátis' }
  },
  {
    id: 'apple-watch-se', emoji: '⌚',
    title: 'Apple Watch SE 2ª Geração GPS 40mm',
    category: 'Smartwatches',
    history30dAvg: 1999, history30dMin: 1899,
    imageUrl: 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?q=80&w=600',
    quotes: [
      { store: 'Amazon',        pix: 1899.00, card: 1999.00, installments: 10 },
      { store: 'Mercado Livre', pix: 1949.00, card: 2049.00, installments: 10 },
      { store: 'Shopee',        pix: 1999.00, card: 2099.00, installments: 10 }
    ],
    shipping: { 'Amazon': 'Prime Grátis', 'Mercado Livre': 'Full ML (Amanhã)', 'Shopee': 'Frete Grátis' }
  },
  {
    id: 'robo-aspirador', emoji: '🧹',
    title: 'Robô Aspirador de Pó Inteligente Smart 700',
    category: 'Eletrodomésticos',
    history30dAvg: 1299, history30dMin: 1199,
    imageUrl: 'https://images.unsplash.com/photo-1518605368461-1ee51a70014b?q=80&w=600',
    quotes: [
      { store: 'Mercado Livre', pix: 1199.00, card: 1299.00, installments: 10 },
      { store: 'Amazon',        pix: 1249.00, card: 1349.00, installments: 10 },
      { store: 'Shopee',        pix: 1299.00, card: 1399.00, installments: 10 }
    ],
    shipping: { 'Mercado Livre': 'Full ML (Amanhã)', 'Amazon': 'Prime Grátis', 'Shopee': 'Frete Grátis' }
  },
  {
    id: 'echo-dot-5', emoji: '🔊',
    title: 'Echo Dot 5ª Geração com Alexa',
    category: 'Casa Inteligente',
    history30dAvg: 349, history30dMin: 299,
    imageUrl: 'https://images.unsplash.com/photo-1543512214-318c7553f230?q=80&w=600',
    quotes: [
      { store: 'Amazon',        pix: 299.00, card: 319.00, installments: 12 },
      { store: 'Mercado Livre', pix: 329.00, card: 349.00, installments: 10 },
      { store: 'Shopee',        pix: 349.00, card: 369.00, installments: 10 }
    ],
    shipping: { 'Amazon': 'Prime Grátis', 'Mercado Livre': 'Full ML (Amanhã)', 'Shopee': 'Frete Grátis' }
  },
  {
    id: 'logitech-mx', emoji: '🖱️',
    title: 'Mouse Sem Fio Logitech MX Master 3S',
    category: 'Periféricos',
    history30dAvg: 649, history30dMin: 599,
    imageUrl: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?q=80&w=600',
    quotes: [
      { store: 'Amazon',        pix: 599.00, card: 629.00, installments: 10 },
      { store: 'Mercado Livre', pix: 619.00, card: 649.00, installments: 10 },
      { store: 'Shopee',        pix: 649.00, card: 699.00, installments: 10 }
    ],
    shipping: { 'Amazon': 'Prime Grátis', 'Mercado Livre': 'Full ML (Amanhã)', 'Shopee': 'Frete Grátis' }
  },
  {
    id: 'air-fryer', emoji: '🍟',
    title: 'Fritadeira Airfryer Philips Walita Essential',
    category: 'Eletrodomésticos',
    history30dAvg: 499, history30dMin: 449,
    imageUrl: 'https://images.unsplash.com/photo-1621217030807-6c84138a39a7?q=80&w=600',
    quotes: [
      { store: 'Mercado Livre', pix: 449.00, card: 499.00, installments: 10 },
      { store: 'Amazon',        pix: 479.00, card: 499.00, installments: 10 },
      { store: 'Shopee',        pix: 499.00, card: 549.00, installments: 10 }
    ],
    shipping: { 'Mercado Livre': 'Full ML (Amanhã)', 'Amazon': 'Prime Grátis', 'Shopee': 'Frete Grátis' }
  }
];

function getAffiliateUrl(store, title) {
  const enc = encodeURIComponent(title);
  switch (store) {
    case 'Amazon':        return `https://www.amazon.com.br/s?k=${enc}&tag=${AFFILIATE.amazon}`;
    case 'Shopee':        return `https://shopee.com.br/search?keyword=${enc}&aff_id=${AFFILIATE.shopee}`;
    case 'Mercado Livre': return `https://lista.mercadolivre.com.br/${enc}?matt_tool=${AFFILIATE.ml}`;
    case 'KaBuM!':        return `https://www.kabum.com.br/busca/${enc}`;
    case 'AliExpress':    return `https://pt.aliexpress.com/wholesale?SearchText=${enc}`;
    default:              return '#';
  }
}

function getBestCoupon(cheapestStore, pixPrice) {
  const storeCoupon = COUPONS.find((c) => c.store === cheapestStore);
  const bestGeneric = COUPONS.reduce((best, c) => {
    const s  = c.type === 'percent' ? pixPrice * c.discount : c.discount;
    const bs = best ? (best.type === 'percent' ? pixPrice * best.discount : best.discount) : 0;
    return s > bs ? c : best;
  }, null);
  const coupon = storeCoupon || bestGeneric;
  if (!coupon) return null;
  const saving = coupon.type === 'percent'
    ? parseFloat((pixPrice * coupon.discount).toFixed(2))
    : coupon.discount;
  return { code: coupon.code, store: coupon.store, finalPrice: parseFloat((pixPrice - saving).toFixed(2)), saving, desc: coupon.desc };
}

function getTopDeals(n = 3) {
  return [...PRODUCTS]
    .map((p) => {
      const cheapest = [...p.quotes].sort((a, b) => a.pix - b.pix)[0];
      const discPct  = ((p.history30dAvg - cheapest.pix) / p.history30dAvg) * 100;
      return { ...p, cheapest, discPct };
    })
    .sort((a, b) => b.discPct - a.discPct)
    .slice(0, n);
}

function getDailyProduct() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86_400_000);
  return PRODUCTS[dayOfYear % PRODUCTS.length];
}

function getRandomProduct(excludeId = null) {
  const pool = excludeId ? PRODUCTS.filter((p) => p.id !== excludeId) : PRODUCTS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getProductByCategories(categories) {
  const pool = PRODUCTS.filter((p) => categories.includes(p.category));
  if (pool.length === 0) return getRandomProduct();
  return pool[Math.floor(Math.random() * pool.length)];
}

module.exports = { PRODUCTS, COUPONS, AFFILIATE, getAffiliateUrl, getBestCoupon, getTopDeals, getDailyProduct, getRandomProduct, getProductByCategories };
