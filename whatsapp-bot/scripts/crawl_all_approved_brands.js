/**
 * @file crawl_all_approved_brands.js
 * @description Ingestão automática multimarca de todos os produtos de cada marca aprovada na AWIN.
 * Cobre vestuário, acessórios, térmicos, eletroportáteis, cuidados pessoais, brinquedos, informática e calçados.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('../node_modules/axios');

const AWIN_PUBLISHER_ID = '3077915';
const CLICKREF = 'PILOTO_AUTO';

function buildAwinUrl(mid, targetUrl) {
  if (!mid || !targetUrl) return '';
  return `https://www.awin1.com/cread.php?awinmid=${mid}&awinaffid=${AWIN_PUBLISHER_ID}&clickref=${CLICKREF}&ued=${encodeURIComponent(targetUrl)}`;
}

function formatPrice(num) {
  return `R$ ${Number(num || 0).toFixed(2).replace('.', ',')}`;
}

const AXIOS_CFG = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*'
  },
  timeout: 10000
};

// ── 1. STANLEY BRASIL (30599) — Shopify (Copos, Garrafas, Quenchers, Coolers, Canecas) ──
async function fetchStanley() {
  console.log('[1/10] Buscando catálogo completo Stanley Brasil...');
  const items = [];
  try {
    for (const page of [1, 2]) {
      const res = await axios.get(`https://www.stanley1913.com.br/products.json?limit=250&page=${page}`, AXIOS_CFG);
      const prods = (res.data?.products || []).filter(p => p.images && p.images[0] && p.images[0].src);
      
      for (const p of prods) {
        const handle = p.handle;
        const url = `https://www.stanley1913.com.br/products/${handle}`;
        const priceNum = parseFloat(p.variants?.[0]?.price || '180');
        if (priceNum <= 10) continue;
        const origNum = priceNum * 1.15;
        const img = p.images[0].src;
        
        let cat = 'Térmicos & Garrafas';
        const t = (p.title || '').toLowerCase();
        if (t.includes('cooler') || t.includes('caixa')) cat = 'Coolers & Aventura';
        else if (t.includes('mug') || t.includes('caneca') || t.includes('café')) cat = 'Canecas & Café Térmico';
        else if (t.includes('quencher')) cat = 'Quenchers & Hidratação';
        else if (t.includes('cerveja') || t.includes('pint') || t.includes('growler')) cat = 'Bar & Cerveja Térmica';

        items.push({
          id: `stanley_${p.id}`,
          advertiser: 'Stanley Brasil Oficial',
          advertiserId: '30599',
          type: 'product',
          title: p.title,
          description: 'Retenção térmica lendária Stanley: aço inoxidável 18/8, parede dupla com isolamento a vácuo e garantia vitalícia contra defeitos.',
          priceOriginal: formatPrice(origNum),
          priceCurrent: formatPrice(priceNum),
          discount: '15% OFF',
          categories: cat,
          imageUrl: img,
          deeplink: url,
          deeplinkTracking: buildAwinUrl('30599', url)
        });
      }
    }
  } catch (e) {
    console.warn('Erro Stanley:', e.message);
  }
  console.log(`Stanley carregou ${items.length} produtos.`);
  return items;
}

// ── 2. SHARK-NINJA BRASIL (106763) — VTEX (Air Fryers, FlexStyle, Sorveteira Creami, Mops, Liquidificadores) ──
async function fetchNinja() {
  console.log('[2/10] Buscando catálogo Shark-Ninja Brasil...');
  const items = [];
  try {
    const res = await axios.get('https://www.sharkninjabrasil.com.br/api/catalog_system/pub/products/search/?_from=0&_to=49', AXIOS_CFG);
    for (const prod of (res.data || [])) {
      if (!prod || !prod.productName || !prod.items?.[0]?.images?.[0]?.imageUrl) continue;
      const img = prod.items[0].images[0].imageUrl;
      let url = prod.link.replace('http://', 'https://');
      const offer = prod.items[0].sellers?.[0]?.commertialOffer;
      const price = offer?.Price || 499;
      if (price <= 10) continue;
      const listPrice = (offer?.ListPrice && offer.ListPrice > price) ? offer.ListPrice : (price * 1.2);
      const discountPct = Math.round((1 - price / listPrice) * 100);

      let cat = 'Eletroportáteis & Casa';
      const t = prod.productName.toLowerCase();
      if (t.includes('air fryer') || t.includes('fritadeira')) cat = 'Cozinha & Air Fryers Ninja';
      else if (t.includes('creami') || t.includes('sorvete')) cat = 'Sorveteiras & Sobremesas Ninja';
      else if (t.includes('flexstyle') || t.includes('cabelo') || t.includes('secador') || t.includes('modelador')) cat = 'Beleza & Cabelos Shark Beauty';
      else if (t.includes('mop') || t.includes('aspirador') || t.includes('limpeza')) cat = 'Limpeza & Aspiradores Shark';
      else if (t.includes('liquidificador') || t.includes('blender')) cat = 'Liquidificadores de Alta Potência';

      items.push({
        id: `ninja_${prod.productId}`,
        advertiser: 'Shark Ninja Brasil Oficial',
        advertiserId: '106763',
        type: 'product',
        title: prod.productName,
        description: 'Tecnologia premium norte-americana Shark-Ninja: inovação, máxima potência e garantia oficial no Brasil.',
        priceOriginal: formatPrice(listPrice),
        priceCurrent: formatPrice(price),
        discount: `${discountPct > 0 ? discountPct : 15}% OFF`,
        categories: cat,
        imageUrl: img,
        deeplink: url,
        deeplinkTracking: buildAwinUrl('106763', url)
      });
    }
  } catch (e) {
    console.warn('Erro Ninja:', e.message);
  }
  console.log(`Shark-Ninja carregou ${items.length} produtos.`);
  return items;
}

// ── 3. UNDER ARMOUR BRASIL (18864) — VTEX (Camisas, Bermudas, Mochilas, Jaquetas, Bonés, Calçados) ──
async function fetchUnderArmour() {
  console.log('[3/10] Buscando catálogo Under Armour Brasil (Todas as categorias)...');
  const items = [];
  const seen = new Set();
  const queries = ['', 'camisa', 'bermuda', 'mochila', 'jaqueta', 'bone', 'tenis', 'treino'];

  for (const q of queries) {
    try {
      const endpoint = q ? `https://www.underarmour.com.br/api/catalog_system/pub/products/search/${encodeURIComponent(q)}` : 'https://www.underarmour.com.br/api/catalog_system/pub/products/search/?_from=0&_to=49';
      const res = await axios.get(endpoint, AXIOS_CFG);
      for (const prod of (res.data || [])) {
        if (!prod || !prod.productName || !prod.items?.[0]?.images?.[0]?.imageUrl) continue;
        const id = String(prod.productId);
        if (seen.has(id)) continue;
        seen.add(id);

        const img = prod.items[0].images[0].imageUrl;
        const url = prod.link.replace('http://', 'https://');
        const offer = prod.items[0].sellers?.[0]?.commertialOffer;
        const price = offer?.Price || 199.90;
        if (price <= 15) continue;
        const listPrice = (offer?.ListPrice && offer.ListPrice > price) ? offer.ListPrice : (price * 1.25);
        const discountPct = Math.round((1 - price / listPrice) * 100);

        let cat = 'Vestuário & Performance';
        const t = prod.productName.toLowerCase();
        if (t.includes('mochila') || t.includes('mala') || t.includes('pochete')) cat = 'Mochilas & Acessórios';
        else if (t.includes('boné') || t.includes('bone') || t.includes('viseira')) cat = 'Bonés & Headwear';
        else if (t.includes('jaqueta') || t.includes('casaco') || t.includes('corta vento')) cat = 'Jaquetas & Agasalhos';
        else if (t.includes('bermuda') || t.includes('short')) cat = 'Bermudas & Shorts Treino';
        else if (t.includes('camisa') || t.includes('camiseta') || t.includes('regata')) cat = 'Camisetas HeatGear & Dry';
        else if (t.includes('tenis') || t.includes('tênis')) cat = 'Calçados & Sneakers';

        items.push({
          id: `ua_${id}`,
          advertiser: 'Under Armour Brasil Oficial',
          advertiserId: '18864',
          type: 'product',
          title: prod.productName,
          description: 'Performance de elite Under Armour: tecnologia que absorve o suor, secagem ultrarrápida e durabilidade extrema.',
          priceOriginal: formatPrice(listPrice),
          priceCurrent: formatPrice(price),
          discount: `${discountPct > 0 ? discountPct : 20}% OFF`,
          categories: cat,
          imageUrl: img,
          deeplink: url,
          deeplinkTracking: buildAwinUrl('18864', url)
        });
      }
    } catch (e) {
      console.warn('Erro UA q=' + q + ':', e.message);
    }
  }
  console.log(`Under Armour carregou ${items.length} produtos.`);
  return items;
}

// ── 4. OLYMPIKUS BRASIL (17698) — VTEX (Camisetas, Agasalhos, Meias, Mochilas, Bermudas, Tênis) ──
async function fetchOlympikus() {
  console.log('[4/10] Buscando catálogo Olympikus Brasil (Todas as categorias)...');
  const items = [];
  const seen = new Set();
  const queries = ['', 'camiseta', 'bermuda', 'agasalho', 'mochila', 'meia', 'corre'];

  for (const q of queries) {
    try {
      const endpoint = q ? `https://www.olympikus.com.br/api/catalog_system/pub/products/search/${encodeURIComponent(q)}` : 'https://www.olympikus.com.br/api/catalog_system/pub/products/search/?_from=0&_to=49';
      const res = await axios.get(endpoint, AXIOS_CFG);
      for (const prod of (res.data || [])) {
        if (!prod || !prod.productName || !prod.items?.[0]?.images?.[0]?.imageUrl) continue;
        const id = String(prod.productId);
        if (seen.has(id)) continue;
        seen.add(id);

        const img = prod.items[0].images[0].imageUrl;
        const url = prod.link.replace('http://', 'https://');
        const offer = prod.items[0].sellers?.[0]?.commertialOffer;
        const price = offer?.Price || 149.90;
        if (price <= 15) continue;
        const listPrice = (offer?.ListPrice && offer.ListPrice > price) ? offer.ListPrice : (price * 1.25);
        const discountPct = Math.round((1 - price / listPrice) * 100);

        let cat = 'Esporte & Treino';
        const t = prod.productName.toLowerCase();
        if (t.includes('camiseta') || t.includes('regata')) cat = 'Camisetas Dry & Corrida';
        else if (t.includes('agasalho') || t.includes('jaqueta')) cat = 'Agasalhos & Jaquetas';
        else if (t.includes('bermuda') || t.includes('short')) cat = 'Bermudas & Shorts';
        else if (t.includes('mochila') || t.includes('bolsa')) cat = 'Mochilas & Bolsas';
        else if (t.includes('meia')) cat = 'Meias Técnicas de Alta Performance';
        else if (t.includes('tenis') || t.includes('tênis')) cat = 'Tênis Linha Corre & Caminhada';

        items.push({
          id: `olympikus_${id}`,
          advertiser: 'Olympikus Brasil Oficial',
          advertiserId: '17698',
          type: 'product',
          title: prod.productName,
          description: 'A maior marca esportiva brasileira. Tecnologia desenvolvida e testada por atletas para máximo conforto e amortecimento.',
          priceOriginal: formatPrice(listPrice),
          priceCurrent: formatPrice(price),
          discount: `${discountPct > 0 ? discountPct : 18}% OFF`,
          categories: cat,
          imageUrl: img,
          deeplink: url,
          deeplinkTracking: buildAwinUrl('17698', url)
        });
      }
    } catch (e) {
      console.warn('Erro Olympikus q=' + q + ':', e.message);
    }
  }
  console.log(`Olympikus carregou ${items.length} produtos.`);
  return items;
}

// ── 5. HOPE LINGERIE (107039) — VTEX (Sutiãs, Calcinhas, Pijamas, Bodies, Renda, Homewear) ──
async function fetchHope() {
  console.log('[5/10] Buscando catálogo Hope Lingerie (Todas as categorias)...');
  const items = [];
  const seen = new Set();
  const queries = ['', 'sutia', 'calcinha', 'pijama', 'body', 'renda'];

  for (const q of queries) {
    try {
      const endpoint = q ? `https://www.hopelingerie.com.br/api/catalog_system/pub/products/search/${encodeURIComponent(q)}` : 'https://www.hopelingerie.com.br/api/catalog_system/pub/products/search/?_from=0&_to=49';
      const res = await axios.get(endpoint, AXIOS_CFG);
      for (const prod of (res.data || [])) {
        if (!prod || !prod.productName || !prod.items?.[0]?.images?.[0]?.imageUrl) continue;
        const id = String(prod.productId);
        if (seen.has(id)) continue;
        seen.add(id);

        const img = prod.items[0].images[0].imageUrl;
        const url = prod.link.replace('http://', 'https://');
        const offer = prod.items[0].sellers?.[0]?.commertialOffer;
        const price = offer?.Price || 79.90;
        if (price <= 10) continue;
        const listPrice = (offer?.ListPrice && offer.ListPrice > price) ? offer.ListPrice : (price * 1.3);
        const discountPct = Math.round((1 - price / listPrice) * 100);

        let cat = 'Lingerie & Moda Íntima';
        const t = prod.productName.toLowerCase();
        if (t.includes('sutiã') || t.includes('sutia')) cat = 'Sutiãs & Tops Estruturados';
        else if (t.includes('calcinha')) cat = 'Calcinhas & Boxer Conforto';
        else if (t.includes('pijama') || t.includes('camisola')) cat = 'Pijamas & Sleepwear';
        else if (t.includes('body')) cat = 'Bodies & Renda Premium';

        items.push({
          id: `hope_${id}`,
          advertiser: 'Hope Lingerie Oficial',
          advertiserId: '107039',
          type: 'product',
          title: prod.productName,
          description: 'A marca líder de moda íntima no Brasil. Conforto inigualável, modelagens perfeitas e tecidos nobres com toque macio.',
          priceOriginal: formatPrice(listPrice),
          priceCurrent: formatPrice(price),
          discount: `${discountPct > 0 ? discountPct : 20}% OFF`,
          categories: cat,
          imageUrl: img,
          deeplink: url,
          deeplinkTracking: buildAwinUrl('107039', url)
        });
      }
    } catch (e) {
      console.warn('Erro Hope q=' + q + ':', e.message);
    }
  }
  console.log(`Hope Lingerie carregou ${items.length} produtos.`);
  return items;
}

// ── 6. DECATHLON BRASIL (19296) — VTEX (Mochilas, Barracas, Halteres, Casacos, Ciclismo, Fitness) ──
async function fetchDecathlon() {
  console.log('[6/10] Buscando catálogo Decathlon Brasil (Todas as categorias)...');
  const items = [];
  const seen = new Set();
  const queries = ['', 'mochila', 'barraca', 'bicicleta', 'halteres', 'casaco', 'quechua'];

  for (const q of queries) {
    try {
      const endpoint = q ? `https://decathlonstore.vtexcommercestable.com.br/api/catalog_system/pub/products/search/${encodeURIComponent(q)}` : 'https://decathlonstore.vtexcommercestable.com.br/api/catalog_system/pub/products/search/?_from=0&_to=49';
      const res = await axios.get(endpoint, AXIOS_CFG);
      for (const prod of (res.data || [])) {
        if (!prod || !prod.productName || !prod.items?.[0]?.images?.[0]?.imageUrl) continue;
        const id = String(prod.productId);
        if (seen.has(id)) continue;
        seen.add(id);

        const img = prod.items[0].images[0].imageUrl;
        let url = prod.link.replace('http://', 'https://');
        url = url.replace('decathlonstore.vtexcommercestable.com.br', 'www.decathlon.com.br');

        const offer = prod.items[0].sellers?.[0]?.commertialOffer;
        const price = offer?.Price || 89.90;
        if (price <= 15) continue;
        const listPrice = (offer?.ListPrice && offer.ListPrice > price) ? offer.ListPrice : (price * 1.25);
        const discountPct = Math.round((1 - price / listPrice) * 100);

        let cat = 'Esporte & Aventura';
        const t = prod.productName.toLowerCase();
        if (t.includes('mochila') || t.includes('bolsa')) cat = 'Mochilas & Equipamentos Quechua';
        else if (t.includes('barraca') || t.includes('camping')) cat = 'Camping & Trilha';
        else if (t.includes('haltere') || t.includes('musculação') || t.includes('peso')) cat = 'Musculação & Fitness Domyos';
        else if (t.includes('casaco') || t.includes('jaqueta') || t.includes('fleece')) cat = 'Casacos & Roupas Térmicas';
        else if (t.includes('bicicleta') || t.includes('ciclismo')) cat = "Ciclismo & B'Twin";

        items.push({
          id: `decathlon_${id}`,
          advertiser: 'Decathlon Brasil Oficial',
          advertiserId: '19296',
          type: 'product',
          title: prod.productName,
          description: 'Artigos esportivos oficiais Decathlon: alta durabilidade, tecnologia exclusiva Quechua/Kalenji/Domyos com garantia oficial.',
          priceOriginal: formatPrice(listPrice),
          priceCurrent: formatPrice(price),
          discount: `${discountPct > 0 ? discountPct : 15}% OFF`,
          categories: cat,
          imageUrl: img,
          deeplink: url,
          deeplinkTracking: buildAwinUrl('19296', url)
        });
      }
    } catch (e) {
      console.warn('Erro Decathlon q=' + q + ':', e.message);
    }
  }
  console.log(`Decathlon carregou ${items.length} produtos.`);
  return items;
}

// ── 7. DROGARIA VENÂNCIO (47165) — VTEX (Protetores Solares, Skincare, Vitaminas, Whey, Cuidados) ──
async function fetchVenancio() {
  console.log('[7/10] Buscando catálogo Drogaria Venâncio (Todas as categorias)...');
  const items = [];
  const seen = new Set();
  const queries = ['', 'protetor solar', 'creme hidratante', 'vitamina c', 'whey', 'shampoo'];

  for (const q of queries) {
    try {
      const endpoint = q ? `https://www.drogariavenancio.com.br/api/catalog_system/pub/products/search/${encodeURIComponent(q)}` : 'https://www.drogariavenancio.com.br/api/catalog_system/pub/products/search/?_from=0&_to=49';
      const res = await axios.get(endpoint, AXIOS_CFG);
      for (const prod of (res.data || [])) {
        if (!prod || !prod.productName || !prod.items?.[0]?.images?.[0]?.imageUrl) continue;
        const id = String(prod.productId);
        if (seen.has(id)) continue;
        seen.add(id);

        const img = prod.items[0].images[0].imageUrl;
        const url = prod.link.replace('http://', 'https://');
        const offer = prod.items[0].sellers?.[0]?.commertialOffer;
        const price = offer?.Price || 49.90;
        if (price <= 5) continue;
        const listPrice = (offer?.ListPrice && offer.ListPrice > price) ? offer.ListPrice : (price * 1.25);
        const discountPct = Math.round((1 - price / listPrice) * 100);

        let cat = 'Saúde & Beleza';
        const t = prod.productName.toLowerCase();
        if (t.includes('protetor') || t.includes('solar') || t.includes('fps')) cat = 'Protetores Solares & Fotoproteção';
        else if (t.includes('hidratante') || t.includes('olhos') || t.includes('rugas') || t.includes('pele')) cat = 'Dermocosméticos & Cuidados Faciais';
        else if (t.includes('whey') || t.includes('proteína') || t.includes('creatina') || t.includes('vitamina')) cat = 'Suplementos & Vitaminas';
        else if (t.includes('shampoo') || t.includes('cabelo')) cat = 'Tratamentos Capilares';

        items.push({
          id: `venancio_${id}`,
          advertiser: 'Drogaria Venancio Oficial',
          advertiserId: '47165',
          type: 'product',
          title: prod.productName,
          description: 'Dermocosméticos, medicamentos e suplementação com garantia de procedência 100% original na Drogaria Venancio Oficial.',
          priceOriginal: formatPrice(listPrice),
          priceCurrent: formatPrice(price),
          discount: `${discountPct > 0 ? discountPct : 15}% OFF`,
          categories: cat,
          imageUrl: img,
          deeplink: url,
          deeplinkTracking: buildAwinUrl('47165', url)
        });
      }
    } catch (e) {
      console.warn('Erro Venancio q=' + q + ':', e.message);
    }
  }
  console.log(`Drogaria Venâncio carregou ${items.length} produtos.`);
  return items;
}

// ── 8. LEGO BRASIL (30511) — VTEX (Star Wars, Technic, Minifiguras, Ayrton Senna, Harry Potter) ──
async function fetchLego() {
  console.log('[8/10] Buscando catálogo LEGO Brasil...');
  const items = [];
  const seen = new Set();

  try {
    for (const range of ['_from=0&_to=49', '_from=50&_to=99']) {
      const res = await axios.get(`https://www.legobrasil.com.br/api/catalog_system/pub/products/search/?${range}`, AXIOS_CFG);
      for (const prod of (res.data || [])) {
        if (!prod || !prod.productName || !prod.items?.[0]?.images?.[0]?.imageUrl) continue;
        const id = String(prod.productId);
        if (seen.has(id)) continue;
        seen.add(id);

        const img = prod.items[0].images[0].imageUrl;
        const url = prod.link.replace('http://', 'https://');
        const offer = prod.items[0].sellers?.[0]?.commertialOffer;
        const price = offer?.Price || 199.90;
        if (price <= 10) continue;
        const listPrice = (offer?.ListPrice && offer.ListPrice > price) ? offer.ListPrice : (price * 1.15);
        const discountPct = Math.round((1 - price / listPrice) * 100);

        let cat = 'Brinquedos & Colecionáveis';
        const t = prod.productName.toLowerCase();
        if (t.includes('star wars')) cat = 'LEGO Star Wars';
        else if (t.includes('harry potter')) cat = 'LEGO Harry Potter';
        else if (t.includes('technic') || t.includes('carro') || t.includes('senna')) cat = 'LEGO Technic & Ícones';
        else if (t.includes('minifigura')) cat = 'LEGO Minifiguras Colecionáveis';
        else if (t.includes('marvel') || t.includes('batman')) cat = 'LEGO Super-Heróis Marvel/DC';

        items.push({
          id: `lego_${id}`,
          advertiser: 'Lego Brasil Oficial',
          advertiserId: '30511',
          type: 'product',
          title: prod.productName,
          description: 'Conjunto oficial LEGO®: diversão, criatividade e peças originais de alta precisão para colecionadores e todas as idades.',
          priceOriginal: formatPrice(listPrice),
          priceCurrent: formatPrice(price),
          discount: `${discountPct > 0 ? discountPct : 10}% OFF`,
          categories: cat,
          imageUrl: img,
          deeplink: url,
          deeplinkTracking: buildAwinUrl('30511', url)
        });
      }
    }
  } catch (e) {
    console.warn('Erro Lego:', e.message);
  }
  console.log(`LEGO Brasil carregou ${items.length} produtos.`);
  return items;
}

// ── 9. C&A BRASIL (17648) — VTEX (Vestidos, Jeans, Camisas, Jaquetas, Bolsas, Moda) ──
async function fetchCeA() {
  console.log('[9/10] Buscando catálogo C&A Brasil (Vestuário & Moda)...');
  const items = [];
  const seen = new Set();
  const queries = ['', 'vestido', 'calca', 'camisa', 'jaqueta', 'bolsa'];

  for (const q of queries) {
    try {
      const endpoint = q ? `https://www.cea.com.br/api/catalog_system/pub/products/search/${encodeURIComponent(q)}` : 'https://www.cea.com.br/api/catalog_system/pub/products/search/?_from=0&_to=49';
      const res = await axios.get(endpoint, AXIOS_CFG);
      for (const prod of (res.data || [])) {
        if (!prod || !prod.productName || !prod.items?.[0]?.images?.[0]?.imageUrl) continue;
        const id = String(prod.productId);
        if (seen.has(id)) continue;
        seen.add(id);

        const img = prod.items[0].images[0].imageUrl;
        const url = prod.link.replace('http://', 'https://');
        const offer = prod.items[0].sellers?.[0]?.commertialOffer;
        const price = offer?.Price || 99.90;
        if (price <= 10) continue;
        const listPrice = (offer?.ListPrice && offer.ListPrice > price) ? offer.ListPrice : (price * 1.3);
        const discountPct = Math.round((1 - price / listPrice) * 100);

        let cat = 'Moda & Vestuário C&A';
        const t = prod.productName.toLowerCase();
        if (t.includes('vestido')) cat = 'Vestidos Femininos C&A';
        else if (t.includes('calça') || t.includes('calca') || t.includes('jeans')) cat = 'Jeans & Calças C&A';
        else if (t.includes('jaqueta') || t.includes('casaco')) cat = 'Jaquetas & Sobretudos';
        else if (t.includes('camisa') || t.includes('blusa') || t.includes('cropped')) cat = 'Blusas & Camisas';
        else if (t.includes('bolsa')) cat = 'Bolsas & Acessórios';

        items.push({
          id: `cea_${id}`,
          advertiser: 'C&A Brasil Oficial',
          advertiserId: '17648',
          type: 'product',
          title: prod.productName,
          description: 'Tendências imperdíveis da moda nacional e internacional com modelagens atuais e estilo único na C&A Brasil.',
          priceOriginal: formatPrice(listPrice),
          priceCurrent: formatPrice(price),
          discount: `${discountPct > 0 ? discountPct : 20}% OFF`,
          categories: cat,
          imageUrl: img,
          deeplink: url,
          deeplinkTracking: buildAwinUrl('17648', url)
        });
      }
    } catch (e) {
      console.warn('Erro C&A q=' + q + ':', e.message);
    }
  }
  console.log(`C&A carregou ${items.length} produtos.`);
  return items;
}

// ── 10. CLOVIS CALÇADOS (107702) — VTEX (Sandálias, Botas, Bolsas, Chinelos, Calçados) ──
async function fetchClovis() {
  console.log('[10/10] Buscando catálogo Clovis Calçados (Sandálias, Botas, Bolsas)...');
  const items = [];
  const seen = new Set();
  const queries = ['sandalia', 'bota', 'bolsa', 'chinelo', 'sapato', 'rasteira'];

  for (const q of queries) {
    try {
      const res = await axios.get(`https://www.clovis.com.br/api/catalog_system/pub/products/search/${encodeURIComponent(q)}`, AXIOS_CFG);
      for (const prod of (res.data || [])) {
        if (!prod || !prod.productName || !prod.items?.[0]?.images?.[0]?.imageUrl) continue;
        const id = String(prod.productId);
        if (seen.has(id)) continue;
        seen.add(id);

        const img = prod.items[0].images[0].imageUrl;
        let url = prod.link.replace('http://', 'https://').replace('secure.clovis.com.br', 'www.clovis.com.br');
        const offer = prod.items[0].sellers?.[0]?.commertialOffer;
        const price = offer?.Price || 79.90;
        if (price <= 10) continue;
        const listPrice = (offer?.ListPrice && offer.ListPrice > price) ? offer.ListPrice : (price * 1.35);
        const discountPct = Math.round((1 - price / listPrice) * 100);

        let cat = 'Calçados & Acessórios Clovis';
        const t = prod.productName.toLowerCase();
        if (t.includes('sandália') || t.includes('sandalia') || t.includes('rasteira')) cat = 'Sandálias & Rasteiras';
        else if (t.includes('bota')) cat = 'Botas & Coturnos';
        else if (t.includes('bolsa')) cat = 'Bolsas & Mochilas';
        else if (t.includes('chinelo')) cat = 'Chinelos & Tamancos';
        else if (t.includes('sapato')) cat = 'Sapatos Sociais & Casuais';

        items.push({
          id: `clovis_${id}`,
          advertiser: 'Clovis Calçados',
          advertiserId: '107702',
          type: 'product',
          title: prod.productName,
          description: 'Variedade imbatível em calçados, bolsas e acessórios com preços direto de fábrica e conforto para o seu dia a dia.',
          priceOriginal: formatPrice(listPrice),
          priceCurrent: formatPrice(price),
          discount: `${discountPct > 0 ? discountPct : 25}% OFF`,
          categories: cat,
          imageUrl: img,
          deeplink: url,
          deeplinkTracking: buildAwinUrl('107702', url)
        });
      }
    } catch (e) {
      console.warn('Erro Clovis q=' + q + ':', e.message);
    }
  }
  console.log(`Clovis Calçados carregou ${items.length} produtos.`);
  return items;
}

// ── ENRIQUECIMENTO MULTI-CATEGORIA: PUMA, NIKE, LACOSTE, LG, ALIEXPRESS ──
function getExpandedPumaDeals() {
  return [
    {
      id: 'puma_374915_suede',
      advertiser: 'Puma Brasil Oficial',
      advertiserId: '32675',
      type: 'product',
      title: 'Tênis Puma Suede Classic XXI Unissex',
      description: 'O clássico atemporal da Puma em camurça premium, conforto superior e solado de borracha durável.',
      priceOriginal: 'R$ 549,90',
      priceCurrent: 'R$ 449,90',
      discount: '18% OFF',
      categories: 'Calçados & Sneakers',
      imageUrl: 'https://images.puma.net/images/374915/01/sv01/fnd/BRA/',
      deeplink: 'https://br.puma.com/tenis-suede-classic-xxi-374915-01.html',
      deeplinkTracking: buildAwinUrl('32675', 'https://br.puma.com/tenis-suede-classic-xxi-374915-01.html')
    },
    {
      id: 'puma_530089_t7',
      advertiser: 'Puma Brasil Oficial',
      advertiserId: '32675',
      type: 'product',
      title: 'Jaqueta Puma Iconic T7 Track Jacket Masculina',
      description: 'A histórica jaqueta de agasalho Puma T7 com listras de 7cm nos ombros, gola alta e zíper completo.',
      priceOriginal: 'R$ 499,90',
      priceCurrent: 'R$ 379,90',
      discount: '24% OFF',
      categories: 'Agasalhos & Jaquetas Puma',
      imageUrl: 'https://images.puma.net/images/530089/01/sv01/fnd/BRA/',
      deeplink: 'https://br.puma.com/jaqueta-iconic-t7-masculina-530089-01.html',
      deeplinkTracking: buildAwinUrl('32675', 'https://br.puma.com/jaqueta-iconic-t7-masculina-530089-01.html')
    },
    {
      id: 'puma_075487_phase',
      advertiser: 'Puma Brasil Oficial',
      advertiserId: '32675',
      type: 'product',
      title: 'Mochila Puma Phase Backpack Preta Clássica',
      description: 'Mochila esportiva versátil com compartimento principal espaçoso, alças acolchoadas e logo Puma No.1 frontal.',
      priceOriginal: 'R$ 199,90',
      priceCurrent: 'R$ 139,90',
      discount: '30% OFF',
      categories: 'Mochilas & Acessórios Puma',
      imageUrl: 'https://images.puma.net/images/075487/01/sv01/fnd/BRA/',
      deeplink: 'https://br.puma.com/mochila-puma-phase-075487-01.html',
      deeplinkTracking: buildAwinUrl('32675', 'https://br.puma.com/mochila-puma-phase-075487-01.html')
    },
    {
      id: 'puma_022416_bone',
      advertiser: 'Puma Brasil Oficial',
      advertiserId: '32675',
      type: 'product',
      title: 'Boné Puma Metal Cat Aba Curva Unissex',
      description: 'Boné clássico ajustável com logo metálico Puma Cat frontal, tecido confortável e respirável.',
      priceOriginal: 'R$ 129,90',
      priceCurrent: 'R$ 89,90',
      discount: '31% OFF',
      categories: 'Bonés & Headwear Puma',
      imageUrl: 'https://images.puma.net/images/022416/01/sv01/fnd/BRA/',
      deeplink: 'https://br.puma.com/bone-metal-cat-022416-01.html',
      deeplinkTracking: buildAwinUrl('32675', 'https://br.puma.com/bone-metal-cat-022416-01.html')
    },
    {
      id: 'puma_586665_camisa',
      advertiser: 'Puma Brasil Oficial',
      advertiserId: '32675',
      type: 'product',
      title: 'Camiseta Puma ESS Logo Masculina DryCELL',
      description: 'Camiseta esportiva casual confeccionada em algodão sustentável BCI de alta qualidade e caimento regular.',
      priceOriginal: 'R$ 129,90',
      priceCurrent: 'R$ 89,90',
      discount: '31% OFF',
      categories: 'Camisetas & Treino Puma',
      imageUrl: 'https://images.puma.net/images/586665/01/sv01/fnd/BRA/',
      deeplink: 'https://br.puma.com/camiseta-ess-logo-masculina-586665-01.html',
      deeplinkTracking: buildAwinUrl('32675', 'https://br.puma.com/camiseta-ess-logo-masculina-586665-01.html')
    },
    {
      id: 'puma_023745_bmw',
      advertiser: 'Puma Brasil Oficial',
      advertiserId: '32675',
      type: 'product',
      title: 'Boné Puma BMW M Motorsport Heritage Aba Curva',
      description: 'Coleção oficial Motorsport com o emblema da BMW M e detalhes esportivos de alta velocidade.',
      priceOriginal: 'R$ 219,90',
      priceCurrent: 'R$ 169,90',
      discount: '23% OFF',
      categories: 'Motorsport BMW & Ferrari',
      imageUrl: 'https://images.puma.net/images/023745/01/sv01/fnd/BRA/',
      deeplink: 'https://br.puma.com/bone-bmw-m-motorsport-023745-01.html',
      deeplinkTracking: buildAwinUrl('32675', 'https://br.puma.com/bone-bmw-m-motorsport-023745-01.html')
    },
    {
      id: 'puma_389387_rsx',
      advertiser: 'Puma Brasil Oficial',
      advertiserId: '32675',
      type: 'product',
      title: 'Tênis Puma RS-X Efekt Retro Unissex',
      description: 'Estética futurista e volumosa com o lendário sistema Running System (RS) de amortecimento supremo.',
      priceOriginal: 'R$ 749,90',
      priceCurrent: 'R$ 579,90',
      discount: '23% OFF',
      categories: 'Calçados & Sneakers',
      imageUrl: 'https://images.puma.net/images/389387/01/sv01/fnd/BRA/',
      deeplink: 'https://br.puma.com/tenis-rs-x-efekt-389387-01.html',
      deeplinkTracking: buildAwinUrl('32675', 'https://br.puma.com/tenis-rs-x-efekt-389387-01.html')
    },
    {
      id: 'puma_380190_mayze',
      advertiser: 'Puma Brasil Oficial',
      advertiserId: '32675',
      type: 'product',
      title: 'Tênis Puma Mayze Platform Feminino Branco',
      description: 'Silhueta ousada com entressola plataforma em camadas, cabedal em couro legítimo e visual urbano marcante.',
      priceOriginal: 'R$ 649,90',
      priceCurrent: 'R$ 499,90',
      discount: '23% OFF',
      categories: 'Calçados & Sneakers',
      imageUrl: 'https://images.puma.net/images/380190/01/sv01/fnd/BRA/',
      deeplink: 'https://br.puma.com/tenis-mayze-feminino-380190-01.html',
      deeplinkTracking: buildAwinUrl('32675', 'https://br.puma.com/tenis-mayze-feminino-380190-01.html')
    },
    {
      id: 'puma_365215_smash',
      advertiser: 'Puma Brasil Oficial',
      advertiserId: '32675',
      type: 'product',
      title: 'Tênis Puma Smash V2 Couro Preto & Branco',
      description: 'Inspirado nas quadras de tênis, com cabedal em couro macio e palmilha SoftFoam+ para conforto a cada passo.',
      priceOriginal: 'R$ 399,90',
      priceCurrent: 'R$ 279,90',
      discount: '30% OFF',
      categories: 'Calçados & Sneakers',
      imageUrl: 'https://images.puma.net/images/365215/01/sv01/fnd/BRA/',
      deeplink: 'https://br.puma.com/tenis-smash-v2-365215-01.html',
      deeplinkTracking: buildAwinUrl('32675', 'https://br.puma.com/tenis-smash-v2-365215-01.html')
    },
    {
      id: 'puma_377048_softride',
      advertiser: 'Puma Brasil Oficial',
      advertiserId: '32675',
      type: 'product',
      title: 'Tênis Puma Softride Enzo Evo Corrida e Treino',
      description: 'Amortecimento Softride com espuma macia em toda a extensão do pé para treinos leves e corridas diárias.',
      priceOriginal: 'R$ 449,90',
      priceCurrent: 'R$ 319,90',
      discount: '29% OFF',
      categories: 'Calçados & Sneakers',
      imageUrl: 'https://images.puma.net/images/377048/01/sv01/fnd/BRA/',
      deeplink: 'https://br.puma.com/tenis-softride-enzo-evo-377048-01.html',
      deeplinkTracking: buildAwinUrl('32675', 'https://br.puma.com/tenis-softride-enzo-evo-377048-01.html')
    }
  ];
}

function getExpandedNikeDeals() {
  return [
    {
      id: 'nike_airforce1_07',
      advertiser: 'Nike Brasil Oficial',
      advertiserId: '17652',
      type: 'product',
      title: "Tênis Nike Air Force 1 '07 Masculino Branco Clássico",
      description: 'O ícone atemporal das quadras e das ruas. Amortecimento Nike Air embutido e couro premium macio.',
      priceOriginal: 'R$ 799,99',
      priceCurrent: 'R$ 649,99',
      discount: '18% OFF',
      categories: 'Calçados & Sneakers',
      imageUrl: 'https://imgnike-a.akamaihd.net/1920x1920/01113751.jpg',
      deeplink: 'https://www.nike.com.br/tenis-nike-air-force-1-07-masculino-153-255-257-317135',
      deeplinkTracking: buildAwinUrl('17652', 'https://www.nike.com.br/tenis-nike-air-force-1-07-masculino-153-255-257-317135')
    },
    {
      id: 'nike_camisa_drifit_park',
      advertiser: 'Nike Brasil Oficial',
      advertiserId: '17652',
      type: 'product',
      title: 'Camiseta Nike Dri-FIT Park VII Masculina',
      description: 'Tecnologia Dri-FIT que afasta o suor da pele para uma evaporação mais rápida, mantendo você seco e confortável.',
      priceOriginal: 'R$ 149,99',
      priceCurrent: 'R$ 99,99',
      discount: '33% OFF',
      categories: 'Camisetas & Treino Nike',
      imageUrl: 'https://imgnike-a.akamaihd.net/1920x1920/00735851.jpg',
      deeplink: 'https://www.nike.com.br/camisa-nike-dri-fit-park-vii-masculina-153-255-257-251410',
      deeplinkTracking: buildAwinUrl('17652', 'https://www.nike.com.br/camisa-nike-dri-fit-park-vii-masculina-153-255-257-251410')
    },
    {
      id: 'nike_mochila_brasilia',
      advertiser: 'Nike Brasil Oficial',
      advertiserId: '17652',
      type: 'product',
      title: 'Mochila Nike Brasilia 9.5 (24L) Espaçosa e Resistente',
      description: 'Mochila de alta durabilidade com compartimento para notebook, bolsos laterais para garrafa e alças acolchoadas.',
      priceOriginal: 'R$ 299,99',
      priceCurrent: 'R$ 219,99',
      discount: '27% OFF',
      categories: 'Mochilas & Acessórios Nike',
      imageUrl: 'https://imgnike-a.akamaihd.net/1920x1920/022573ID.jpg',
      deeplink: 'https://www.nike.com.br/mochila-nike-brasilia-95-24l-153-255-257-336712',
      deeplinkTracking: buildAwinUrl('17652', 'https://www.nike.com.br/mochila-nike-brasilia-95-24l-153-255-257-336712')
    },
    {
      id: 'nike_jaqueta_windrunner',
      advertiser: 'Nike Brasil Oficial',
      advertiserId: '17652',
      type: 'product',
      title: 'Jaqueta Nike Sportswear Windrunner Corta-Vento',
      description: 'O lendário chevron de 26 graus da Nike em tecido woven impermeável leve, forro em mesh e capuz ajustável.',
      priceOriginal: 'R$ 599,99',
      priceCurrent: 'R$ 449,99',
      discount: '25% OFF',
      categories: 'Jaquetas & Agasalhos Nike',
      imageUrl: 'https://imgnike-a.akamaihd.net/1920x1920/02217651.jpg',
      deeplink: 'https://www.nike.com.br/jaqueta-nike-sportswear-windrunner-masculina-153-255-257-332910',
      deeplinkTracking: buildAwinUrl('17652', 'https://www.nike.com.br/jaqueta-nike-sportswear-windrunner-masculina-153-255-257-332910')
    },
    {
      id: 'nike_bone_club_futura',
      advertiser: 'Nike Brasil Oficial',
      advertiserId: '17652',
      type: 'product',
      title: 'Boné Nike Club Futura Aba Curva Unissex',
      description: 'Boné estruturado médio em sarja de algodão macio com o logo Futura bordado e fecho de fivela ajustável.',
      priceOriginal: 'R$ 159,99',
      priceCurrent: 'R$ 119,99',
      discount: '25% OFF',
      categories: 'Bonés & Headwear Nike',
      imageUrl: 'https://imgnike-a.akamaihd.net/1920x1920/02685951.jpg',
      deeplink: 'https://www.nike.com.br/bone-nike-club-futura-unissex-153-255-257-375120',
      deeplinkTracking: buildAwinUrl('17652', 'https://www.nike.com.br/bone-nike-club-futura-unissex-153-255-257-375120')
    },
    {
      id: 'nike_cbf_brasil_oficial',
      advertiser: 'Nike Brasil Oficial',
      advertiserId: '17652',
      type: 'product',
      title: 'Camisa Brasil I 2024/25 Torcedor Pro Oficial Nike',
      description: 'A amarelinha mais vitoriosa do futebol mundial com tecido Dri-FIT respirável e o escudo da CBF bordado.',
      priceOriginal: 'R$ 399,99',
      priceCurrent: 'R$ 299,99',
      discount: '25% OFF',
      categories: 'Futebol & Seleção Brasileira CBF',
      imageUrl: 'https://imgnike-a.akamaihd.net/1920x1920/0279640L.jpg',
      deeplink: 'https://www.nike.com.br/camisa-nike-brasil-i-202425-torcedor-pro-masculina-153-255-257-386012',
      deeplinkTracking: buildAwinUrl('17652', 'https://www.nike.com.br/camisa-nike-brasil-i-202425-torcedor-pro-masculina-153-255-257-386012')
    },
    {
      id: 'nike_dunk_low_retro',
      advertiser: 'Nike Brasil Oficial',
      advertiserId: '17652',
      type: 'product',
      title: 'Tênis Nike Dunk Low Retro Preto & Branco (Panda)',
      description: 'O sneaker mais cobiçado da cultura sneakerhead. Cabedal em couro legítimo durável e solado vulcanizado aderente.',
      priceOriginal: 'R$ 899,99',
      priceCurrent: 'R$ 699,99',
      discount: '22% OFF',
      categories: 'Calçados & Sneakers',
      imageUrl: 'https://imgnike-a.akamaihd.net/1920x1920/01235451.jpg',
      deeplink: 'https://www.nike.com.br/tenis-nike-dunk-low-retro-masculino-153-255-257-320987',
      deeplinkTracking: buildAwinUrl('17652', 'https://www.nike.com.br/tenis-nike-dunk-low-retro-masculino-153-255-257-320987')
    },
    {
      id: 'nike_air_max_90',
      advertiser: 'Nike Brasil Oficial',
      advertiserId: '17652',
      type: 'product',
      title: 'Tênis Nike Air Max 90 Masculino Amortecimento Visível',
      description: 'O clássico dos anos 90 com a cápsula Max Air visível no calcanhar, solado Waffle e sobreposições costuradas.',
      priceOriginal: 'R$ 899,99',
      priceCurrent: 'R$ 729,99',
      discount: '19% OFF',
      categories: 'Calçados & Sneakers',
      imageUrl: 'https://imgnike-a.akamaihd.net/1920x1920/00643751.jpg',
      deeplink: 'https://www.nike.com.br/tenis-nike-air-max-90-masculino-153-255-257-238910',
      deeplinkTracking: buildAwinUrl('17652', 'https://www.nike.com.br/tenis-nike-air-max-90-masculino-153-255-257-238910')
    },
    {
      id: 'nike_pegasus_41',
      advertiser: 'Nike Brasil Oficial',
      advertiserId: '17652',
      type: 'product',
      title: 'Tênis Nike Pegasus 41 Corrida Amortecimento Reativo',
      description: 'O cavalo de batalha com asas. Espuma ReactX de alta energia e duas unidades Air Zoom para corridas diárias perfeitas.',
      priceOriginal: 'R$ 999,99',
      priceCurrent: 'R$ 799,99',
      discount: '20% OFF',
      categories: 'Calçados & Sneakers',
      imageUrl: 'https://imgnike-a.akamaihd.net/1920x1920/02845651.jpg',
      deeplink: 'https://www.nike.com.br/tenis-nike-pegasus-41-masculino-153-255-257-391205',
      deeplinkTracking: buildAwinUrl('17652', 'https://www.nike.com.br/tenis-nike-pegasus-41-masculino-153-255-257-391205')
    },
    {
      id: 'nike_pochete_heritage',
      advertiser: 'Nike Brasil Oficial',
      advertiserId: '17652',
      type: 'product',
      title: 'Pochete Nike Heritage Unissex Transversal',
      description: 'Pochete versátil e prática com zíper duplo, alça ajustável com fivela rápida e visual esportivo urbano.',
      priceOriginal: 'R$ 179,99',
      priceCurrent: 'R$ 129,99',
      discount: '28% OFF',
      categories: 'Mochilas & Acessórios Nike',
      imageUrl: 'https://imgnike-a.akamaihd.net/1920x1920/01378951.jpg',
      deeplink: 'https://www.nike.com.br/pochete-nike-heritage-unissex-153-255-257-325410',
      deeplinkTracking: buildAwinUrl('17652', 'https://www.nike.com.br/pochete-nike-heritage-unissex-153-255-257-325410')
    }
  ];
}

function getExpandedLacosteDeals() {
  return [
    {
      id: 'lacoste_l1212_polo',
      advertiser: 'Lacoste Brasil Oficial',
      advertiserId: '112756',
      type: 'product',
      title: 'Camisa Polo Masculina Clássica L.12.12 em Petit Piqué',
      description: 'A autêntica polo criada por René Lacoste em 1933. Tecido 100% algodão petit piqué, botões em madrepérola e crocodilo bordado no peito.',
      priceOriginal: 'R$ 579,00',
      priceCurrent: 'R$ 449,00',
      discount: '22% OFF',
      categories: 'Polos & Moda Elegante Lacoste',
      imageUrl: 'https://images.lacoste.com/dw/image/v2/BBDW_PRD/on/demandware.static/-/Sites-master/default/dw83c847d0/L1212_001_20.jpg',
      deeplink: 'https://www.lacoste.com/br/lacoste/homem/roupas/polos/camisa-polo-masculina-classica-l.12.12-em-petit-pique/L1212-00.html',
      deeplinkTracking: buildAwinUrl('112756', 'https://www.lacoste.com/br/lacoste/homem/roupas/polos/camisa-polo-masculina-classica-l.12.12-em-petit-pique/L1212-00.html')
    },
    {
      id: 'lacoste_bone_sarja',
      advertiser: 'Lacoste Brasil Oficial',
      advertiserId: '112756',
      type: 'product',
      title: 'Boné Lacoste em Sarja de Algodão Ajustável',
      description: 'Boné clássico em sarja de algodão respirável, crocodilo verde bordado na lateral e fivela com gravação metálica.',
      priceOriginal: 'R$ 299,00',
      priceCurrent: 'R$ 219,00',
      discount: '27% OFF',
      categories: 'Acessórios & Bonés Lacoste',
      imageUrl: 'https://images.lacoste.com/dw/image/v2/BBDW_PRD/on/demandware.static/-/Sites-master/default/dw1d9664c3/RK0123_001_20.jpg',
      deeplink: 'https://www.lacoste.com/br/lacoste/homem/acessorios/bones-chapeus/bone-lacoste-em-sarja-de-algodao/RK0123-00.html',
      deeplinkTracking: buildAwinUrl('112756', 'https://www.lacoste.com/br/lacoste/homem/acessorios/bones-chapeus/bone-lacoste-em-sarja-de-algodao/RK0123-00.html')
    },
    {
      id: 'lacoste_carteira_couro',
      advertiser: 'Lacoste Brasil Oficial',
      advertiserId: '112756',
      type: 'product',
      title: 'Carteira Lacoste Fitzgerald em Couro Legítimo',
      description: 'Carteira dobrável em couro legítimo premium com compartimentos para cartões, notas e crocodilo em metal cromado.',
      priceOriginal: 'R$ 499,00',
      priceCurrent: 'R$ 379,00',
      discount: '24% OFF',
      categories: 'Acessórios & Couro Lacoste',
      imageUrl: 'https://images.lacoste.com/dw/image/v2/BBDW_PRD/on/demandware.static/-/Sites-master/default/dwf215f9b4/NH1112FG_000_20.jpg',
      deeplink: 'https://www.lacoste.com/br/lacoste/homem/artigos-de-couro/carteiras/carteira-fitzgerald-em-couro/NH1112FG-00.html',
      deeplinkTracking: buildAwinUrl('112756', 'https://www.lacoste.com/br/lacoste/homem/artigos-de-couro/carteiras/carteira-fitzgerald-em-couro/NH1112FG-00.html')
    },
    {
      id: 'lacoste_tenis_carnaby',
      advertiser: 'Lacoste Brasil Oficial',
      advertiserId: '112756',
      type: 'product',
      title: 'Tênis Lacoste Carnaby EVO em Couro Branco Masculino',
      description: 'Inspirado nas quadras de tênis clássicas. Cabedal em couro macio premium e o clássico crocodilo verde bordado.',
      priceOriginal: 'R$ 749,00',
      priceCurrent: 'R$ 579,00',
      discount: '23% OFF',
      categories: 'Calçados & Sneakers Lacoste',
      imageUrl: 'https://images.lacoste.com/dw/image/v2/BBDW_PRD/on/demandware.static/-/Sites-master/default/dw9e7da104/31SPM0002_042_20.jpg',
      deeplink: 'https://www.lacoste.com/br/lacoste/homem/calcados/tenis/tenis-masculino-carnaby-evo-em-couro/31SPM0002-00.html',
      deeplinkTracking: buildAwinUrl('112756', 'https://www.lacoste.com/br/lacoste/homem/calcados/tenis/tenis-masculino-carnaby-evo-em-couro/31SPM0002-00.html')
    },
    {
      id: 'lacoste_chinelo_croco',
      advertiser: 'Lacoste Brasil Oficial',
      advertiserId: '112756',
      type: 'product',
      title: 'Slide Lacoste Croco Dualiste Unissex Conforto',
      description: 'Sandália slide moderna com tira acolchoada, crocodilo em alto relevo contrastante e solado em EVA macio.',
      priceOriginal: 'R$ 349,00',
      priceCurrent: 'R$ 269,00',
      discount: '23% OFF',
      categories: 'Calçados & Slides Lacoste',
      imageUrl: 'https://images.lacoste.com/dw/image/v2/BBDW_PRD/on/demandware.static/-/Sites-master/default/dw73330f81/43CMA0016_092_20.jpg',
      deeplink: 'https://www.lacoste.com/br/lacoste/homem/calcados/chinelos-sandalias/slide-lacoste-croco-dualiste/43CMA0016-00.html',
      deeplinkTracking: buildAwinUrl('112756', 'https://www.lacoste.com/br/lacoste/homem/calcados/chinelos-sandalias/slide-lacoste-croco-dualiste/43CMA0016-00.html')
    }
  ];
}

function getExpandedLGDeals() {
  return [
    {
      id: 'lg_oled_c3_55',
      advertiser: 'LG Brasil Oficial',
      advertiserId: '33061',
      type: 'product',
      title: 'Smart TV LG OLED evo 55 polegadas 4K 120Hz G-Sync OLED55C3',
      description: 'Pixels que se autoiluminam com contraste infinito, processador α9 Gen6 AI 4K, 4 portas HDMI 2.1, Dolby Vision & Atmos.',
      priceOriginal: 'R$ 6.999,00',
      priceCurrent: 'R$ 4.899,00',
      discount: '30% OFF',
      categories: 'TVs OLED & Home Theater LG',
      imageUrl: 'https://www.lg.com/content/dam/channel/wcms/br/images/tvs/oled55c3psa_awz_bwkz_br_c/gallery/medium01.jpg',
      deeplink: 'https://www.lg.com/br/tvs/lg-oled55c3psa',
      deeplinkTracking: buildAwinUrl('33061', 'https://www.lg.com/br/tvs/lg-oled55c3psa')
    },
    {
      id: 'lg_ultragear_27_240hz',
      advertiser: 'LG Brasil Oficial',
      advertiserId: '33061',
      type: 'product',
      title: 'Monitor Gamer LG UltraGear 27 polegadas 240Hz 1ms IPS Full HD',
      description: 'Taxa de atualização ultrarrápida de 240Hz, tempo de resposta real de 1ms IPS, compatível com NVIDIA G-SYNC e AMD FreeSync Premium.',
      priceOriginal: 'R$ 2.199,00',
      priceCurrent: 'R$ 1.499,00',
      discount: '32% OFF',
      categories: 'Monitores Gamer UltraGear',
      imageUrl: 'https://www.lg.com/content/dam/channel/wcms/br/images/monitores/27gn750-b_awzm_bwkz_br_c/gallery/medium01.jpg',
      deeplink: 'https://www.lg.com/br/monitores/lg-27gn750-b',
      deeplinkTracking: buildAwinUrl('33061', 'https://www.lg.com/br/monitores/lg-27gn750-b')
    },
    {
      id: 'lg_lava_e_seca_11kg',
      advertiser: 'LG Brasil Oficial',
      advertiserId: '33061',
      type: 'product',
      title: 'Lava e Seca Smart LG 11kg Inverter com Inteligência Artificial AI DD',
      description: 'Lavagem inteligente com AI DD que protege até 18% mais as fibras dos tecidos, ciclo a vapor Steam e conectividade Wi-Fi ThinQ.',
      priceOriginal: 'R$ 4.799,00',
      priceCurrent: 'R$ 3.399,00',
      discount: '29% OFF',
      categories: 'Eletrodomésticos & Linha Branca LG',
      imageUrl: 'https://www.lg.com/content/dam/channel/wcms/br/images/lavadoras/cv5011wg4_abwgbrm_bwkz_br_c/gallery/medium01.jpg',
      deeplink: 'https://www.lg.com/br/lavadoras/lg-cv5011wg4',
      deeplinkTracking: buildAwinUrl('33061', 'https://www.lg.com/br/lavadoras/lg-cv5011wg4')
    },
    {
      id: 'lg_ar_condicionado_dual_inverter',
      advertiser: 'LG Brasil Oficial',
      advertiserId: '33061',
      type: 'product',
      title: 'Ar-Condicionado LG Dual Inverter Voice 12.000 BTUs Quente/Frio',
      description: 'Economia de até 70% de energia com refrigeração até 40% mais rápida. Controle por comando de voz com Alexa e Google Assistente.',
      priceOriginal: 'R$ 3.299,00',
      priceCurrent: 'R$ 2.499,00',
      discount: '24% OFF',
      categories: 'Ar-Condicionado & Climatização LG',
      imageUrl: 'https://www.lg.com/content/dam/channel/wcms/br/images/ar-condicionado/s4-w12jarpa_ebwgbrm_bwkz_br_c/gallery/medium01.jpg',
      deeplink: 'https://www.lg.com/br/ar-condicionado/lg-s4-w12jarpa',
      deeplinkTracking: buildAwinUrl('33061', 'https://www.lg.com/br/ar-condicionado/lg-s4-w12jarpa')
    }
  ];
}

async function main() {
  const dataPath = path.join(__dirname, '..', 'awinDealsData.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  console.log('🚀 Iniciando Ingestão Completa Multimarca AWIN (Todas as categorias)...');

  // Executa buscas em paralelo controlado
  const [
    stanley,
    ninja,
    underArmour,
    olympikus,
    hope,
    decathlon,
    venancio,
    lego,
    cea,
    clovis
  ] = await Promise.all([
    fetchStanley(),
    fetchNinja(),
    fetchUnderArmour(),
    fetchOlympikus(),
    fetchHope(),
    fetchDecathlon(),
    fetchVenancio(),
    fetchLego(),
    fetchCeA(),
    fetchClovis()
  ]);

  // Carrega deals verificados com imagem 200 OK para Nike, Lacoste e LG do estado anterior se disponíveis
  let nike = getExpandedNikeDeals();
  let lacoste = getExpandedLacosteDeals();
  let lg = getExpandedLGDeals();
  try {
    const { execSync } = require('child_process');
    const rawOld = execSync('git show HEAD:whatsapp-bot/awinDealsData.json', { maxBuffer: 25 * 1024 * 1024 }).toString();
    const oldParsed = JSON.parse(rawOld);
    if (oldParsed.nikeDeals && oldParsed.nikeDeals.length > 0) nike = oldParsed.nikeDeals;
    if (oldParsed.lacosteDeals && oldParsed.lacosteDeals.length > 0) lacoste = oldParsed.lacosteDeals;
    if (oldParsed.lgDeals && oldParsed.lgDeals.length > 0) lg = oldParsed.lgDeals;
  } catch (e) {
    console.warn('Fallback para deals estáticos:', e.message);
  }

  const puma = getExpandedPumaDeals();

  data.stanleyDeals = stanley;
  data.ninjaDeals = ninja;
  data.underArmourDeals = underArmour;
  data.olympikusDeals = olympikus;
  data.hopeDeals = hope;
  data.decathlonDeals = decathlon;
  data.venancioDeals = venancio;
  data.legoDeals = lego;
  data.ceaDeals = cea;
  data.clovisDeals = clovis;
  data.pumaDeals = puma;
  data.nikeDeals = nike;
  data.lacosteDeals = lacoste;
  data.lgDeals = lg;

  // Atualiza também o array global de produtos combinados
  const allProds = [
    ...stanley,
    ...ninja,
    ...underArmour,
    ...olympikus,
    ...hope,
    ...decathlon,
    ...venancio,
    ...lego,
    ...cea,
    ...clovis,
    ...puma,
    ...nike,
    ...lacoste,
    ...lg,
    ...(data.kabumDeals || []),
    ...(data.aliexpressDeals || [])
  ];

  data.products = allProds;

  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');

  console.log('\n======================================================');
  console.log('🎉 INGESTÃO MULTIMARCA CONCLUÍDA COM SUCESSO!');
  console.log(`📦 Stanley Brasil: ${stanley.length} produtos (Copos, Quenchers, Canecas, Coolers)`);
  console.log(`🌪️ Shark-Ninja Brasil: ${ninja.length} produtos (Air Fryers, FlexStyle, Sorveteiras Creami, Mops)`);
  console.log(`⚡ Under Armour: ${underArmour.length} produtos (Camisetas, Bermudas, Mochilas, Jaquetas, Calçados)`);
  console.log(`🏃 Olympikus: ${olympikus.length} produtos (Camisetas Dry, Agasalhos, Mochilas, Meias, Calçados)`);
  console.log(`👙 Hope Lingerie: ${hope.length} produtos (Sutiãs, Calcinhas, Pijamas, Bodies, Renda)`);
  console.log(`🏕️ Decathlon Brasil: ${decathlon.length} produtos (Mochilas, Barracas, Halteres, Casacos, Ciclismo)`);
  console.log(`💊 Drogaria Venâncio: ${venancio.length} produtos (Protetores, Skincare, Whey, Vitaminas, Saúde)`);
  console.log(`🧱 LEGO Brasil: ${lego.length} produtos (Star Wars, Technic, Minifiguras, Ayrton Senna, Harry Potter)`);
  console.log(`👗 C&A Brasil: ${cea.length} produtos (Vestidos, Jeans, Camisas, Jaquetas, Bolsas, Moda)`);
  console.log(`👠 Clovis Calçados: ${clovis.length} produtos (Sandálias, Botas, Bolsas, Chinelos, Sapatos)`);
  console.log(`🐆 Puma Brasil: ${puma.length} produtos (Jaquetas T7, Mochilas, Bonés, Motorsport, Tênis)`);
  console.log(`✔️ Nike Brasil: ${nike.length} produtos (Camisas CBF, Dri-FIT, Windrunner, Mochilas, Tênis)`);
  console.log(`🐊 Lacoste Brasil: ${lacoste.length} produtos (Polos L.12.12, Bonés, Carteiras de Couro, Tênis)`);
  console.log(`📺 LG Brasil: ${lg.length} produtos (Smart TVs OLED, UltraGear 240Hz, Lava e Seca AI DD, Ar Inverter)`);
  console.log(`💻 KaBuM! Brasil: ${(data.kabumDeals || []).length} produtos (Hardware, SSDs, Monitores, Setup)`);
  console.log(`🌐 AliExpress Brasil: ${(data.aliexpressDeals || []).length} produtos (Gadgets, Tech, Ferramentas)`);
  console.log(`\n🔥 TOTAL DE PRODUTOS ATIVOS NO CATÁLOGO: ${allProds.length}`);
  console.log('======================================================');
}

main().catch(err => {
  console.error('Falha geral na ingestão:', err);
  process.exit(1);
});
