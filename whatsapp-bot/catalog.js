/**
 * @file catalog.js — PreçoSmart Bot v2.1
 * @description 15 produtos com imageUrl real, 8 cupons, motor de ranking por desconto.
 */
'use strict';

require('./envLoader');

const AFFILIATE = {
  amazon:  process.env.AFFILIATE_AMAZON || '',
  shopee:  process.env.AFFILIATE_SHOPEE || '',
  ml:      process.env.AFFILIATE_ML     || '',
  magalu:  process.env.AFFILIATE_MAGALU  || ''
};

const magTag = (process.env.AFFILIATE_MAGALU || 'PRECOSMARTVIP').toUpperCase();

const COUPONS = [
  // Cupons Gerais
  { code: 'PRIME15',     store: 'Amazon',        discount: 15,   type: 'fixed',   desc: '-R$\u00a015 para membros Prime'              },
  { code: 'SHOPEE20',    store: 'Shopee',        discount: 20,   type: 'fixed',   desc: '-R$\u00a020 em tech acima de R$\u00a0150'        },
  { code: 'MELI10',      store: 'Mercado Livre', discount: 0.10, type: 'percent', desc: '-10% em lojas oficiais'                 },
  { code: 'SHOPEE50',    store: 'Shopee',        discount: 50,   type: 'fixed',   desc: '-R$\u00a050 acima de R$\u00a0300'               },
  { code: 'AMZNWELCOME', store: 'Amazon',        discount: 0.05, type: 'percent', desc: '-5% extra para novos clientes Prime'    },

  // Cupons Oficiais da Central do Magazine Luiza
  { code: 'BEMVINDO20',  store: 'Magazine Luiza', discount: 20,   type: 'fixed',   min: 80,   desc: '-R$\u00a020 OFF em compras acima de R$\u00a080' },
  { code: 'PET10',       store: 'Magazine Luiza', discount: 0.10, type: 'percent', category: 'Petshop', desc: '-10% OFF em Petshop' },
  { code: 'FARMACIA10',  store: 'Magazine Luiza', discount: 0.10, type: 'percent', category: 'Farmácia & Bebê', desc: '-10% OFF em Farmácia e Fraldas' },
  { code: 'BELEZA10',    store: 'Magazine Luiza', discount: 0.10, type: 'percent', category: 'Beleza & Perfumaria', desc: '-10% OFF em Beleza e Perfumaria' },
  { code: 'ASICS10',     store: 'Magazine Luiza', discount: 0.10, type: 'percent', category: 'Calçados & Esporte', desc: '-10% OFF em Tênis Asics' },

  // Cupons Oficiais Negociados do Grupo PreçoSmart VIP
  { code: `10${magTag}`, store: 'Magazine Luiza', discount: 10,  type: 'fixed',   min: 499,  desc: '-R$\u00a010 OFF acima de R$\u00a0499 exclusivo' },
  { code: `20${magTag}`, store: 'Magazine Luiza', discount: 20,  type: 'fixed',   min: 999,  desc: '-R$\u00a020 OFF acima de R$\u00a0999 exclusivo' },
  { code: `30${magTag}`, store: 'Magazine Luiza', discount: 30,  type: 'fixed',   min: 1499, desc: '-R$\u00a030 OFF acima de R$\u00a01.499 exclusivo' },
  { code: `50${magTag}`, store: 'Magazine Luiza', discount: 50,  type: 'fixed',   min: 1999, desc: '-R$\u00a050 OFF acima de R$\u00a01.999 exclusivo' },
  { code: `100${magTag}`,store: 'Magazine Luiza', discount: 100, type: 'fixed',   min: 2999, desc: '-R$\u00a0100 OFF acima de R$\u00a02.999 exclusivo' }
];

const PRODUCTS = [
  // CELULARES & SMARTPHONES (MAGALU COM VÍDEO OFICIAL DO DRIVE)
  { 
    "id": "galaxya15", 
    "title": "Smartphone Samsung Galaxy A15 4G 128GB", 
    "category": "Smartphones", 
    "history30dAvg": 899, 
    "quotes": [{"store": "Magazine Luiza", "pix": 789}], 
    "shipping": {"Magazine Luiza": "Frete Grátis ou Retire na Loja"}, 
    "emoji": "📱", 
    "imageUrl": "https://drive.google.com/thumbnail?id=13nOxQkzhb_8-ZtGeCx7J7X9Ak5I44f2L&sz=w1000",
    "videoUrl": "https://drive.google.com/uc?export=download&id=1AEABA9KChK58YGCLFI3wdSNc8DcEMQg8"
  },
  { 
    "id": "galaxya55", 
    "title": "Smartphone Samsung Galaxy A55 5G 128GB", 
    "category": "Smartphones", 
    "history30dAvg": 1999, 
    "quotes": [{"store": "Magazine Luiza", "pix": 1699}], 
    "shipping": {"Magazine Luiza": "Entrega Expressa Magalu"}, 
    "emoji": "📱", 
    "imageUrl": "https://drive.google.com/thumbnail?id=13nEvCti6nBOCGEjHRwIaZQDbxYrN-taq&sz=w1000",
    "videoUrl": "https://drive.google.com/uc?export=download&id=1Fq3XPd3smP6f154ajHmYtxg_MPXKI67s"
  },
  { "id": "ip15", "title": "Apple iPhone 15 (128 GB)", "category": "Smartphones", "history30dAvg": 4599, "quotes": [{"store": "Amazon", "pix": 4299}], "shipping": {"Amazon": "Prime"}, "emoji": "📱", "imageUrl": "https://images.unsplash.com/photo-1695048133142-1a20484d2569?q=80&w=600" },
  { "id": "s23", "title": "Samsung Galaxy S23 5G 256GB", "category": "Smartphones", "history30dAvg": 3199, "quotes": [{"store": "Mercado Livre", "pix": 2899}], "shipping": {"Mercado Livre": "Full"}, "emoji": "📱", "imageUrl": "https://images.unsplash.com/photo-1678911820864-e2c567c655d7?q=80&w=600" },
  
  // TV & ÁUDIO (MAGALU DESTAQUES COM TEMPLATE OFICIAL DRIVE)
  { 
    "id": "tvsamsung50", 
    "title": "Smart TV 50\" Crystal UHD 4K Samsung 50DU7700", 
    "category": "TV & Áudio", 
    "history30dAvg": 2399, 
    "quotes": [{"store": "Magazine Luiza", "pix": 2099}], 
    "shipping": {"Magazine Luiza": "Frete Grátis Magalu"}, 
    "emoji": "📺", 
    "imageUrl": "https://drive.google.com/thumbnail?id=13juIKNEEQvE7sLMUg8FO-sH_x9cJ2eXx&sz=w1000" 
  },
  { 
    "id": "tvlg43", 
    "title": "Smart TV 43\" Full HD LG ThinQ AI HDR", 
    "category": "TV & Áudio", 
    "history30dAvg": 1699, 
    "quotes": [{"store": "Magazine Luiza", "pix": 1499}], 
    "shipping": {"Magazine Luiza": "Entrega Rápida"}, 
    "emoji": "📺", 
    "imageUrl": "https://drive.google.com/thumbnail?id=13ga7_65E_57nQAVxuvgqXgwpQDrJ-vd0&sz=w1000" 
  },

  // BELEZA & PERFUMARIA (COM VÍDEO OFICIAL DO DRIVE)
  { 
    "id": "secadorgama", 
    "title": "Secador de Cabelos Gama Lichia Ceramic Ion 2100W Vermelho", 
    "category": "Beleza & Perfumaria", 
    "history30dAvg": 199, 
    "quotes": [{"store": "Magazine Luiza", "pix": 149}], 
    "shipping": {"Magazine Luiza": "Entrega Rápida Magalu"}, 
    "emoji": "💇‍♀️", 
    "imageUrl": "https://drive.google.com/thumbnail?id=13pRIgjRy2aT5d3YcJmYyXENjThY8tK3o&sz=w1000",
    "videoUrl": "https://drive.google.com/uc?export=download&id=1UMiNSUZVMFAEm-KxdwdARnZKbH0oOje0"
  },
  { 
    "id": "pranchagama", 
    "title": "Chapinha Prancha de Cabelo Gama Ergostyler Babosa Ceramic Ion Bivolt", 
    "category": "Beleza & Perfumaria", 
    "history30dAvg": 149, 
    "quotes": [{"store": "Magazine Luiza", "pix": 109}], 
    "shipping": {"Magazine Luiza": "Retira Grátis na Loja"}, 
    "emoji": "✨", 
    "imageUrl": "https://drive.google.com/thumbnail?id=13qNmL-BOzUSGi-gow-DdxThvjb0P4ZYb&sz=w1000",
    "videoUrl": "https://drive.google.com/uc?export=download&id=1Uxm0mRy3rAFX5JIvtjkDmOyFPpZj2uKF"
  },

  // ELETRODOMÉSTICOS & COZINHA (COM VÍDEO E TEMPLATE OFICIAL DRIVE)
  { 
    "id": "airfryermondial", 
    "title": "Fritadeira Sem Óleo Air Fryer Mondial 4L Family Inox", 
    "category": "Eletrodomésticos", 
    "history30dAvg": 349, 
    "quotes": [{"store": "Magazine Luiza", "pix": 269}], 
    "shipping": {"Magazine Luiza": "Frete Grátis ou Retire na Loja"}, 
    "emoji": "🍳", 
    "imageUrl": "https://drive.google.com/thumbnail?id=13nOxQkzhb_8-ZtGeCx7J7X9Ak5I44f2L&sz=w1000",
    "videoUrl": "https://drive.google.com/uc?export=download&id=1jD6XgK0SnXZhWpYmfmEIb0zRo4oDwaoc"
  },
  { 
    "id": "lavadorabrastemp", 
    "title": "Lavadora de Roupas Brastemp 12kg Titânio", 
    "category": "Eletrodomésticos", 
    "history30dAvg": 2199, 
    "quotes": [{"store": "Magazine Luiza", "pix": 1899}], 
    "shipping": {"Magazine Luiza": "Entrega Especial Magalu"}, 
    "emoji": "🧺", 
    "imageUrl": "https://drive.google.com/thumbnail?id=13nEvCti6nBOCGEjHRwIaZQDbxYrN-taq&sz=w1000",
    "videoUrl": "https://drive.google.com/uc?export=download&id=1GgQwXCDK_-FtR2eDJd8zZiBflQS2WvDt"
  },
  { 
    "id": "microondasconsul", 
    "title": "Micro-ondas Consul 20 Litros Branco Espelhado", 
    "category": "Eletrodomésticos", 
    "history30dAvg": 549, 
    "quotes": [{"store": "Magazine Luiza", "pix": 459}], 
    "shipping": {"Magazine Luiza": "Retira Grátis na Loja"}, 
    "emoji": "🍲", 
    "imageUrl": "https://drive.google.com/thumbnail?id=13juIKNEEQvE7sLMUg8FO-sH_x9cJ2eXx&sz=w1000" 
  },

  // CLIMATIZAÇÃO & VENTILAÇÃO (COM VÍDEO OFICIAL DRIVE)
  { 
    "id": "ventilador", 
    "title": "Ventilador de Mesa Mondial Maxi Power 40cm", 
    "category": "Climatização", 
    "history30dAvg": 139, 
    "quotes": [{"store": "Magazine Luiza", "pix": 99}], 
    "shipping": {"Magazine Luiza": "Retira Grátis"}, 
    "emoji": "💨", 
    "imageUrl": "https://drive.google.com/thumbnail?id=13pRIgjRy2aT5d3YcJmYyXENjThY8tK3o&sz=w1000",
    "videoUrl": "https://drive.google.com/uc?export=download&id=1crvkS1t5-6G1PiTBiswScZe5Yb_1H4z8"
  },

  // CALÇADOS & ESPORTE (CUPOM ASICS10 COM TEMPLATE OFICIAL DRIVE)
  { 
    "id": "asicsgel", 
    "title": "Tênis Asics Gel Shogun 6 Masculino Amortecimento", 
    "category": "Calçados & Esporte", 
    "history30dAvg": 399, 
    "quotes": [{"store": "Magazine Luiza", "pix": 319}], 
    "shipping": {"Magazine Luiza": "Frete Grátis"}, 
    "emoji": "👟", 
    "imageUrl": "https://drive.google.com/thumbnail?id=13ga7_65E_57nQAVxuvgqXgwpQDrJ-vd0&sz=w1000" 
  },

  // PETSHOP (CUPOM PET10 COM TEMPLATE OFICIAL DRIVE)
  { 
    "id": "goldenpet", 
    "title": "Ração Seca PremieR Golden Special Cães Adultos Frango e Carne 15kg", 
    "category": "Petshop", 
    "history30dAvg": 169, 
    "quotes": [{"store": "Magazine Luiza", "pix": 149}], 
    "shipping": {"Magazine Luiza": "Entrega Rápida"}, 
    "emoji": "🐶", 
    "imageUrl": "https://drive.google.com/thumbnail?id=13qNmL-BOzUSGi-gow-DdxThvjb0P4ZYb&sz=w1000" 
  },

  // FARMÁCIA & BEBÊ (CUPOM FARMACIA10 COM TEMPLATE OFICIAL DRIVE)
  { 
    "id": "pampershiper", 
    "title": "Fralda Pampers Confort Sec Hiper Tamanho G", 
    "category": "Farmácia & Bebê", 
    "history30dAvg": 119, 
    "quotes": [{"store": "Magazine Luiza", "pix": 89}], 
    "shipping": {"Magazine Luiza": "Retira Grátis"}, 
    "emoji": "👶", 
    "imageUrl": "https://drive.google.com/thumbnail?id=13nOxQkzhb_8-ZtGeCx7J7X9Ak5I44f2L&sz=w1000" 
  },

  // INFORMÁTICA & GAMES (MAGALU TEMPLATES DRIVE)
  { 
    "id": "notebooklenovo", 
    "title": "Notebook Lenovo IdeaPad 1 AMD Ryzen 5 8GB 256GB SSD", 
    "category": "Informática", 
    "history30dAvg": 2499, 
    "quotes": [{"store": "Magazine Luiza", "pix": 2199}], 
    "shipping": {"Magazine Luiza": "Frete Grátis"}, 
    "emoji": "💻", 
    "imageUrl": "https://drive.google.com/thumbnail?id=13nEvCti6nBOCGEjHRwIaZQDbxYrN-taq&sz=w1000" 
  },
  { 
    "id": "xboxs", 
    "title": "Console Xbox Series S 512GB", 
    "category": "Games & Consoles", 
    "history30dAvg": 2399, 
    "quotes": [{"store": "Magazine Luiza", "pix": 2199}], 
    "shipping": {"Magazine Luiza": "Frete Grátis"}, 
    "emoji": "🎮", 
    "imageUrl": "https://drive.google.com/thumbnail?id=13juIKNEEQvE7sLMUg8FO-sH_x9cJ2eXx&sz=w1000" 
  },
  { "id": "ps5", "title": "Console PlayStation 5 Edição Digital", "category": "Games & Consoles", "history30dAvg": 3899, "quotes": [{"store": "Amazon", "pix": 3599}], "shipping": {"Amazon": "Prime"}, "emoji": "🎮", "imageUrl": "https://images.unsplash.com/photo-1606813907291-d86efa9b94db?q=80&w=600" }
];


function getAffiliateUrl(store, title) {
  const enc = encodeURIComponent(title);
  switch (store) {
    case 'Amazon':         return `https://www.amazon.com.br/s?k=${enc}&tag=${AFFILIATE.amazon}`;
    case 'Shopee':         return `https://shopee.com.br/search?keyword=${enc}&aff_id=${AFFILIATE.shopee}`;
    case 'Mercado Livre':  return `https://lista.mercadolivre.com.br/${enc}?matt_tool=${AFFILIATE.ml}`;
    case 'Magazine Luiza': {
      const storeSlug = AFFILIATE.magalu ? `magazine${AFFILIATE.magalu.toLowerCase().replace('magazine', '')}` : 'magazineprecosmartvip';
      return `https://www.magazinevoce.com.br/${storeSlug}/busca/${enc}/`;
    }
    case 'KaBuM!':         return `https://www.kabum.com.br/busca/${enc}`;
    case 'AliExpress':     return `https://pt.aliexpress.com/wholesale?SearchText=${enc}`;
    default:               return '#';
  }
}

function getBestCoupon(cheapestStore, pixPrice, product = {}) {
  const matching = COUPONS.filter((c) => {
    if (c.store !== cheapestStore) return false;
    if (c.min && pixPrice < c.min) return false;
    if (c.category && product.category && product.category !== c.category) return false;
    return true;
  });

  if (matching.length === 0) return null;

  let best = null;
  let maxSaving = 0;
  for (const c of matching) {
    const s = c.type === 'percent' ? pixPrice * c.discount : c.discount;
    if (s > maxSaving) {
      maxSaving = s;
      best = c;
    }
  }

  if (!best) return null;
  const saving = parseFloat(maxSaving.toFixed(2));
  return {
    code: best.code,
    store: best.store,
    finalPrice: parseFloat((pixPrice - saving).toFixed(2)),
    saving,
    desc: best.desc
  };
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

let magaluQueue = [];
let lastMagaluId = null;

function getNextMagaluProduct() {
  const magaluProducts = PRODUCTS.filter(p => p.quotes.some(q => q.store === 'Magazine Luiza'));
  if (magaluProducts.length === 0) return null;

  if (magaluQueue.length === 0) {
    const shuffled = [...magaluProducts].sort(() => Math.random() - 0.5);
    if (lastMagaluId && shuffled[0].id === lastMagaluId && shuffled.length > 1) {
      shuffled.push(shuffled.shift());
    }
    magaluQueue = shuffled;
  }

  const product = magaluQueue.shift();
  lastMagaluId = product.id;
  return product;
}

module.exports = { 
  PRODUCTS, 
  COUPONS, 
  AFFILIATE, 
  getAffiliateUrl, 
  getBestCoupon, 
  getTopDeals, 
  getDailyProduct, 
  getRandomProduct, 
  getProductByCategories,
  getNextMagaluProduct
};
