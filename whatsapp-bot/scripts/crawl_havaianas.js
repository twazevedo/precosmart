/**
 * @file crawl_havaianas.js
 * @description Ingestão oficial de produtos da Havaianas Brasil (AWIN MID 119883) via Shopify Storefront API.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('../node_modules/axios');

const AWIN_PUBLISHER_ID = process.env.AFFILIATE_AWIN || '3077915';
const MID = '119883';
const CLICKREF = 'PILOTO_AUTO';
const DATA_PATH = path.join(__dirname, '../awinDealsData.json');

function buildAwinUrl(mid, targetUrl) {
  if (!mid || !targetUrl) return '';
  return `https://www.awin1.com/cread.php?awinmid=${mid}&awinaffid=${AWIN_PUBLISHER_ID}&clickref=${CLICKREF}&ued=${encodeURIComponent(targetUrl)}`;
}

function formatPrice(num) {
  const n = parseFloat(num) || 0;
  return `R$ ${n.toFixed(2).replace('.', ',')}`;
}

const AXIOS_CFG = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*'
  },
  timeout: 15000
};

async function fetchHavaianas() {
  console.log('🩴 Buscando catálogo oficial Havaianas Brasil (Shopify)...');
  const items = [];
  const seenUrls = new Set();

  for (let page = 1; page <= 3; page++) {
    try {
      const url = `https://havaianas.com.br/products.json?limit=250&page=${page}`;
      const res = await axios.get(url, AXIOS_CFG);
      const prods = (res.data?.products || []).filter(p => p.images && p.images[0] && p.images[0].src);

      if (prods.length === 0) break;

      for (const p of prods) {
        const handle = p.handle;
        const prodUrl = `https://havaianas.com.br/products/${handle}`;
        if (seenUrls.has(prodUrl)) continue;
        seenUrls.add(prodUrl);

        const v = p.variants?.[0] || {};
        const priceNum = parseFloat(v.price || '0');
        if (priceNum <= 10) continue;

        const compareNum = parseFloat(v.compare_at_price || '0');
        const origNum = (compareNum > priceNum) ? compareNum : (priceNum * 1.20);
        const discPct = Math.round((1 - priceNum / origNum) * 100);
        const discountStr = discPct >= 5 ? `${discPct}% OFF` : null;

        const img = p.images[0].src;

        let cat = 'Chinelos & Sandálias';
        const t = (p.title || '').toLowerCase();
        if (t.includes('bolsa') || t.includes('necessaire') || t.includes('mochila') || t.includes('carteira')) {
          cat = 'Bolsas & Acessórios';
        } else if (t.includes('kit') || t.includes('presente')) {
          cat = 'Kits & Presentes';
        } else if (t.includes('slim') || t.includes('flash') || t.includes('rasteira') || t.includes('sandália') || t.includes('sandalia')) {
          cat = 'Sandálias & Rasteiras Slim';
        } else if (t.includes('brasil') || t.includes('top') || t.includes('tradicional')) {
          cat = 'Chinelos Clássicos & Brasil';
        } else if (t.includes('infantil') || t.includes('kids') || t.includes('baby')) {
          cat = 'Infantil & Kids';
        }

        items.push({
          id: `havaianas_${p.id}`,
          advertiser: 'Havaianas Brasil Oficial',
          advertiserId: MID,
          source: 'shopify_api',
          type: 'product',
          title: p.title,
          description: 'Conforto, estilo e qualidade lendária Havaianas: borracha 100% legítima, durabilidade e design autêntico brasileiro.',
          priceOriginal: formatPrice(origNum),
          priceCurrent: formatPrice(priceNum),
          discount: discountStr,
          categories: cat,
          imageUrl: img,
          deeplink: prodUrl,
          deeplinkTracking: buildAwinUrl(MID, prodUrl),
          feedSyncedAt: new Date().toISOString().split('T')[0]
        });
      }
      console.log(`   Página ${page}: total acumulado ${items.length} produtos.`);
    } catch (err) {
      console.warn(`   Aviso na página ${page}: ${err.message}`);
      break;
    }
  }

  return items;
}

async function main() {
  const items = await fetchHavaianas();
  if (items.length === 0) {
    console.error('Nenhum produto obtido de Havaianas.');
    process.exit(1);
  }

  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch (e) {
    console.warn('Criando novo awinDealsData.json...');
  }

  // Mescla havaianasDeals
  const existingByUrl = new Map();
  const existingList = Array.isArray(data.havaianasDeals) ? data.havaianasDeals : [];
  for (const p of existingList) {
    if (p.deeplink) existingByUrl.set(p.deeplink, p);
  }

  let updated = 0;
  let added = 0;
  for (const item of items) {
    const exists = existingByUrl.get(item.deeplink);
    if (exists) {
      exists.priceCurrent = item.priceCurrent;
      exists.priceOriginal = item.priceOriginal;
      exists.imageUrl = item.imageUrl;
      exists.discount = item.discount;
      updated++;
    } else {
      existingList.push(item);
      existingByUrl.set(item.deeplink, item);
      added++;
    }
  }

  data.havaianasDeals = existingList;

  // Atualiza também o array geral de produtos combinados
  const brandArrays = [
    data.nikeDeals,
    data.pumaDeals,
    data.stanleyDeals,
    data.decathlonDeals,
    data.venancioDeals,
    data.olympikusDeals,
    data.kabumDeals,
    data.clovisDeals,
    data.legoDeals,
    data.ninjaDeals,
    data.underArmourDeals,
    data.hopeDeals,
    data.lacosteDeals,
    data.lgDeals,
    data.aliexpressDeals,
    data.ceaDeals,
    data.mizunoDeals,
    data.havaianasDeals,
    data.mlDeals,
    data.amazonDeals
  ];

  const allCombined = [];
  for (const arr of brandArrays) {
    if (Array.isArray(arr)) allCombined.push(...arr);
  }
  data.products = allCombined;
  data._totalProducts = allCombined.length;
  data._lastUpdated = new Date().toISOString();

  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');

  console.log(`\n✅ Havaianas Brasil integrada com sucesso: ${existingList.length} produtos (atualizados: ${updated}, novos: ${added}).`);
  console.log(`📊 Catálogo geral total: ${allCombined.length} produtos.\n`);
}

main().catch(err => {
  console.error('Erro na integração de Havaianas:', err);
  process.exit(1);
});
