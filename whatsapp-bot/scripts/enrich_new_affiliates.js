const fs = require('fs');
const path = require('path');
const axios = require('../node_modules/axios');

const AWIN_PUBLISHER_ID = '3077915';

function buildAwinUrl(mid, targetUrl) {
  return `https://www.awin1.com/cread.php?awinmid=${mid}&awinaffid=${AWIN_PUBLISHER_ID}&clickref=PILOTO_AUTO&ued=${encodeURIComponent(targetUrl)}`;
}

async function fetchStanleyProducts() {
  console.log('[1/3] Buscando produtos Stanley...');
  const res = await axios.get('https://www.stanley1913.com.br/products.json?limit=25', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 10000
  });
  const products = (res.data.products || []).filter(p => p.images && p.images[0] && p.images[0].src);
  return products.slice(0, 10).map((p, idx) => {
    const handle = p.handle;
    const url = `https://www.stanley1913.com.br/products/${handle}`;
    const priceNum = parseFloat(p.variants?.[0]?.price || '200');
    const priceStr = `R$ ${priceNum.toFixed(2).replace('.', ',')}`;
    const origNum = (priceNum * 1.15).toFixed(2).replace('.', ',');
    return {
      id: `stanley_${p.id || idx}`,
      advertiser: 'Stanley Brasil Oficial',
      advertiserId: '30599',
      type: 'product',
      title: p.title,
      description: 'Lendária retenção térmica Stanley: aço inoxidável 18/8, parede dupla com isolamento a vácuo e garantia vitalícia contra defeitos.',
      priceOriginal: `R$ ${origNum}`,
      priceCurrent: priceStr,
      discount: '15% OFF',
      categories: 'Térmicos & Bebidas',
      imageUrl: p.images[0].src,
      deeplink: url,
      deeplinkTracking: buildAwinUrl('30599', url)
    };
  });
}

async function fetchVenancioProducts() {
  console.log('[2/3] Buscando produtos Drogaria Venancio...');
  const queries = ['cerave', 'isdin', 'la roche', 'vichy', 'protetor solar', 'dermocosmeticos'];
  const items = [];
  const seen = new Set();

  for (const q of queries) {
    try {
      const res = await axios.get(`https://www.drogariavenancio.com.br/api/catalog_system/pub/products/search/${encodeURIComponent(q)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 8000
      });
      for (const prod of (res.data || [])) {
        if (!prod || !prod.productName || !prod.items?.[0]?.images?.[0]?.imageUrl) continue;
        const id = String(prod.productId || prod.productName);
        if (seen.has(id)) continue;
        seen.add(id);

        const img = prod.items[0].images[0].imageUrl;
        const url = prod.link.replace('http://', 'https://');
        const offer = prod.items[0].sellers?.[0]?.commertialOffer;
        const price = offer?.Price || 89.90;
        const listPrice = offer?.ListPrice && offer.ListPrice > price ? offer.ListPrice : (price * 1.2);

        items.push({
          id: `venancio_${id}`,
          advertiser: 'Drogaria Venancio Oficial',
          advertiserId: '47165',
          type: 'product',
          title: prod.productName,
          description: 'Dermocosmético e cuidados dermatológicos com procedência garantida na Drogaria Venancio Oficial.',
          priceOriginal: `R$ ${listPrice.toFixed(2).replace('.', ',')}`,
          priceCurrent: `R$ ${price.toFixed(2).replace('.', ',')}`,
          discount: `${Math.round((1 - price / listPrice) * 100)}% OFF`,
          categories: 'Saúde & Beleza',
          imageUrl: img,
          deeplink: url,
          deeplinkTracking: buildAwinUrl('47165', url)
        });
        if (items.length >= 10) break;
      }
    } catch (e) {
      console.warn('Erro busca Venancio:', e.message);
    }
    if (items.length >= 10) break;
  }
  return items;
}

async function fetchDecathlonProducts() {
  console.log('[3/3] Buscando produtos Decathlon...');
  const queries = ['mochila', 'corrida', 'tenis', 'camping', 'musculacao', 'quechua'];
  const items = [];
  const seen = new Set();

  for (const q of queries) {
    try {
      const res = await axios.get(`https://decathlonstore.vtexcommercestable.com.br/api/catalog_system/pub/products/search/${encodeURIComponent(q)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 8000
      });
      for (const prod of (res.data || [])) {
        if (!prod || !prod.productName || !prod.items?.[0]?.images?.[0]?.imageUrl) continue;
        const id = String(prod.productId || prod.productName);
        if (seen.has(id)) continue;
        seen.add(id);

        const img = prod.items[0].images[0].imageUrl;
        let url = prod.link.replace('http://', 'https://');
        url = url.replace('decathlonstore.vtexcommercestable.com.br', 'www.decathlon.com.br');

        const offer = prod.items[0].sellers?.[0]?.commertialOffer;
        const price = offer?.Price || 99.90;
        const listPrice = offer?.ListPrice && offer.ListPrice > price ? offer.ListPrice : (price * 1.25);

        items.push({
          id: `decathlon_${id}`,
          advertiser: 'Decathlon Brasil Oficial',
          advertiserId: '19296',
          type: 'product',
          title: prod.productName,
          description: 'Artigos esportivos oficiais Decathlon: alta durabilidade, tecnologia exclusiva Quechua/Kalenji/Domyos com garantia oficial.',
          priceOriginal: `R$ ${listPrice.toFixed(2).replace('.', ',')}`,
          priceCurrent: `R$ ${price.toFixed(2).replace('.', ',')}`,
          discount: `${Math.round((1 - price / listPrice) * 100)}% OFF`,
          categories: 'Esportes & Aventura',
          imageUrl: img,
          deeplink: url,
          deeplinkTracking: buildAwinUrl('19296', url)
        });
        if (items.length >= 10) break;
      }
    } catch (e) {
      console.warn('Erro busca Decathlon:', e.message);
    }
    if (items.length >= 10) break;
  }
  return items;
}

async function main() {
  const dataPath = path.join(__dirname, '..', 'awinDealsData.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  const stanley = await fetchStanleyProducts();
  const venancio = await fetchVenancioProducts();
  const decathlon = await fetchDecathlonProducts();

  console.log(`Encontrados: ${stanley.length} Stanley, ${venancio.length} Venancio, ${decathlon.length} Decathlon.`);

  data.stanleyDeals = stanley;
  data.venancioDeals = venancio;
  data.decathlonDeals = decathlon;

  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
  console.log('✅ awinDealsData.json atualizado com sucesso com Stanley, Venancio e Decathlon!');
}

main().catch(console.error);
