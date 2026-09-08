/**
 * @file garimpeirosCrawler.js — Extrator de Promoções de Garimpeiros.com.br
 * Coleta promoções ativas de todas as categorias do portal Garimpeiros.com.br,
 * desempacota links originais das lojas e injeta afiliados locais do PreçoSmart.
 */
'use strict';

const axios = require('axios');

async function fetchJson(url) {
  try {
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept': 'application/json' },
      timeout: 10000
    });
    return { status: res.status, data: res.data };
  } catch (e) {
    return { status: e.response?.status || 500, error: e.message };
  }
}

/**
 * Desempacota links de redes de afiliados de terceiros (ex: Awin ued=, Lomadee, etc)
 * para obter o link limpo da loja de destino antes de injetar a tag do PreçoSmart.
 */
function unpackRawStoreUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    if (parsed.searchParams.has('ued')) {
      return decodeURIComponent(parsed.searchParams.get('ued'));
    }
    if (parsed.searchParams.has('url')) {
      return decodeURIComponent(parsed.searchParams.get('url'));
    }
    if (parsed.searchParams.has('dest')) {
      return decodeURIComponent(parsed.searchParams.get('dest'));
    }
    return rawUrl;
  } catch (e) {
    return rawUrl;
  }
}

/**
 * Busca todas as categorias disponíveis na API do Garimpeiros
 */
async function fetchCategories() {
  try {
    const res = await fetchJson('https://api.garimpeiros.com.br/v3/categories');
    if (res.data?.success && Array.isArray(res.data.data)) {
      return res.data.data;
    }
    return [];
  } catch (err) {
    return [];
  }
}

/**
 * Coleta todas as promoções de todas as categorias de Garimpeiros.com.br
 * @param {number} limitPerCategory - Máximo de itens por categoria
 */
async function fetchAllGarimpeirosDeals(limitPerCategory = 5) {
  const deals = [];
  const seenIds = new Set();

  try {
    // 1. Coleta itens recentes e em destaque globais
    const [recentsRes, featuredRes] = await Promise.all([
      fetchJson('https://api.garimpeiros.com.br/v3/products/recents'),
      fetchJson('https://api.garimpeiros.com.br/v3/products/featured')
    ]);

    const globalProducts = [
      ...(recentsRes.data?.data?.products || []),
      ...(featuredRes.data?.data?.products || [])
    ];

    for (const p of globalProducts) {
      if (p.id && !seenIds.has(p.id)) {
        seenIds.add(p.id);
        deals.push(p);
      }
    }

    // 2. Coleta das principais categorias que têm ofertas ativas
    const categories = await fetchCategories();
    const activeCategories = categories.filter(c => c.qnt_ofertas > 0);

    for (const cat of activeCategories.slice(0, 15)) {
      try {
        const catDealsRes = await fetchJson(`https://api.garimpeiros.com.br/v3/products/featured?category=${cat.id}&per_page=${limitPerCategory}`);
        const catProducts = catDealsRes.data?.data?.products || [];
        for (const p of catProducts) {
          if (p.id && !seenIds.has(p.id)) {
            seenIds.add(p.id);
            deals.push(p);
          }
        }
      } catch (e) {
        console.error('Crawler error:', e.message);
      }
    }
  } catch (err) {
    console.error('Erro ao coletar promoções do Garimpeiros:', err.message);
  }

  // 3. Formata cada promoção para a estrutura oficial do PreçoSmart
  const formattedDeals = [];

  for (const item of deals) {
    const storeUrl = unpackRawStoreUrl(item.link);
    const storeName = item.loja?.nome || item.loja || 'Loja Parceira';
    const priceCurrent = item.preco_novo ? Number(item.preco_novo).toFixed(2).replace('.', ',') : null;
    const priceOld = item.preco_original && Number(item.preco_original) > 0 ? Number(item.preco_original).toFixed(2).replace('.', ',') : null;
    const couponCode = (item.cupom || item.cupom2 || item.cupom3 || '').trim();
    const imageUrl = item.gcs_imagem_600 || item.gcs_imagem_300 || item.gcs_imagem_1080 || null;

    const payMethod = typeof item.pagamento === 'string' ? item.pagamento : (item.pagamento?.nome || 'à vista / Pix');
    let messageDraft = `🔥 *${item.nome.trim()}*\n\n`;
    messageDraft += `🏪 Loja: *${storeName}*\n`;
    if (priceOld) {
      messageDraft += `📉 De: ~R$ ${priceOld}~\n`;
    }
    if (priceCurrent) {
      messageDraft += `💥 *Por apenas: R$ ${priceCurrent}* (${payMethod})\n`;
    }
    if (couponCode) {
      messageDraft += `🎟️ Cupom: *${couponCode}*\n`;
    }
    messageDraft += `\n🛒 *Link da Promoção:* ${storeUrl}\n\n`;
    messageDraft += `⚡ _Garimpado via PreçoSmart Oficial_`;

    formattedDeals.push({
      id: item.id,
      title: item.nome,
      store: storeName,
      rawUrl: storeUrl,
      priceCurrent,
      priceOld,
      coupon: couponCode,
      imageUrl,
      formattedText: messageDraft
    });
  }

  return formattedDeals;
}

module.exports = {
  fetchCategories,
  fetchAllGarimpeirosDeals,
  unpackRawStoreUrl
};
