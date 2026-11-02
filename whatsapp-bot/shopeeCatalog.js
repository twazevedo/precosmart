/**
 * @file shopeeCatalog.js - Catalogo Oficial Completo Shopee Datafeed (109.585 produtos)
 * @description Armazena 100% dos produtos dos Datafeeds da Shopee em um Buffer indexado
 * por Uint32Array (~19 MB de RAM total, zero overhead no heap V8, compativel com Render 512MB).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { shortenUrl } = require('./linkShortener');

const SHOPEE_AFFILIATE_ID = process.env.AFFILIATE_SHOPEE || '18361251220';
const GZ_PATH = path.join(__dirname, 'shopeeFeedsData.tsv.gz');

let rawBuffer = null;
let lineOffsets = null; // Uint32Array com inicio de cada linha + sentinela final
let rotationCursor = -1;

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
  // Conta quebras de linha (\n = 0x0A) para alocar Uint32Array exato
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
    title,
    category: cat || 'Achadinhos Shopee',
    shopName: shopName || 'Loja Oficial Shopee',
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
 * Retorna o proximo produto da Shopee (percorre todo o catalogo de 109.585 itens com passo primo
 * para distribuicao uniforme entre categorias e lojas sem repetir).
 */
function getNextShopeeProduct() {
  const total = getShopeeCatalogCount();
  if (total === 0) return null;
  if (rotationCursor < 0) {
    rotationCursor = Math.floor(Math.random() * total);
  }
  // Passo primo 7919 garante cobertura completa de todos os 109.585 itens antes de repetir
  for (let tries = 0; tries < 25; tries++) {
    rotationCursor = (rotationCursor + 7919) % total;
    const p = getShopeeProductByIndex(rotationCursor);
    if (p && p.imageUrl && p.salePrice > 0) return p;
  }
  return getShopeeProductByIndex(rotationCursor);
}

/**
 * Retorna oferta formatada no padrao do piloto automatico (awinCatalog / dispatchNextAwinRotation)
 */
async function getSpecificShopeeDeal(index = null) {
  const p = index !== null ? getShopeeProductByIndex(index) : getNextShopeeProduct();
  if (!p || !p.imageUrl) return null;

  const shortUrl = await shortenUrl(p.directAffiliateUrl);
  const hasDiscount = p.origPrice > p.salePrice && p.discPct > 0;
  const priceSection = hasDiscount
    ? `📉 De: ~${brl(p.origPrice)}~\n💥 *POR APENAS: ${brl(p.salePrice)}* 🎯 (${p.discPct}% OFF)\n`
    : `💥 *POR APENAS: ${brl(p.salePrice)}*\n`;
  const ratingSection = p.rating >= 4.5 ? `⭐ *Avaliação:* ${p.rating.toFixed(1)}/5.0\n` : '';
  const shopSection = p.shopName ? `🏪 Loja: *${p.shopName} (Shopee)*\n` : `🏪 Loja: *Shopee Oficial*\n`;

  const text = `🛍️ *ACHADINHO OFICIAL SHOPEE — DIRETO NO APP* 🔥⚡

🛒 *${p.title}*
${shopSection}${ratingSection}
${priceSection}📦 _Use seus cupons de Frete Grátis no App da Shopee!_

👉 *COMPRE COM DESCONTO AQUI:*
🔗 ${shortUrl}

⚡ _Preço e estoque podem variar a qualquer momento._
🛡️ _Compra 100% segura com Garantia Shopee._`;

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

module.exports = {
  getShopeeCatalogCount,
  getShopeeProductByIndex,
  getNextShopeeProduct,
  getSpecificShopeeDeal,
  searchShopeeCatalog,
  buildShopeeAffiliateUrl
};
