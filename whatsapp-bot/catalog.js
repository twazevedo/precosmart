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

const magTag = (process.env.AFFILIATE_MAGALU || '').toUpperCase();

const COUPONS = [
  { code: 'PRIME15',     store: 'Amazon',        discount: 15,   type: 'fixed',   desc: '-R$\u00a015 para membros Prime'              },
  { code: 'SHOPEE20',    store: 'Shopee',        discount: 20,   type: 'fixed',   desc: '-R$\u00a020 em tech acima de R$\u00a0150'        },
  { code: 'MELI10',      store: 'Mercado Livre', discount: 0.10, type: 'percent', desc: '-10% em lojas oficiais'                 },
  { code: 'SHOPEE50',    store: 'Shopee',        discount: 50,   type: 'fixed',   desc: '-R$\u00a050 acima de R$\u00a0300'               },
  { code: 'AMZNWELCOME', store: 'Amazon',        discount: 0.05, type: 'percent', desc: '-5% extra para novos clientes Prime'    },
  ...(magTag ? [
    { code: `20${magTag}`,  store: 'Magazine Luiza', discount: 20,  type: 'fixed', desc: '-R$\u00a020 exclusivo na nossa loja Magalu' },
    { code: `50${magTag}`,  store: 'Magazine Luiza', discount: 50,  type: 'fixed', desc: '-R$\u00a050 exclusivo na nossa loja Magalu' },
    { code: `100${magTag}`, store: 'Magazine Luiza', discount: 100, type: 'fixed', desc: '-R$\u00a0100 exclusivo na nossa loja Magalu' }
  ] : [])
];

const PRODUCTS = [
  // CELULARES & SMARTPHONES
  { "id": "ip15", "title": "Apple iPhone 15 (128 GB)", "category": "Smartphones", "history30dAvg": 4599, "quotes": [{"store": "Amazon", "pix": 4299}], "shipping": {"Amazon": "Prime"}, "emoji": "📱", "imageUrl": "https://images.unsplash.com/photo-1695048133142-1a20484d2569?q=80&w=600" },
  { "id": "s23", "title": "Samsung Galaxy S23 5G 256GB", "category": "Smartphones", "history30dAvg": 3199, "quotes": [{"store": "Mercado Livre", "pix": 2899}], "shipping": {"Mercado Livre": "Full"}, "emoji": "📱", "imageUrl": "https://images.unsplash.com/photo-1678911820864-e2c567c655d7?q=80&w=600" },
  { "id": "galaxya15", "title": "Smartphone Samsung Galaxy A15 4G 128GB", "category": "Smartphones", "history30dAvg": 899, "quotes": [{"store": "Magazine Luiza", "pix": 789}], "shipping": {"Magazine Luiza": "Frete Grátis"}, "emoji": "📱", "imageUrl": "https://images.unsplash.com/photo-1598327105666-5b89351cb315?q=80&w=600" },
  { "id": "pocox6", "title": "Smartphone POCO X6 Pro 5G", "category": "Smartphones", "history30dAvg": 2299, "quotes": [{"store": "Amazon", "pix": 1999}], "shipping": {"Amazon": "Grátis"}, "emoji": "📱", "imageUrl": "https://images.unsplash.com/photo-1598327105666-5b89351cb315?q=80&w=600" },
  
  // TV & ÁUDIO
  { "id": "tvsamsung50", "title": "Smart TV 50\" Crystal UHD 4K Samsung 50DU7700", "category": "TV & Áudio", "history30dAvg": 2399, "quotes": [{"store": "Magazine Luiza", "pix": 2099}], "shipping": {"Magazine Luiza": "Frete Grátis"}, "emoji": "📺", "imageUrl": "https://images.unsplash.com/photo-1593784991095-a205069470b6?q=80&w=600" },
  { "id": "tvlg43", "title": "Smart TV 43\" Full HD LG ThinQ AI HDR", "category": "TV & Áudio", "history30dAvg": 1699, "quotes": [{"store": "Magazine Luiza", "pix": 1499}], "shipping": {"Magazine Luiza": "Entrega Rápida"}, "emoji": "📺", "imageUrl": "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?q=80&w=600" },

  // GAMES & CONSOLES
  { "id": "ps5", "title": "Console PlayStation 5 Edição Digital", "category": "Games & Consoles", "history30dAvg": 3899, "quotes": [{"store": "Amazon", "pix": 3599}], "shipping": {"Amazon": "Prime"}, "emoji": "🎮", "imageUrl": "https://images.unsplash.com/photo-1606813907291-d86efa9b94db?q=80&w=600" },
  { "id": "xboxs", "title": "Console Xbox Series S 512GB", "category": "Games & Consoles", "history30dAvg": 2399, "quotes": [{"store": "Magazine Luiza", "pix": 2199}], "shipping": {"Magazine Luiza": "Frete Grátis"}, "emoji": "🎮", "imageUrl": "https://images.unsplash.com/photo-1605901309584-818e25960b8f?q=80&w=600" },
  { "id": "dualsense", "title": "Controle Sem Fio DualSense PS5", "category": "Games & Consoles", "history30dAvg": 450, "quotes": [{"store": "Mercado Livre", "pix": 389}], "shipping": {"Mercado Livre": "Full"}, "emoji": "🎮", "imageUrl": "https://images.unsplash.com/photo-1606318801954-d46d46d3360a?q=80&w=600" },

  // ELETRODOMÉSTICOS & COZINHA
  { "id": "airfryermondial", "title": "Fritadeira Sem Óleo Air Fryer Mondial 4L Family Inox", "category": "Eletrodomésticos", "history30dAvg": 349, "quotes": [{"store": "Magazine Luiza", "pix": 269}], "shipping": {"Magazine Luiza": "Frete Grátis"}, "emoji": "🍳", "imageUrl": "https://images.unsplash.com/photo-1621217030807-6c84138a39a7?q=80&w=600" },
  { "id": "lavadorabrastemp", "title": "Lavadora de Roupas Brastemp 12kg Titânio", "category": "Eletrodomésticos", "history30dAvg": 2199, "quotes": [{"store": "Magazine Luiza", "pix": 1899}], "shipping": {"Magazine Luiza": "Entrega Expressa"}, "emoji": "🧺", "imageUrl": "https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?q=80&w=600" },
  { "id": "microondasconsul", "title": "Micro-ondas Consul 20 Litros Branco Espelhado", "category": "Eletrodomésticos", "history30dAvg": 549, "quotes": [{"store": "Magazine Luiza", "pix": 459}], "shipping": {"Magazine Luiza": "Frete Grátis"}, "emoji": "🍲", "imageUrl": "https://images.unsplash.com/photo-1574269909862-7e1d70bb8078?q=80&w=600" },
  { "id": "aspirador", "title": "Aspirador de Pó Robô WAP Robot W100", "category": "Eletrodomésticos", "history30dAvg": 499, "quotes": [{"store": "Amazon", "pix": 399}], "shipping": {"Amazon": "Prime"}, "emoji": "🧹", "imageUrl": "https://images.unsplash.com/photo-1518605368461-1ee51a70014b?q=80&w=600" },

  // CLIMATIZAÇÃO & VENTILAÇÃO
  { "id": "ventilador", "title": "Ventilador de Mesa Mondial Maxi Power 40cm", "category": "Climatização", "history30dAvg": 139, "quotes": [{"store": "Magazine Luiza", "pix": 99}], "shipping": {"Magazine Luiza": "Retira Grátis"}, "emoji": "💨", "imageUrl": "https://images.unsplash.com/photo-1585338107529-13afc5f02586?q=80&w=600" },

  // INFORMÁTICA & PERIFÉRICOS
  { "id": "notebooklenovo", "title": "Notebook Lenovo IdeaPad 1 AMD Ryzen 5 8GB 256GB SSD", "category": "Informática", "history30dAvg": 2499, "quotes": [{"store": "Magazine Luiza", "pix": 2199}], "shipping": {"Magazine Luiza": "Frete Grátis"}, "emoji": "💻", "imageUrl": "https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?q=80&w=600" },
  { "id": "monitorlg", "title": "Monitor LG Ultrawide 29\" Full HD", "category": "Monitores", "history30dAvg": 999, "quotes": [{"store": "Amazon", "pix": 849}], "shipping": {"Amazon": "Prime"}, "emoji": "🖥️", "imageUrl": "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?q=80&w=600" },
  { "id": "ssd1tb", "title": "SSD Kingston NV2 1TB NVMe M.2", "category": "Hardware & PC", "history30dAvg": 450, "quotes": [{"store": "Mercado Livre", "pix": 399}], "shipping": {"Mercado Livre": "Full"}, "emoji": "⚡", "imageUrl": "https://images.unsplash.com/photo-1597848212624-a19eb35e2651?q=80&w=600" },
  { "id": "mouseg203", "title": "Mouse Gamer Logitech G203 RGB", "category": "Periféricos", "history30dAvg": 149, "quotes": [{"store": "Amazon", "pix": 119}], "shipping": {"Amazon": "Prime"}, "emoji": "🖱️", "imageUrl": "https://images.unsplash.com/photo-1595225476474-87563907a212?q=80&w=600" },

  // CASA INTELIGENTE
  { "id": "echodot", "title": "Echo Dot 5ª Geração com Alexa", "category": "Casa Inteligente", "history30dAvg": 349, "quotes": [{"store": "Amazon", "pix": 299}], "shipping": {"Amazon": "Prime"}, "emoji": "🔊", "imageUrl": "https://images.unsplash.com/photo-1543512214-318c7553f230?q=80&w=600" },
  { "id": "lampada", "title": "Lâmpada Inteligente Positivo Smart Wi-Fi", "category": "Casa Inteligente", "history30dAvg": 59, "quotes": [{"store": "Mercado Livre", "pix": 45}], "shipping": {"Mercado Livre": "Full"}, "emoji": "💡", "imageUrl": "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?q=80&w=600" },

  // SAÚDE & SUPLEMENTOS
  { "id": "whey", "title": "Whey Protein Concentrado 1KG - Max Titanium", "category": "Saúde & Suplementos", "history30dAvg": 119, "quotes": [{"store": "Shopee", "pix": 99}], "shipping": {"Shopee": "Frete Grátis"}, "emoji": "💪", "imageUrl": "https://images.unsplash.com/photo-1593095948071-474c5cc2989d?q=80&w=600" },
  { "id": "creatina", "title": "Creatina Monohidratada 250g Growth", "category": "Saúde & Suplementos", "history30dAvg": 89, "quotes": [{"store": "Shopee", "pix": 75}], "shipping": {"Shopee": "Cupom Frete"}, "emoji": "💪", "imageUrl": "https://images.unsplash.com/photo-1579722820308-d74e571900a9?q=80&w=600" },

  // SUPERMERCADO & BEBÊ
  { "id": "fralda", "title": "Fralda Pampers Confort Sec Jumbo (Pague Menos)", "category": "Supermercado", "history30dAvg": 99, "quotes": [{"store": "Amazon", "pix": 79}], "shipping": {"Amazon": "Prime"}, "emoji": "👶", "imageUrl": "https://images.unsplash.com/photo-1555252333-9f8e92e65df9?q=80&w=600" },
  { "id": "sabao", "title": "Sabão Líquido Omo Lavagem Perfeita 3L", "category": "Supermercado", "history30dAvg": 55, "quotes": [{"store": "Mercado Livre", "pix": 42}], "shipping": {"Mercado Livre": "Full"}, "emoji": "🧴", "imageUrl": "https://images.unsplash.com/photo-1585241936939-f2fa0d8299a9?q=80&w=600" }
];


function getAffiliateUrl(store, title) {
  const enc = encodeURIComponent(title);
  switch (store) {
    case 'Amazon':         return `https://www.amazon.com.br/s?k=${enc}&tag=${AFFILIATE.amazon}`;
    case 'Shopee':         return `https://shopee.com.br/search?keyword=${enc}&aff_id=${AFFILIATE.shopee}`;
    case 'Mercado Livre':  return `https://lista.mercadolivre.com.br/${enc}?matt_tool=${AFFILIATE.ml}`;
    case 'Magazine Luiza': {
      const storeSlug = AFFILIATE.magalu ? `magazine${AFFILIATE.magalu.toLowerCase().replace('magazine', '')}` : 'magazinevoce';
      return `https://www.magazinevoce.com.br/${storeSlug}/busca/${enc}/`;
    }
    case 'KaBuM!':         return `https://www.kabum.com.br/busca/${enc}`;
    case 'AliExpress':     return `https://pt.aliexpress.com/wholesale?SearchText=${enc}`;
    default:               return '#';
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
