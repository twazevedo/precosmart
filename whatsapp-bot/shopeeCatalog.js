/**
 * @file shopeeCatalog.js - Catalogo Oficial Completo Shopee Datafeed (109.585 produtos)
 * @description Armazena 100% dos produtos dos Datafeeds da Shopee em um Buffer indexado
 * por Uint32Array (~1,34 MB de Heap V8, compativel com Render 512MB) + Curadoria Inteligente
 * que prioriza produtos de desejo com Nota >= 4.7 e Desconto Real >= 15%.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { shortenUrl } = require('./linkShortener');
const { cleanText } = require('./textSanitizer');

const SHOPEE_AFFILIATE_ID = process.env.AFFILIATE_SHOPEE || '18361251220';
const GZ_PATH = path.join(__dirname, 'shopeeFeedsData.tsv.gz');

let rawBuffer = null;
let lineOffsets = null; // Uint32Array com inicio de cada linha + sentinela final
let rotationCursor = -1;

// Categorias de alta conversao no WhatsApp (Produtos de Desejo B2C)
const DESIRE_CATEGORIES = new Set([
  'Home & Living',
  'Beauty',
  'Home Appliances',
  'Computers & Accessories',
  'Mobile & Gadgets',
  'Audio',
  'Watches',
  'Gaming & Consoles',
  'Cameras & Drones',
  'Sports & Outdoors',
  'Fashion Accessories',
  'Women Shoes',
  'Men Shoes',
  'Women Clothes',
  'Men Clothes',
  'Women Bags',
  'Men Bags',
  'Pets',
  'Travel & Luggage',
  'Health'
]);

// Filtro contra pecas mecanicas internas, conexoes hidraulicas e itens de supermercado basico
const BANNED_ASCII = /\b(part number|peca de reposicao|amortecedor|virabrequim|embreagem|cabecote|homocinetica|pastilha de freio|disco de freio|bucha|bieleta|coxim|parachoque|para-choque|macaneta|retrovisor|radiador|vela de ignicao|filtro de oleo|correia dentada|bomba de combustivel|rolamento|joelho pvc|luva pvc|te pvc|cano pvc|tubo pvc|registro esfera|disjuntor|contator|multimetro|chave grifo|alicate vazador|parafuso|porca sextavada|arruela|buchas de fixacao|dobradica para notebook|cabo flat|tela para notebook|teclado para notebook|carcaca notebook|acucar|arroz|feijao|macarrao|oleo de soja|sal refinado|papel higienico)\b/i;

const brl = (v) =>
  (!v || isNaN(v))
    ? 'R$ 0,00'
    : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function ensureLoaded() {
  if (rawBuffer && lineOffsets) return;
  if (!fs.existsSync(GZ_PATH)) {
    rawBuffer = Buffer.alloc(0);
    lineOffsets = new Uint32Array([0]);
    return;
  }
  rawBuffer = zlib.gunzipSync(fs.readFileSync(GZ_PATH));
  let count = 1;
  for (let i = 0; i < rawBuffer.length; i++) {
    if (rawBuffer[i] === 0x0a) count++;
  }
  lineOffsets = new Uint32Array(count + 1);
  let idx = 0;
  lineOffsets[idx++] = 0;
  for (let i = 0; i < rawBuffer.length; i++) {
    if (rawBuffer[i] === 0x0a) {
      lineOffsets[idx++] = i + 1;
    }
  }
  lineOffsets[idx] = rawBuffer.length + 1;
}

function getShopeeCatalogCount() {
  ensureLoaded();
  return Math.max(0, lineOffsets.length - 1);
}

/**
 * Monta o link oficial de redirecionamento de afiliado da Shopee (abre direto no App)
 */
function buildShopeeAffiliateUrl(shopid, itemid, subId = 'precosmart') {
  const origin = `https://shopee.com.br/product/${shopid}/${itemid}`;
  return `https://s.shopee.com.br/an_redir?origin_link=${encodeURIComponent(origin)}&affiliate_id=${SHOPEE_AFFILIATE_ID}&sub_id=${encodeURIComponent(subId)}`;
}

/**
 * Avalia se um produto passa na Curadoria Inteligente de Alta Conversao
 */
function isCuratedDesireProduct(p) {
  if (!p || !p.imageUrl || p.salePrice < 9.90) return false;
  if (!DESIRE_CATEGORIES.has(p.category)) return false;
  if (p.rating < 4.7 || p.discPct < 15) return false;
  const asciiTitle = String(p.title || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (BANNED_ASCII.test(asciiTitle)) return false;
  return true;
}

/**
 * Decodifica a linha `index` do Buffer em um objeto de produto completo sob demanda
 */
function getShopeeProductByIndex(index) {
  const total = getShopeeCatalogCount();
  if (total === 0) return null;
  const safeIdx = ((index % total) + total) % total;
  const start = lineOffsets[safeIdx];
  const end = Math.max(start, lineOffsets[safeIdx + 1] - 1);
  if (end <= start) return null;

  const line = rawBuffer.toString('utf8', start, end);
  const parts = line.split('\t');
  if (parts.length < 10) return null;

  const [shopid, itemid, saleStr, origStr, discStr, ratingStr, imgRaw, shopName, cat, title] = parts;
  const salePrice = parseFloat(saleStr) || 0;
  const origPrice = Math.max(salePrice, parseFloat(origStr) || salePrice);
  const discPct = parseInt(discStr, 10) || (origPrice > salePrice ? Math.round(((origPrice - salePrice) / origPrice) * 100) : 0);
  const rating = parseFloat(ratingStr) || 0;
  const imageUrl = !imgRaw
    ? null
    : imgRaw.startsWith('http')
      ? imgRaw
      : `https://cf.shopee.com.br/file/${imgRaw}`;

  const directUrl = `https://shopee.com.br/product/${shopid}/${itemid}`;
  const affiliateUrl = buildShopeeAffiliateUrl(shopid, itemid, 'precosmart');
  const history30dAvg = origPrice > salePrice ? origPrice : Number((salePrice * 1.18).toFixed(2));
  const storeLabel = shopName ? `Shopee (${shopName})` : 'Shopee';

  return {
    id: `shp_${shopid}_${itemid}`,
    shopid,
    itemid,
    title: cleanText(title),
    category: cat || 'Achadinhos Shopee',
    shopName: cleanText(shopName) || 'Loja Oficial Shopee',
    salePrice,
    origPrice,
    discPct,
    rating,
    history30dAvg,
    quotes: [{ store: 'Shopee', pix: salePrice, url: affiliateUrl }],
    shipping: { Shopee: 'Frete Gratis com Cupom no App' },
    emoji: '🛍️',
    imageUrl,
    directUrl,
    directAffiliateUrl: affiliateUrl,
    storeLabel
  };
}

/**
 * Retorna o proximo produto da Shopee priorizando a Curadoria Inteligente
 * (Nota >= 4.7, Desconto >= 15%, Categorias de Desejo, passo primo 7919 sem repeticao).
 */
function getNextShopeeProduct() {
  const total = getShopeeCatalogCount();
  if (total === 0) return null;
  if (rotationCursor < 0) {
    rotationCursor = Math.floor(Math.random() * total);
  }
  // Procura primeiro um item Ouro da Curadoria Inteligente
  for (let tries = 0; tries < 120; tries++) {
    rotationCursor = (rotationCursor + 7919) % total;
    const p = getShopeeProductByIndex(rotationCursor);
    if (isCuratedDesireProduct(p)) return p;
  }
  // Fallback seguro caso necessario
  for (let tries = 0; tries < 25; tries++) {
    rotationCursor = (rotationCursor + 7919) % total;
    const p = getShopeeProductByIndex(rotationCursor);
    if (p && p.imageUrl && p.salePrice > 0) return p;
  }
  return getShopeeProductByIndex(rotationCursor);
}

/**
 * Gera o cabecalho inteligente e selos de conversao de acordo com o perfil da oferta
 */
function buildSmartShopeeCopy(p, shortUrl) {
  const savings = Math.max(0, Number((p.origPrice - p.salePrice).toFixed(2)));
  const hasDiscount = savings >= 1 && p.discPct > 0;

  let header = '🛍️ *ACHADINHO OFICIAL SHOPEE — DIRETO NO APP* 🔥⚡';
  if (p.salePrice <= 29.90) {
    header = '🪙 *ACHADINHO BARATINHO — MENOS DE R$ 29 NA SHOPEE!* 🔥⚡';
  } else if (p.discPct >= 45) {
    header = `🚨 *METADE DO PREÇO NA SHOPEE — ${p.discPct}% OFF!* 💥⚡`;
  } else if (p.rating >= 4.9) {
    header = `🏆 *CAMPEÃO DE AVALIAÇÕES (${p.rating.toFixed(1)}/5.0) NA SHOPEE!* ⭐🔥`;
  }

  let priceSection = `💥 *POR APENAS: ${brl(p.salePrice)}*\n`;
  if (hasDiscount) {
    priceSection =
      `📉 De: ~${brl(p.origPrice)}~\n` +
      `💥 *POR APENAS: ${brl(p.salePrice)}* 🎯 (${p.discPct}% OFF)\n` +
      `💰 *Você economiza: ${brl(savings)} na hora!*\n`;
  }

  let installmentLine = '';
  if (p.salePrice >= 60) {
    const maxParcels = Math.min(12, Math.max(2, Math.floor(p.salePrice / 20)));
    const parcelValue = brl(p.salePrice / maxParcels);
    installmentLine = `💳 _ou em até ${maxParcels}x de ${parcelValue} no cartão pelo App_\n`;
  }

  const ratingSection = p.rating >= 4.5 ? `⭐ *Avaliação:* ${p.rating.toFixed(1)}/5.0 _(Compra Verificada)_\n` : '';
  const shopSection = p.shopName ? `🏪 Loja: *${p.shopName} (Shopee)*\n` : `🏪 Loja: *Shopee Oficial*\n`;

  return `${header}

🛒 *${p.title}*
${shopSection}${ratingSection}
${priceSection}${installmentLine}📦 _Use seus cupons de Frete Grátis no App da Shopee!_

👉 *COMPRE COM DESCONTO AQUI:*
🔗 ${shortUrl}

⚡ _Preço e estoque podem variar a qualquer momento._
🛡️ _Compra 100% segura com Garantia Shopee._`;
}

/**
 * Retorna oferta formatada no padrao do piloto automatico (awinCatalog / dispatchNextAwinRotation)
 */
async function getSpecificShopeeDeal(index = null) {
  const p = index !== null ? getShopeeProductByIndex(index) : getNextShopeeProduct();
  if (!p || !p.imageUrl) return null;

  const shortUrl = await shortenUrl(p.directAffiliateUrl);
  const text = buildSmartShopeeCopy(p, shortUrl);

  return {
    type: 'product',
    store: 'Shopee Oficial',
    title: p.title,
    price: brl(p.salePrice),
    url: shortUrl,
    rawUrl: p.directUrl,
    imageUrl: p.imageUrl,
    text
  };
}

/**
 * Pesquisa por palavra-chave em todo o catalogo de 109.585 produtos da Shopee
 */
function searchShopeeCatalog(query, limit = 5) {
  ensureLoaded();
  if (!query || rawBuffer.length === 0) return [];
  const terms = String(query)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 2);
  if (terms.length === 0) return [];

  const total = getShopeeCatalogCount();
  const results = [];
  for (let i = 0; i < total && results.length < limit; i++) {
    const p = getShopeeProductByIndex(i);
    if (!p) continue;
    const hay = `${p.title} ${p.category} ${p.shopName}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (terms.every(t => hay.includes(t))) {
      results.push(p);
    }
  }
  return results;
}


// Categorias especificas para presentes de Natal e Amigo Secreto ate R$ 50
const PURE_GIFT_CATEGORIES = new Set([
  'Beauty',
  'Fashion Accessories',
  'Women Shoes',
  'Men Shoes',
  'Women Clothes',
  'Men Clothes',
  'Women Bags',
  'Men Bags',
  'Audio',
  'Mobile & Gadgets',
  'Watches',
  'Gaming & Consoles'
]);

const HOME_GIFT_REGEX = /(caneca|copo|garrafa termica|luminaria|difusor|aromatizador|vela aromatica|decor|almofada|manta|quadro|abajur|porta joia|porta retrato|xicara|garrafa)/i;
const NON_GIFT_REGEX = /\b(tintura|coloracao|tonalizante|descolorante|agua oxigenada|depilacao|cera|linha de pedreiro|pvc|torneira|reparo|parafuso|filtro|reforco)\b/i;

function isHolidayGiftProduct(p) {
  if (!p || !p.imageUrl || p.salePrice < 14.90 || p.salePrice > 50.00) return false;
  if (!isCuratedDesireProduct(p)) return false;
  const isPure = PURE_GIFT_CATEGORIES.has(p.category);
  const isHomeGift = p.category === 'Home & Living' && HOME_GIFT_REGEX.test(p.title);
  if (!isPure && !isHomeGift) return false;
  const title = String(p.title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (NON_GIFT_REGEX.test(title)) return false;
  return true;
}

let holidayGiftCursor = -1;
const recentHolidayGiftIds = new Set();

function getNextHolidayGiftProduct() {
  const total = getShopeeCatalogCount();
  if (total === 0) return null;
  if (holidayGiftCursor < 0) {
    holidayGiftCursor = Math.floor(Math.random() * total);
  }
  for (let tries = 0; tries < 400; tries++) {
    holidayGiftCursor = (holidayGiftCursor + 4093) % total;
    const p = getShopeeProductByIndex(holidayGiftCursor);
    if (p && isHolidayGiftProduct(p) && !recentHolidayGiftIds.has(p.id)) {
      recentHolidayGiftIds.add(p.id);
      if (recentHolidayGiftIds.size > 200) {
        const first = recentHolidayGiftIds.values().next().value;
        recentHolidayGiftIds.delete(first);
      }
      return p;
    }
  }
  return null;
}

async function getNextHolidayGiftDeal() {
  const p = getNextHolidayGiftProduct();
  if (!p || !p.imageUrl) return null;

  const shortUrl = await shortenUrl(p.directAffiliateUrl);
  const savings = Math.max(0, Number((p.origPrice - p.salePrice).toFixed(2)));
  const ratingStr = p.rating ? `⭐ *Avaliação:* ${p.rating.toFixed(1)}/5.0 _(Excelente Recomendação)_\n` : '';
  const shopSection = p.shopName ? `🏪 Loja: *${p.shopName} (Shopee)*\n` : `🏪 Loja: *Shopee Oficial*\n`;

  const text = `🎁 *ESPECIAL DE NATAL — PRESENTE & AMIGO SECRETO ATÉ R$ 50* 🎄✨
_(Opção perfeita para presentear com estilo gastando pouco!)_

🛒 *${p.title}*
${shopSection}${ratingStr}
📉 De: ~${brl(p.origPrice)}~
💥 *POR APENAS: ${brl(p.salePrice)}* 🎯 (${p.discPct}% OFF)
💰 *Você economiza: ${brl(savings)} no presente!*
📦 _Dica de Natal: Aproveite os cupons de Frete Grátis no App da Shopee!_

👉 *GARANTA O SEU PRESENTE AQUI:*
🔗 ${shortUrl}

⚡ _Estoque promocional limitado para as festas de fim de ano._
🛡️ _Compra 100% segura com Garantia Shopee._`;

  return {
    type: 'holiday_gift',
    store: 'Shopee Oficial',
    title: p.title,
    price: brl(p.salePrice),
    url: shortUrl,
    rawUrl: p.directUrl,
    imageUrl: p.imageUrl,
    text
  };
}

module.exports = {
  getShopeeCatalogCount,
  getShopeeProductByIndex,
  getNextShopeeProduct,
  getSpecificShopeeDeal,
  searchShopeeCatalog,
  buildShopeeAffiliateUrl,
  isCuratedDesireProduct,
  getNextHolidayGiftDeal,
  isHolidayGiftProduct
};
