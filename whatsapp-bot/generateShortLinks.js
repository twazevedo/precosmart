/**
 * @file generateShortLinks.js
 * @description Gera links encurtados tidd.ly para todos os produtos afiliados
 * e salva em shortLinksOutput.json + shortLinksCatalog.md para divulgação
 *
 * Uso: node generateShortLinks.js
 */
'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const AWIN_API_TOKEN = 'a6c67106-8a99-4c35-8d27-ac817fbe3577';
const PUBLISHER_ID = '3077915';
const DELAY_MS = 700; // delay entre requisições para não ser rate-limited

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Cache para não repetir encurtamentos
const cache = new Map();

/**
 * Encurta link via AWIN Link Builder API (gera tidd.ly)
 * Para links não-AWIN usa TinyURL
 */
async function shortenUrl(longUrl, advertiserId = null, clickRef = 'DIVULGACAO') {
  if (!longUrl) return null;
  const clean = longUrl.trim();

  if (cache.has(clean)) return cache.get(clean);

  // Já é link curto
  if (clean.includes('tidd.ly') || clean.includes('tinyurl.com') || clean.includes('amzn.to')) {
    cache.set(clean, clean);
    return clean;
  }

  // Extrai dados do link AWIN
  let mid = advertiserId;
  let destinationUrl = clean;

  if (clean.includes('awin1.com')) {
    const midM = clean.match(/[?&]awinmid=(\d+)/);
    const uedM = clean.match(/[?&]ued=([^&]+)/);
    if (midM) mid = parseInt(midM[1], 10);
    if (uedM) {
      try { destinationUrl = decodeURIComponent(uedM[1]); }
      catch { destinationUrl = uedM[1]; }
    }
  }

  // Usa AWIN Link Builder se tiver advertiserId
  if (mid && mid > 0) {
    try {
      const shortUrl = await callAwinLinkBuilder(mid, destinationUrl, clickRef);
      if (shortUrl && shortUrl !== clean) {
        cache.set(clean, shortUrl);
        return shortUrl;
      }
    } catch (e) {
      console.error(`  ⚠ AWIN API falhou para MID ${mid}:`, e.message);
    }
  }

  // Fallback: TinyURL para ML, Amazon e outros
  try {
    const tiny = await callTinyUrl(clean);
    if (tiny) {
      cache.set(clean, tiny);
      return tiny;
    }
  } catch {}

  cache.set(clean, clean);
  return clean;
}

function callAwinLinkBuilder(advertiserId, destinationUrl, clickRef) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ advertiserId, destinationUrl, shorten: true, clickRef });
    const options = {
      hostname: 'api.awin.com',
      path: `/publishers/${PUBLISHER_ID}/linkbuilder/generate`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AWIN_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'PrecoSmart-Bot/1.0'
      },
      timeout: 8000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = JSON.parse(data);
            if (json.shortUrl) return resolve(json.shortUrl);
          } catch {}
        }
        resolve(null);
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(postData);
    req.end();
  });
}

function callTinyUrl(url) {
  return new Promise((resolve) => {
    const encoded = encodeURIComponent(url);
    const options = {
      hostname: 'tinyurl.com',
      path: `/api-create.php?url=${encoded}`,
      method: 'GET',
      timeout: 5000
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const result = data.trim();
        resolve(result.startsWith('http') ? result : null);
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

// ─── DEFINIÇÃO DE TODOS OS AFILIADOS + SEUS PRINCIPAIS PRODUTOS ──────────────

const BRANDS = [
  {
    name: 'KaBuM!',
    emoji: '🖥️',
    mid: 17729,
    color: '#FF6B00',
    siteUrl: 'https://www.kabum.com.br',
    products: [
      { title: 'RTX 4060 8GB GDDR6', url: 'https://www.kabum.com.br/produto/513843', price: 'R$1.699' },
      { title: 'SSD Kingston 1TB NV3', url: 'https://www.kabum.com.br/produto/599338', price: 'R$289' },
      { title: 'Monitor LG 27" 180Hz IPS', url: 'https://www.kabum.com.br/produto/620992', price: 'R$899' },
      { title: 'Headset HyperX Cloud III', url: 'https://www.kabum.com.br/produto/557254', price: 'R$479' },
      { title: 'Mouse Logitech G304 Wireless', url: 'https://www.kabum.com.br/produto/185018', price: 'R$179' },
      { title: 'Teclado Mecânico Rise Mode RGB', url: 'https://www.kabum.com.br/produto/506048', price: 'R$199' },
      { title: 'Memória RAM Kingston 16GB DDR5', url: 'https://www.kabum.com.br/produto/264718', price: 'R$349' },
      { title: 'Gabinete Rise Mode Glass 06x', url: 'https://www.kabum.com.br/produto/324516', price: 'R$249' },
    ]
  },
  {
    name: 'AliExpress BR',
    emoji: '🛍️',
    mid: 18879,
    color: '#E43225',
    siteUrl: 'https://s.click.aliexpress.com/e/_DlrGBLH',
    products: [
      { title: 'Smartwatch Xiaomi Mi Band 8', url: 'https://pt.aliexpress.com/item/1005006035986439.html', price: 'R$149' },
      { title: 'Fone Bluetooth TWS 5.3', url: 'https://pt.aliexpress.com/item/1005007164398256.html', price: 'R$49' },
      { title: 'Carregador USB-C 65W GaN', url: 'https://pt.aliexpress.com/item/1005004386677943.html', price: 'R$79' },
      { title: 'Câmera de Segurança WiFi 4MP', url: 'https://pt.aliexpress.com/item/1005006289516993.html', price: 'R$119' },
      { title: 'Suporte de Mesa Notebook', url: 'https://pt.aliexpress.com/item/1005005319993979.html', price: 'R$39' },
      { title: 'Cabo USB-C 240W 2m', url: 'https://pt.aliexpress.com/item/1005007238174956.html', price: 'R$29' },
    ]
  },
  {
    name: 'C&A Brasil',
    emoji: '👗',
    mid: 17648,
    color: '#004A99',
    siteUrl: 'https://www.cea.com.br',
    products: [
      { title: 'Jeans Feminino Skinny', url: 'https://www.cea.com.br/calca-jeans-feminina-cintura-alta-skinny', price: 'R$89' },
      { title: 'Camiseta Básica Masculina', url: 'https://www.cea.com.br/camiseta-masculina-manga-curta-basica', price: 'R$39' },
      { title: 'Vestido Feminino Midi', url: 'https://www.cea.com.br/vestido-feminino-midi', price: 'R$99' },
      { title: 'Conjunto Fitness 2 Peças', url: 'https://www.cea.com.br/conjunto-fitness-feminino', price: 'R$79' },
    ]
  },
  {
    name: 'Nike Brasil',
    emoji: '👟',
    mid: 19326,
    color: '#111111',
    siteUrl: 'https://www.nike.com/br',
    products: [
      { title: 'Nike Air Max SC', url: 'https://www.nike.com/br/t/tenis-air-max-sc-masculino', price: 'R$499' },
      { title: 'Nike Revolution 7', url: 'https://www.nike.com/br/t/tenis-revolution-7-masculino', price: 'R$369' },
      { title: 'Camiseta Nike Dri-FIT', url: 'https://www.nike.com/br/t/camiseta-de-treino-nike-dri-fit', price: 'R$149' },
      { title: 'Legging Nike Pro 7/8', url: 'https://www.nike.com/br/t/legging-7-8-de-treino-nike-pro', price: 'R$219' },
      { title: 'Nike Air Force 1', url: 'https://www.nike.com/br/t/tenis-nike-air-force-1-07', price: 'R$699' },
    ]
  },
  {
    name: 'Under Armour',
    emoji: '🏋️',
    mid: 18864,
    color: '#E31E24',
    siteUrl: 'https://www.underarmour.com.br',
    products: [
      { title: 'UA Charged Assert 10', url: 'https://www.underarmour.com.br/tenis-ua-charged-assert-10', price: 'R$399' },
      { title: 'Camiseta UA Tech 2.0', url: 'https://www.underarmour.com.br/camiseta-masculina-ua-tech-2-0', price: 'R$159' },
      { title: 'UA Charged Pursuit 3', url: 'https://www.underarmour.com.br/tenis-ua-charged-pursuit-3', price: 'R$449' },
      { title: 'Short UA Launch 5"', url: 'https://www.underarmour.com.br/short-masculino-ua-launch-5-polegadas', price: 'R$189' },
    ]
  },
  {
    name: 'Olympikus',
    emoji: '🏃',
    mid: 30254,
    color: '#009B3A',
    siteUrl: 'https://www.olympikus.com.br',
    products: [
      { title: 'Tênis Corre 23', url: 'https://www.olympikus.com.br/tenis/corrida/corre-23', price: 'R$299' },
      { title: 'Tênis Achieve 2', url: 'https://www.olympikus.com.br/tenis/academia/achieve-2', price: 'R$249' },
      { title: 'Camiseta Dry Action', url: 'https://www.olympikus.com.br/camisetas/dry-action', price: 'R$89' },
      { title: 'Tênis Ultralight 3', url: 'https://www.olympikus.com.br/tenis/caminhada/ultralight-3', price: 'R$349' },
    ]
  },
  {
    name: 'Lacoste',
    emoji: '🐊',
    mid: 16975,
    color: '#00883A',
    siteUrl: 'https://www.lacoste.com/br',
    products: [
      { title: 'Polo Classic Fit', url: 'https://www.lacoste.com/br/polo-masculina-classic-fit', price: 'R$699' },
      { title: 'Tênis Lerond Pro', url: 'https://www.lacoste.com/br/tenis-lerond-pro', price: 'R$799' },
      { title: 'Camiseta Básica Lacoste', url: 'https://www.lacoste.com/br/camiseta-basica', price: 'R$399' },
    ]
  },
  {
    name: 'LEGO',
    emoji: '🧱',
    mid: 30511,
    color: '#FFD700',
    siteUrl: 'https://www.legombrinq.com.br',
    products: [
      { title: 'LEGO Star Wars X-Wing', url: 'https://www.legombrinq.com.br/lego-star-wars', price: 'R$399' },
      { title: 'LEGO City Quartel Bombeiros', url: 'https://www.legombrinq.com.br/lego-city', price: 'R$299' },
      { title: 'LEGO Technic Ferrari', url: 'https://www.legombrinq.com.br/lego-technic', price: 'R$599' },
    ]
  },
  {
    name: 'Clovis Calçados',
    emoji: '👠',
    mid: 18199,
    color: '#8B0000',
    siteUrl: 'https://www.clovis.com.br',
    products: [
      { title: 'Scarpin Feminino Salto Alto', url: 'https://www.clovis.com.br/feminino/scarpins', price: 'R$149' },
      { title: 'Tênis Casual Feminino', url: 'https://www.clovis.com.br/feminino/tenis', price: 'R$129' },
      { title: 'Sandália Plataforma', url: 'https://www.clovis.com.br/feminino/sandalias', price: 'R$109' },
    ]
  },
  {
    name: 'Shark Ninja',
    emoji: '🦈',
    mid: 33076,
    color: '#003366',
    siteUrl: 'https://www.sharkhome.com.br',
    products: [
      { title: 'Ninja Air Fryer 4L', url: 'https://www.sharkhome.com.br/ninja-air-fryer-4l', price: 'R$599' },
      { title: 'Shark Vacuum IQ Robot', url: 'https://www.sharkhome.com.br/shark-vacuum-iq', price: 'R$1.499' },
      { title: 'Ninja Foodi SmartLid', url: 'https://www.sharkhome.com.br/ninja-foodi', price: 'R$899' },
    ]
  },
  {
    name: 'Hope Lingerie',
    emoji: '🌸',
    mid: 17791,
    color: '#FF69B4',
    siteUrl: 'https://www.hope.com.br',
    products: [
      { title: 'Kit 3 Calcinhas Cotton', url: 'https://www.hope.com.br/kit-calcinha-cotton', price: 'R$99' },
      { title: 'Pijama Longo Feminino', url: 'https://www.hope.com.br/pijama-longo', price: 'R$149' },
      { title: 'Sutiã Ultimate Confort', url: 'https://www.hope.com.br/sutia-ultimate-confort', price: 'R$129' },
    ]
  },
  {
    name: 'LG Brasil',
    emoji: '📺',
    mid: 30519,
    color: '#A50034',
    siteUrl: 'https://www.lge.com/br',
    products: [
      { title: 'Smart TV LG 55" 4K OLED', url: 'https://www.lge.com/br/tvs/lg-OLED55C4PSA', price: 'R$5.999' },
      { title: 'Monitor LG UltraWide 34"', url: 'https://www.lge.com/br/monitors/lg-34WP65C-B', price: 'R$1.899' },
      { title: 'Geladeira LG Frost Free', url: 'https://www.lge.com/br/refrigeradores', price: 'R$3.499' },
    ]
  },
  {
    name: 'Mercado Livre',
    emoji: '🛒',
    mid: null,
    color: '#FFF159',
    siteUrl: 'https://www.mercadolivre.com.br',
    products: [
      { title: 'iPhone 15 128GB', url: 'https://www.mercadolivre.com.br/iphone-15', price: 'R$4.299' },
      { title: 'Galaxy S24 FE', url: 'https://www.mercadolivre.com.br/galaxy-s24', price: 'R$2.999' },
      { title: 'Notebook Dell Inspiron 15', url: 'https://www.mercadolivre.com.br/notebook-dell', price: 'R$2.499' },
      { title: 'AirPods Pro 2ª Geração', url: 'https://www.mercadolivre.com.br/airpods-pro', price: 'R$1.299' },
    ]
  },
  {
    name: 'Amazon Brasil',
    emoji: '📦',
    mid: null,
    color: '#FF9900',
    siteUrl: 'https://www.amazon.com.br',
    products: [
      { title: 'Echo Dot 5ª Geração', url: 'https://www.amazon.com.br/dp/B09B8RVKGB', price: 'R$249' },
      { title: 'Kindle 11ª Geração', url: 'https://www.amazon.com.br/dp/B09SWTGQMH', price: 'R$399' },
      { title: 'Fire TV Stick 4K', url: 'https://www.amazon.com.br/dp/B09SVHNKVJ', price: 'R$279' },
    ]
  }
];

// ─── GERAÇÃO DOS LINKS ENCURTADOS ────────────────────────────────────────────

async function main() {
  console.log('\n🔗 PreçoSmart — Gerador de Links Encurtados tidd.ly\n');
  console.log(`📊 Total de marcas: ${BRANDS.length}`);

  const output = { brands: [], generatedAt: new Date().toISOString() };
  let totalProducts = 0;
  let totalShortened = 0;

  for (const brand of BRANDS) {
    console.log(`\n📌 ${brand.emoji} ${brand.name} (MID: ${brand.mid || 'n/a'})`);
    const brandOutput = {
      name: brand.name,
      emoji: brand.emoji,
      mid: brand.mid,
      color: brand.color,
      siteUrl: brand.siteUrl,
      products: []
    };

    // Link do site principal encurtado
    if (brand.mid) {
      const siteAwinUrl = `https://www.awin1.com/cread.php?awinmid=${brand.mid}&awinaffid=${PUBLISHER_ID}&clickref=DIVULGACAO&ued=${encodeURIComponent(brand.siteUrl)}`;
      await sleep(DELAY_MS);
      const shortSite = await shortenUrl(siteAwinUrl, brand.mid, 'DIVULGACAO');
      brandOutput.siteShortUrl = shortSite;
      console.log(`  🏠 Site: ${shortSite}`);
    }

    for (const product of brand.products) {
      await sleep(DELAY_MS);
      totalProducts++;

      let trackingUrl;
      if (brand.mid) {
        trackingUrl = `https://www.awin1.com/cread.php?awinmid=${brand.mid}&awinaffid=${PUBLISHER_ID}&clickref=DIVULGACAO&ued=${encodeURIComponent(product.url)}`;
      } else {
        // ML e Amazon sem MID AWIN — usa URL direta (bot faz o rastreamento pelo mirror.js)
        trackingUrl = product.url;
      }

      const shortUrl = await shortenUrl(trackingUrl, brand.mid, 'DIVULGACAO');
      const wasShortened = shortUrl !== trackingUrl && shortUrl !== product.url;
      if (wasShortened) totalShortened++;

      brandOutput.products.push({
        title: product.title,
        price: product.price,
        originalUrl: product.url,
        trackingUrl,
        shortUrl
      });

      console.log(`  ${wasShortened ? '✅' : '⚠'} ${product.title} → ${shortUrl}`);
    }

    output.brands.push(brandOutput);
  }

  // ─── Salva JSON ───────────────────────────────────────────────────────────
  const jsonPath = path.join(__dirname, 'shortLinksOutput.json');
  fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n💾 JSON salvo em: ${jsonPath}`);

  // ─── Gera Markdown de Divulgação ─────────────────────────────────────────
  const mdLines = [
    '# 🔥 PreçoSmart — Catálogo Completo de Afiliados',
    '',
    `> 📅 Gerado em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
    `> 🤖 Bot: WhatsApp **PreçoSmart | Ofertas & Achadinhos 🔥**`,
    `> 📱 Entre no grupo: https://chat.whatsapp.com/Lo3ONNfAXVh5cEe2Pg6gM7`,
    `> ✈️ Telegram: https://t.me/precosmart`,
    '',
    '---',
    ''
  ];

  for (const brand of output.brands) {
    mdLines.push(`## ${brand.emoji} ${brand.name}`);
    if (brand.siteShortUrl) {
      mdLines.push(`🏠 **Loja:** ${brand.siteShortUrl}`);
    } else {
      mdLines.push(`🏠 **Loja:** ${brand.siteUrl}`);
    }
    mdLines.push('');
    mdLines.push('| Produto | Preço | Link |');
    mdLines.push('|---------|-------|------|');

    for (const p of brand.products) {
      mdLines.push(`| ${p.title} | ${p.price} | [🛒 Comprar](${p.shortUrl}) |`);
    }
    mdLines.push('');
    mdLines.push('---');
    mdLines.push('');
  }

  mdLines.push('');
  mdLines.push('> 💡 **Todos os links são rastreados via Awin / affiliate tracking**');
  mdLines.push(`> 🏷️ Publisher ID: ${PUBLISHER_ID} | Clickref: DIVULGACAO`);

  const mdPath = path.join(__dirname, 'shortLinksCatalog.md');
  fs.writeFileSync(mdPath, mdLines.join('\n'), 'utf8');
  console.log(`📄 Markdown salvo em: ${mdPath}`);

  // ─── Resumo final ─────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────');
  console.log(`✅ Links encurtados: ${totalShortened}/${totalProducts}`);
  console.log(`📦 Marcas processadas: ${output.brands.length}`);
  console.log('─────────────────────────────────────────\n');

  return output;
}

main().catch(console.error);
