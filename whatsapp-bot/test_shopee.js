const { PRODUCTS, getAffiliateUrl, getBestCoupon } = require('./catalog');
const { buildOfferMessage } = require('./formatter');
const axios = require('axios');

async function getOgImage(url) {
  try {
    const res = await axios.get(url, { timeout: 4000, headers: {'User-Agent': 'Mozilla/5.0'} });
    const match = res.data.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    return match ? match[1] : null;
  } catch(e) { return null; }
}

async function runShopeeTest() {
  console.log('--- INICIANDO TESTE SHOPEE ---');
  const shopeeProducts = PRODUCTS.filter(p => p.quotes.some(q => q.store === 'Shopee'));
  if (shopeeProducts.length === 0) {
    console.log('? Nenhum produto Shopee no cat�logo.');
    return;
  }

  for (let i = 0; i < 3; i++) {
    const p = shopeeProducts[Math.floor(Math.random() * shopeeProducts.length)];
    console.log('\n==================================');
    console.log('?? TESTANDO PRODUTO:', p.title);
    
    try {
      const caption = buildOfferMessage(p);
      console.log('?? LEGENDA GERADA COM SUCESSO:');
      console.log(caption);
      
      const linkMatch = caption.match(/(https:\/\/[^\s]+)/);
      const link = linkMatch ? linkMatch[1] : null;
      console.log('?? LINK EXTRA�DO:', link);

      let resolvedImageUrl = p.imageUrl;
      if (!resolvedImageUrl && link) {
        console.log('?? Buscando og:image invis�vel no site...');
        resolvedImageUrl = await getOgImage(link);
      }

      console.log('?? FOTO FINAL A SER ENVIADA:', resolvedImageUrl ? resolvedImageUrl : 'Sem foto (vai carregar miniatura)');
      console.log('? TESTE PASSOU!');
    } catch (e) {
      console.error('? ERRO AO PROCESSAR:', e.message);
    }
  }
}

runShopeeTest();
