/**
 * @file pechinchouCrawler.js — Extrator e Espião de Promoções Pechinchou.com.br
 * Coleta ofertas em tempo real do portal Pechinchou, desempacota links originais,
 * remove tags de afiliados concorrentes e injeta as tags oficiais do PreçoSmart.
 */
'use strict';

const axios = require('axios');
const { AFFILIATE } = require('./catalog');
const { replaceAffiliateTags, expandUrl } = require('./mirror');
const { cleanText } = require('./textSanitizer');
const { shortenUrl } = require('./linkShortener');

const PECHINCHOU_URL = 'https://pechinchou.com.br/';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

const AFFILIATED_STORE_SLUGS = [
  { name: 'Amazon', slug: 'amazon.com.br' },
  { name: 'Mercado Livre', slug: 'mercadolivre.com.br' },
  { name: 'Magazine Luiza', slug: 'magazineluiza.com.br' },
  { name: 'Shopee', slug: 'shopee.com.br' },
  { name: 'KaBuM!', slug: 'kabum.com.br' },
  { name: 'Nike Brasil', slug: 'nike.com.br' },
  { name: 'Adidas Brasil', slug: 'adidas.com.br' },
  { name: 'AliExpress', slug: 'aliexpress' },
  { name: 'O Boticário', slug: 'boticario.com.br' },
  { name: 'Eudora', slug: 'eudora.com.br' },
  { name: 'Quem Disse, Berenice?', slug: 'quem-disse-berenice' },
  { name: 'C&A', slug: 'cea.com.br' },
  { name: 'Puma', slug: 'puma' },
  { name: 'Olympikus', slug: 'olympikus.com.br' },
  { name: 'Stanley', slug: 'stanley1913.com.br' },
  { name: 'Under Armour', slug: 'underarmour.com.br' },
  { name: 'LG', slug: 'lg' }
];

function convertAwinLink(rawUrl) {
  try {
    if (rawUrl.includes('awin1.com')) {
      const u = new URL(rawUrl);
      if (u.searchParams.has('id')) u.searchParams.set('id', AFFILIATE.awin);
      if (u.searchParams.has('awinaffid')) u.searchParams.set('awinaffid', AFFILIATE.awin);
      u.searchParams.set('clickref', 'precosmart');
      return u.toString();
    }
  } catch (e) {}
  return rawUrl;
}

function convertMagaluLink(rawUrl) {
  try {
    if (rawUrl.includes('influenciadormagalu.com.br') || rawUrl.includes('magazinevoce.com.br')) {
      const u = new URL(rawUrl);
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length > 0) {
        parts[0] = 'magazineprecosmart';
        return `https://www.magazinevoce.com.br/${parts.join('/')}`;
      }
    }
  } catch (e) {}
  return rawUrl;
}

function formatPriceBRL(val) {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val).trim();
  if (/^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(s)) return s;
  const num = typeof val === 'number' ? val : parseFloat(s.replace(/[^0-9.,]/g, '').replace(',', '.'));
  if (isNaN(num) || num <= 0) return null;
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function formatSinglePromo(p, storeOverride) {
  const rawTargetUrl = p.long_url || p.short_url;
  if (!rawTargetUrl) return null;

  const storeName = cleanText(storeOverride || p.store?.name || 'Loja Parceira');
  const title = cleanText((p.title || 'Oferta').trim());

  // Resolve redirects ou links encurtados
  let cleanUrl = rawTargetUrl;
  try {
    if (cleanUrl.includes('meli.la/') || cleanUrl.includes('bit.ly/') || cleanUrl.includes('amzn.to/')) {
      cleanUrl = await expandUrl(cleanUrl);
    }
  } catch (e) {}

  // Injeta tag oficial PreçoSmart
  let affiliateUrl = cleanUrl;
  try {
    if (cleanUrl.includes('awin1.com')) {
      affiliateUrl = convertAwinLink(cleanUrl);
    } else if (cleanUrl.includes('influenciadormagalu.com.br') || cleanUrl.includes('magazinevoce.com.br')) {
      affiliateUrl = convertMagaluLink(cleanUrl);
    } else {
      affiliateUrl = await replaceAffiliateTags(cleanUrl, title);
    }
  } catch (e) {
    affiliateUrl = cleanUrl;
  }

  // Encurta links longos (AWIN, Shopee, etc) para visual limpo de alta conversão
  if (affiliateUrl && affiliateUrl.length > 80 && !affiliateUrl.includes('amazon.com.br/dp/')) {
    try {
      const short = await shortenUrl(affiliateUrl);
      if (short) affiliateUrl = short;
    } catch (e) {}
  }

  // Preços devidamente formatados em padrão BRL (R$ 1.299,00)
  const priceNum = parseFloat(String(p.price).replace(',', '.'));
  const oldPriceNum = parseFloat(String(p.old_price).replace(',', '.'));
  const priceCurrent = formatPriceBRL(priceNum) || String(p.price || '').replace('.', ',');
  const priceOld = (oldPriceNum && priceNum && oldPriceNum > priceNum) 
    ? formatPriceBRL(oldPriceNum) 
    : null;
  const discountPercent = oldPriceNum && priceNum && oldPriceNum > priceNum 
    ? Math.round(((oldPriceNum - priceNum) / oldPriceNum) * 100) 
    : null;

  // Cupons
  const rawCoupons = Array.isArray(p.coupons) ? p.coupons.filter(Boolean) : [];
  const coupons = rawCoupons.map(cp => cleanText(String(cp))).filter(Boolean);
  const couponCode = coupons.length > 0 ? coupons.join(' ou ') : null;

  // Imagem
  let imageUrl = p.image || null;
  if (imageUrl && imageUrl.startsWith('//')) {
    imageUrl = 'https:' + imageUrl;
  }

  // Redação de alta conversão para o WhatsApp
  let copy = `🔥 *${title}*\n\n`;
  copy += `🏪 Loja: *${storeName}*\n`;
  if (priceOld) {
    copy += `📉 De: ~R$ ${priceOld}~`;
    if (discountPercent) copy += ` *(-${discountPercent}% OFF)*`;
    copy += `\n`;
  }
  if (priceCurrent) {
    copy += `💥 *Por apenas: R$ ${priceCurrent}*\n`;
  }
  if (couponCode) {
    copy += `\n🎟️ Cupom: *${couponCode}* (aplique no carrinho)\n`;
  }
  if (p.author_commentary) {
    let dica = cleanText(String(p.author_commentary).trim());
    dica = dica.replace(/pechinchou(?:\.com(?:\.br)?)?/gi, 'PreçoSmart');
    if (dica.length > 15) {
      copy += `\n💡 _Dica: ${dica}_\n`;
    }
  }
  copy += `\n🛒 *Compre aqui com desconto:* \n👉 ${affiliateUrl}\n\n`;
  copy += `⚡ _Garimpado via PreçoSmart Radar_`;

  return {
    id: p.id,
    canonicalId: 'pechinchou_' + p.id,
    title,
    store: storeName,
    rawUrl: rawTargetUrl,
    affiliateUrl,
    priceCurrent,
    priceOld,
    discountPercent,
    coupon: couponCode,
    imageUrl,
    formattedText: copy
  };
}

/**
 * Coleta promoções ativas da home do Pechinchou.com.br
 * @param {number} limit - Máximo de ofertas a retornar
 * @returns {Promise<Array>} Lista de ofertas formatadas para o PreçoSmart
 */
async function fetchPechinchouDeals(limit = 10) {
  try {
    const res = await axios.get(PECHINCHOU_URL, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache'
      },
      timeout: 10000
    });

    const html = res.data;
    if (typeof html !== 'string') return [];

    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) return [];

    const nextData = JSON.parse(match[1]);
    const rawPromos = nextData?.props?.pageProps?.promos?.results || [];

    if (!Array.isArray(rawPromos) || rawPromos.length === 0) return [];

    const deals = [];
    for (const p of rawPromos.slice(0, limit * 2)) {
      if (deals.length >= limit) break;
      if (p.status === 'closed' || p.status === 'paused') continue;

      const formatted = await formatSinglePromo(p);
      if (formatted) deals.push(formatted);
    }

    return deals;
  } catch (err) {
    console.error('[Pechinchou] Erro no crawler:', err.message);
    return [];
  }
}

/**
 * Coleta produtos das lojas específicas onde o usuário é afiliado oficial
 * (Amazon, Mercado Livre, Magalu, KaBuM!, Nike, Boticário)
 * @param {number} limitPerStore - Quantidade de ofertas por loja
 * @returns {Promise<Array>}
 */
async function fetchAffiliatedStoresDeals(limitPerStore = 1) {
  const allDeals = [];

  for (const store of AFFILIATED_STORE_SLUGS) {
    try {
      const url = `https://pechinchou.com.br/lojas/${store.slug}`;
      const res = await axios.get(url, {
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 10000
      });

      if (res.status !== 200) continue;
      const html = res.data;
      const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (!m) continue;

      const j = JSON.parse(m[1]);
      const productsObj = j.props?.pageProps?.products;
      const items = Array.isArray(productsObj) ? productsObj : (productsObj?.results || []);

      let count = 0;
      for (const p of items) {
        if (count >= limitPerStore) break;
        if (p.status === 'closed' || p.status === 'paused') continue;

        const formatted = await formatSinglePromo(p, store.name);
        if (formatted) {
          allDeals.push(formatted);
          count++;
        }
      }
    } catch (e) {
      console.warn(`[Pechinchou] Falha ao coletar loja ${store.name}:`, e.message);
    }
  }

  return allDeals;
}

module.exports = {
  fetchPechinchouDeals,
  fetchAffiliatedStoresDeals,
  formatSinglePromo,
  AFFILIATED_STORE_SLUGS
};
