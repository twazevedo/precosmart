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

const COUPONS = [
  { code: 'PRIME15',     store: 'Amazon',        discount: 15,   type: 'fixed',   desc: '-R$\u00a015 para membros Prime'              },
  { code: 'SHOPEE20',    store: 'Shopee',        discount: 20,   type: 'fixed',   desc: '-R$\u00a020 em tech acima de R$\u00a0150'        },
  { code: 'MELI10',      store: 'Mercado Livre', discount: 0.10, type: 'percent', desc: '-10% em lojas oficiais'                 },
  { code: 'SHOPEE50',    store: 'Shopee',        discount: 50,   type: 'fixed',   desc: '-R$\u00a050 acima de R$\u00a0300'               },
  { code: 'AMZNWELCOME', store: 'Amazon',        discount: 0.05, type: 'percent', desc: '-5% extra para novos clientes Prime'    }
];

const PRODUCTS = [
  // CELULARES
  { "id": "ip15", "title": "Apple iPhone 15 (128 GB)", "category": "Smartphones", "history30dAvg": 4599, "quotes": [{"store": "Amazon", "pix": 4299}], "shipping": {"Amazon": "Prime"}, "emoji": "🔥", "imageUrl": "https://images.unsplash.com/photo-1695048133142-1a20484d2569?q=80&w=600" },
  { "id": "s23", "title": "Samsung Galaxy S23 5G 256GB", "category": "Smartphones", "history30dAvg": 3199, "quotes": [{"store": "Mercado Livre", "pix": 2899}], "shipping": {"Mercado Livre": "Full"}, "emoji": "🔥", "imageUrl": "https://images.unsplash.com/photo-1678911820864-e2c567c655d7?q=80&w=600" },
  { "id": "pocox6", "title": "Smartphone POCO X6 Pro 5G", "category": "Smartphones", "history30dAvg": 2299, "quotes": [{"store": "Amazon", "pix": 1999}], "shipping": {"Amazon": "Gr�tis"}, "emoji": "🔥", "imageUrl": "https://images.unsplash.com/photo-1598327105666-5b89351cb315?q=80&w=600" },
  // GAMES
  { "id": "ps5", "title": "Console PlayStation 5 Edi��o Digital", "category": "Games & Consoles", "history30dAvg": 3899, "quotes": [{"store": "Amazon", "pix": 3599}], "shipping": {"Amazon": "Prime"}, "emoji": "🔥", "imageUrl": "https://images.unsplash.com/photo-1606813907291-d86efa9b94db?q=80&w=600" },
  { "id": "xboxs", "title": "Console Xbox Series S", "category": "Games & Consoles", "history30dAvg": 2399, "quotes": [{"store": "Amazon", "pix": 2149}], "shipping": {"Amazon": "Prime"}, "emoji": "🔥", "imageUrl": "https://images.unsplash.com/photo-1605901309584-818e25960b8f?q=80&w=600" },
  { "id": "dualsense", "title": "Controle Sem Fio DualSense PS5", "category": "Games & Consoles", "history30dAvg": 450, "quotes": [{"store": "Mercado Livre", "pix": 389}], "shipping": {"Mercado Livre": "Full"}, "emoji": "🔥?", "imageUrl": "https://images.unsplash.com/photo-1606318801954-d46d46d3360a?q=80&w=600" },
  // INFORMATICA
  { "id": "monitorlg", "title": "Monitor LG Ultrawide 29\" Full HD", "category": "Monitores", "history30dAvg": 999, "quotes": [{"store": "Amazon", "pix": 849}], "shipping": {"Amazon": "Prime"}, "emoji": "🔥?", "imageUrl": "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?q=80&w=600" },
  { "id": "ssd1tb", "title": "SSD Kingston NV2 1TB NVMe M.2", "category": "Hardware & PC", "history30dAvg": 450, "quotes": [{"store": "Mercado Livre", "pix": 399}], "shipping": {"Mercado Livre": "Full"}, "emoji": "🔥", "imageUrl": "https://images.unsplash.com/photo-1597848212624-a19eb35e2651?q=80&w=600" },
  { "id": "mouseg203", "title": "Mouse Gamer Logitech G203 RGB", "category": "Perif�ricos", "history30dAvg": 149, "quotes": [{"store": "Amazon", "pix": 119}], "shipping": {"Amazon": "Prime"}, "emoji": "🔥?", "imageUrl": "https://images.unsplash.com/photo-1595225476474-87563907a212?q=80&w=600" },
  // CASA E ELETRO
  { "id": "airfryer", "title": "Fritadeira Sem �leo Air Fryer Mondial 4L", "category": "Eletrodom�sticos", "history30dAvg": 349, "quotes": [{"store": "Shopee", "pix": 289}], "shipping": {"Shopee": "Frete Gr�tis"}, "emoji": "🔥", "imageUrl": "https://images.unsplash.com/photo-1621217030807-6c84138a39a7?q=80&w=600" },
  { "id": "aspirador", "title": "Aspirador de P� Rob� WAP Robot W100", "category": "Eletrodom�sticos", "history30dAvg": 499, "quotes": [{"store": "Amazon", "pix": 399}], "shipping": {"Amazon": "Prime"}, "emoji": "🔥", "imageUrl": "https://images.unsplash.com/photo-1518605368461-1ee51a70014b?q=80&w=600" },
  { "id": "airfryer", "title": "Fritadeira Sem leo Air Fryer Mondial 4L", "category": "Eletrodomésticos", "history30dAvg": 349, "quotes": [{"store": "Shopee", "pix": 289}], "shipping": {"Shopee": "Frete Grátis"}, "emoji": "🔥", "imageUrl": "https://images.unsplash.com/photo-1621217030807-6c84138a39a7?q=80&w=600" },
  { "id": "aspirador", "title": "Aspirador de P Rob WAP Robot W100", "category": "Eletrodomésticos", "history30dAvg": 499, "quotes": [{"store": "Amazon", "pix": 399}], "shipping": {"Amazon": "Prime"}, "emoji": "🔥", "imageUrl": "https://images.unsplash.com/photo-1518605368461-1ee51a70014b?q=80&w=600" },
  { "id": "echodot", "title": "Echo Dot 5 Geração com Alexa", "category": "Casa Inteligente", "history30dAvg": 349, "quotes": [{"store": "Amazon", "pix": 299}], "shipping": {"Amazon": "Prime"}, "emoji": "🔥", "imageUrl": "https://images.unsplash.com/photo-1543512214-318c7553f230?q=80&w=600" },
  { "id": "lampada", "title": "Lâmpada Inteligente Positivo Smart Wi-Fi", "category": "Casa Inteligente", "history30dAvg": 59, "quotes": [{"store": "Mercado Livre", "pix": 45}], "shipping": {"Mercado Livre": "Full"}, "emoji": "🔥", "imageUrl": "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?q=80&w=600" },
  // CONSUMO E SUPLEMENTOS
  { "id": "whey", "title": "Whey Protein Concentrado 1KG - Max Titanium", "category": "Saúde & Beleza", "history30dAvg": 119, "quotes": [{"store": "Shopee", "pix": 99}], "shipping": {"Shopee": "Frete Grátis"}, "emoji": "🔥", "imageUrl": "https://images.unsplash.com/photo-1593095948071-474c5cc2989d?q=80&w=600" },
  { "id": "creatina", "title": "Creatina Monohidratada 250g Growth", "category": "Saúde & Beleza", "history30dAvg": 89, "quotes": [{"store": "Shopee", "pix": 75}], "shipping": {"Shopee": "Cupom Frete"}, "emoji": "🔥", "imageUrl": "https://images.unsplash.com/photo-1579722820308-d74e571900a9?q=80&w=600" },
  { "id": "fralda", "title": "Fralda Pampers Confort Sec Jumbo (Leve Mais Pague Menos)", "category": "Supermercado", "history30dAvg": 99, "quotes": [{"store": "Amazon", "pix": 79}], "shipping": {"Amazon": "Prime"}, "emoji": "🔥", "imageUrl": "https://images.unsplash.com/photo-1555252333-9f8e92e65df9?q=80&w=600" },
  { "id": "sabao", "title": "Sabão Líquido Omo Lavagem Perfeita 3L", "category": "Supermercado", "history30dAvg": 55, "quotes": [{"store": "Mercado Livre", "pix": 42}], "shipping": {"Mercado Livre": "Full"}, "emoji": "🔥", "imageUrl": "https://images.unsplash.com/photo-1585241936939-f2fa0d8299a9?q=80&w=600" },
  { "id": "cafe", "title": "Café em Pó Pilão Tradicional 500g (Pack com 4)", "category": "Supermercado", "history30dAvg": 75, "quotes": [{"store": "Amazon", "pix": 59}], "shipping": {"Amazon": "Prime"}, "emoji": "?", "imageUrl": "https://images.unsplash.com/photo-1559525839-b184a4d698c7?q=80&w=600" },
  // TV E AUDIO
]
;

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
