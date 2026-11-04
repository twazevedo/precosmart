/**
 * @file pechinchouCrawler.js — Extrator e Espião de Promoções Pechinchou.com.br
 * Coleta ofertas em tempo real do portal Pechinchou, desempacota links originais,
 * remove tags de afiliados concorrentes e injeta as tags oficiais do PreçoSmart.
 */
'use strict';

const axios = require('axios');
const { AFFILIATE } = require('./catalog');
const { replaceAffiliateTags, expandUrl } = require('./mirror');

const PECHINCHOU_URL = 'https://pechinchou.com.br/';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
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
    if (typeof html !== 'string') {
      return [];
    }

    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) {
      console.warn('[Pechinchou] __NEXT_DATA__ não localizado no HTML.');
      return [];
    }

    const nextData = JSON.parse(match[1]);
    const rawPromos = nextData?.props?.pageProps?.promos?.results || [];

    if (!Array.isArray(rawPromos) || rawPromos.length === 0) {
      return [];
    }

    const deals = [];

    for (const p of rawPromos.slice(0, limit * 2)) {
      if (deals.length >= limit) break;

      // Pula promoções esgotadas ou pausadas
      if (p.status === 'closed' || p.status === 'paused') continue;

      const rawTargetUrl = p.long_url || p.short_url;
      if (!rawTargetUrl) continue;

      const storeName = p.store?.name || 'Loja Parceira';
      const title = (p.title || 'Oferta').trim();

      // Resolve redirects ou links encurtados de redes
      let cleanUrl = rawTargetUrl;
      try {
        if (cleanUrl.includes('meli.la/') || cleanUrl.includes('bit.ly/') || cleanUrl.includes('amzn.to/')) {
          cleanUrl = await expandUrl(cleanUrl);
        }
      } catch (e) {}

      // Injeta tag oficial PreçoSmart
      let affiliateUrl = cleanUrl;
      try {
        affiliateUrl = await replaceAffiliateTags(cleanUrl, title);
      } catch (e) {
        affiliateUrl = cleanUrl;
      }

      // Preços
      const priceNum = parseFloat(p.price);
      const oldPriceNum = parseFloat(p.old_price);
      const priceCurrent = !isNaN(priceNum) ? priceNum.toFixed(2).replace('.', ',') : p.price;
      const priceOld = !isNaN(oldPriceNum) && oldPriceNum > priceNum ? oldPriceNum.toFixed(2).replace('.', ',') : null;
      const discountPercent = oldPriceNum && priceNum && oldPriceNum > priceNum 
        ? Math.round(((oldPriceNum - priceNum) / oldPriceNum) * 100) 
        : null;

      // Cupons
      const coupons = Array.isArray(p.coupons) ? p.coupons.filter(Boolean) : [];
      const couponCode = coupons.length > 0 ? coupons.join(' ou ') : null;

      // Imagem
      let imageUrl = p.image || null;
      if (imageUrl && imageUrl.startsWith('//')) {
        imageUrl = 'https:' + imageUrl;
      }

      // Redação otimizada para conversão no WhatsApp
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
      if (p.author_commentary && p.author_commentary.trim().length > 10) {
        copy += `\n💡 _Dica: ${p.author_commentary.trim()}_\n`;
      }
      copy += `\n🛒 *Link da Promoção:* ${affiliateUrl}\n\n`;
      copy += `⚡ _Garimpado via PreçoSmart Radar_`;

      deals.push({
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
      });
    }

    return deals;
  } catch (err) {
    console.error('[Pechinchou] Erro no crawler:', err.message);
    return [];
  }
}

module.exports = {
  fetchPechinchouDeals
};
