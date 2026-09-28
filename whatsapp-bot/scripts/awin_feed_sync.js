/**
 * @file awin_feed_sync.js
 * @description Sincronização automática de produtos via AWIN Product Feed API (CSV).
 *
 * COMO FUNCIONA:
 *   1. Baixa o feed CSV de cada marca aprovada diretamente do productdata.awin.com
 *   2. Parseia, filtra e normaliza os produtos no formato padrão do PreçoSmart
 *   3. Mescla com os dados existentes em awinDealsData.json — nunca apaga, só enriquece
 *   4. Prioriza imagens AWIN oficiais (aw_image_url) sobre as raspadoras antigas
 *   5. Salva o JSON atualizado
 *
 * USO MANUAL:
 *   node scripts/awin_feed_sync.js
 *   node scripts/awin_feed_sync.js --dry-run   # só mostra stats, não salva
 *   node scripts/awin_feed_sync.js --brand nike # só sincroniza uma marca
 *
 * CONFIGURAÇÃO NECESSÁRIA:
 *   Adicionar no .env:
 *     AWIN_FEED_API_KEY=<sua_product_feed_api_key>
 *
 *   A Product Feed API Key é DIFERENTE do AWIN_API_TOKEN.
 *   Onde encontrar: https://ui.awin.com/awin-api → "Product Data Feed" → "API Key"
 *   (Toolbox > Create-a-Feed > copiar a chave que aparece nas URLs geradas)
 *
 * BRANDS CONFIG:
 *   Cada marca precisa ter um feedId configurado abaixo.
 *   Como encontrar o feedId: Toolbox > My Data Feeds > copiar o número do feed da marca
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const zlib  = require('zlib');

// ── Carregar .env manualmente (dotenv não é dependência local) ────────────────
(function loadEnv() {
  const envPath = path.join(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    const val = trimmed.substring(eqIdx + 1).trim().replace(/\r$/, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
})();

// ── Dependências opcionais (instala se necessário) ────────────────────────────
let csv;
try {
  csv = require('csv-parse/sync');
} catch (e) {
  console.error('[ERRO] Instale a dependência: npm install csv-parse');
  process.exit(1);
}

// ── Configuração ──────────────────────────────────────────────────────────────
const AWIN_PUBLISHER_ID = process.env.AFFILIATE_AWIN || '3077915';
const AWIN_FEED_API_KEY = process.env.AWIN_FEED_API_KEY || '';
const CLICKREF          = 'FEED_AUTO';
const DATA_FILE         = path.join(__dirname, '../awinDealsData.json');
const DRY_RUN           = process.argv.includes('--dry-run');
const BRAND_FILTER      = (() => {
  const idx = process.argv.indexOf('--brand');
  return idx !== -1 ? process.argv[idx + 1]?.toLowerCase() : null;
})();

// ── Colunas que queremos do feed AWIN ─────────────────────────────────────────
const FEED_COLUMNS = [
  'aw_product_id',
  'product_name',
  'description',
  'merchant_product_id',
  'aw_image_url',
  'merchant_image_url',
  'search_price',
  'store_price',
  'rrp_price',
  'merchant_name',
  'merchant_id',
  'category_name',
  'product_url',
  'aw_deep_link',
  'brand_name',
  'in_stock',
  'promotional_price',
  'ean',
].join(',');

// ── Mapeamento de marcas: brandKey → { feedId, mid, name } ────────────────────
// feedId: ID do feed no painel AWIN (Toolbox > My Data Feeds)
// mid: Merchant ID (mesmo usado no buildAwinUrl)
// maxItems: máximo de produtos a importar por marca (evita catálogos gigantes)
const BRAND_FEEDS = {
  cea:        { feedId: null, mid: 17648,  name: 'C&A Brasil',         maxItems: 200 },
  nike:       { feedId: null, mid: 17652,  name: 'Nike Brasil',        maxItems: 150 },
  olympikus:  { feedId: null, mid: 17698,  name: 'Olympikus',          maxItems: 200 },
  kabum:      { feedId: null, mid: 17729,  name: 'KaBuM!',             maxItems: 100 },
  underArmour:{ feedId: null, mid: 18864,  name: 'Under Armour',       maxItems: 150 },
  aliexpress: { feedId: null, mid: 18879,  name: 'AliExpress Brasil',  maxItems: 100 },
  decathlon:  { feedId: null, mid: 19296,  name: 'Decathlon',          maxItems: 200 },
  lego:       { feedId: null, mid: 30511,  name: 'LEGO Brasil',        maxItems: 150 },
  stanley:    { feedId: null, mid: 30599,  name: 'Stanley Brasil',     maxItems: 200 },
  puma:       { feedId: null, mid: 32675,  name: 'Puma Brasil',        maxItems: 150 },
  lg:         { feedId: null, mid: 33061,  name: 'LG Brasil',          maxItems: 100 },
  venancio:   { feedId: null, mid: 47165,  name: 'Drogaria Venâncio',  maxItems: 150 },
  ninja:      { feedId: null, mid: 106763, name: 'Shark-Ninja',        maxItems: 150 },
  hope:       { feedId: null, mid: 107039, name: 'Hope Lingerie',      maxItems: 150 },
  clovis:     { feedId: null, mid: 107702, name: 'Clovis Calçados',    maxItems: 200 },
  lacoste:    { feedId: null, mid: 112756, name: 'Lacoste Brasil',     maxItems: 100 },
};

// Mapeamento brandKey → chave no awinDealsData.json
const BRAND_KEY_MAP = {
  cea:         'ceaDeals',
  nike:        'nikeDeals',
  olympikus:   'olympikusDeals',
  kabum:       'kabumDeals',
  underArmour: 'underArmourDeals',
  aliexpress:  'aliexpressDeals',
  decathlon:   'decathlonDeals',
  lego:        'legoDeals',
  stanley:     'stanleyDeals',
  puma:        'pumaDeals',
  lg:          'lgDeals',
  venancio:    'venancioDeals',
  ninja:       'ninjaDeals',
  hope:        'hopeDeals',
  clovis:      'clovisDeals',
  lacoste:     'lacosteDeals',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildAwinUrl(mid, targetUrl) {
  if (!mid || !targetUrl) return targetUrl || '';
  return `https://www.awin1.com/cread.php?awinmid=${mid}&awinaffid=${AWIN_PUBLISHER_ID}&clickref=${CLICKREF}&ued=${encodeURIComponent(targetUrl)}`;
}

function formatPrice(num) {
  const n = parseFloat(num) || 0;
  return n > 0 ? `R$ ${n.toFixed(2).replace('.', ',')}` : null;
}

function calcDiscount(current, original) {
  if (!current || !original || original <= current) return null;
  const pct = Math.round((1 - current / original) * 100);
  return pct >= 3 ? `${pct}% OFF` : null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Download de feed CSV com suporte a gzip ───────────────────────────────────
function downloadFeed(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return downloadFeed(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} para ${url}`));
      }

      const chunks = [];
      const stream = res.headers['content-encoding'] === 'gzip'
        ? res.pipe(zlib.createGunzip())
        : res;

      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      stream.on('error', reject);
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout ao baixar feed')));
  });
}

// ── Construção da URL do feed ─────────────────────────────────────────────────
function buildFeedUrl(feedId, mid) {
  if (!AWIN_FEED_API_KEY) return null;

  if (feedId) {
    // URL direta com feedId específico
    return `https://productdata.awin.com/datafeed/download/apikey/${AWIN_FEED_API_KEY}/fid/${feedId}/columns/${FEED_COLUMNS}/format/csv/delimiter/%2C/compression/none/`;
  }

  // URL por merchant ID (nem sempre funciona — depende de o anunciante ter feed público)
  return `https://productdata.awin.com/datafeed/download/apikey/${AWIN_FEED_API_KEY}/mid/${mid}/columns/${FEED_COLUMNS}/format/csv/delimiter/%2C/compression/none/`;
}

// ── Parseia uma linha CSV em um produto normalizado ───────────────────────────
function parseRow(row, brandKey, mid) {
  const name  = (row.product_name || '').trim();
  const price = parseFloat(row.search_price || row.promotional_price || 0);
  const orig  = parseFloat(row.rrp_price || row.store_price || 0);
  const img   = (row.aw_image_url || row.merchant_image_url || '').trim();
  const url   = (row.aw_deep_link || row.product_url || '').trim();
  const id    = (row.aw_product_id || row.merchant_product_id || '').trim();
  const cat   = (row.category_name || '').trim();
  const brand = (row.brand_name || row.merchant_name || '').trim();
  const inStk = (row.in_stock || '1') !== '0';

  // Filtros de qualidade
  if (!name || !img || !url || !img.startsWith('http')) return null;
  if (!inStk) return null;
  if (price <= 5) return null;

  const priceFmt = formatPrice(price);
  const origFmt  = orig > price ? formatPrice(orig) : null;
  const discount = calcDiscount(price, orig);

  return {
    id:                `${brandKey}_feed_${id || Date.now()}`,
    advertiser:        BRAND_FEEDS[brandKey]?.name || brand,
    advertiserId:      String(mid),
    source:            'awin_feed',
    type:              'product',
    title:             name,
    description:       (row.description || '').substring(0, 200).trim() || `${name} — compre agora com preço especial`,
    priceOriginal:     origFmt,
    priceCurrent:      priceFmt,
    discount:          discount,
    categories:        cat || brandKey,
    imageUrl:          img,
    deeplink:          url,
    deeplinkTracking:  buildAwinUrl(mid, url),
    feedSyncedAt:      new Date().toISOString().split('T')[0],
  };
}

// ── Tenta descobrir feedIds disponíveis via API ───────────────────────────────
async function discoverFeedIds() {
  if (!AWIN_FEED_API_KEY) return {};

  console.log('\n🔍 Descobrindo feed IDs disponíveis na AWIN...');
  try {
    const listUrl = `https://productdata.awin.com/datafeed/list/apikey/${AWIN_FEED_API_KEY}`;
    const raw = await downloadFeed(listUrl);

    // A lista retorna CSV com: feedId, feedName, merchantId, merchantName, etc.
    const rows = csv.parse(raw, { columns: true, skip_empty_lines: true, relax_quotes: true });
    const map = {};

    for (const row of rows) {
      const mid = parseInt(row.merchantId || row.merchant_id || 0);
      const feedId = row.feedId || row.feed_id || row.id;
      if (mid && feedId) {
        map[mid] = feedId;
      }
    }

    console.log(`   Encontrados ${Object.keys(map).length} feeds disponíveis.`);
    return map;
  } catch (e) {
    console.warn(`   Aviso: não foi possível obter lista de feeds (${e.message})`);
    console.warn('   Tentarei buscar por merchant ID diretamente.');
    return {};
  }
}

// ── Sincroniza uma marca ──────────────────────────────────────────────────────
async function syncBrand(brandKey, feedIdOverride) {
  const cfg = BRAND_FEEDS[brandKey];
  if (!cfg) return [];

  const feedId = feedIdOverride || cfg.feedId;
  const url    = buildFeedUrl(feedId, cfg.mid);

  if (!url) {
    console.warn(`  [${brandKey}] Sem AWIN_FEED_API_KEY — pulando feed AWIN`);
    return [];
  }

  console.log(`  [${brandKey}] Baixando feed: ${cfg.name}...`);

  try {
    const raw  = await downloadFeed(url);
    const rows = csv.parse(raw, {
      columns:          true,
      skip_empty_lines: true,
      relax_quotes:     true,
      trim:             true,
    });

    const products = [];
    for (const row of rows) {
      if (products.length >= cfg.maxItems) break;
      const p = parseRow(row, brandKey, cfg.mid);
      if (p) products.push(p);
    }

    console.log(`  [${brandKey}] ✅ ${products.length} produtos válidos (de ${rows.length} no feed)`);
    return products;
  } catch (e) {
    console.warn(`  [${brandKey}] ⚠️  Erro: ${e.message}`);
    return [];
  }
}

// ── Mescla produtos do feed com os existentes ─────────────────────────────────
function mergeProducts(existing, feedProducts, brandKey) {
  if (!feedProducts.length) return existing;

  // Índice por deeplink para deduplicação rápida
  const existingByUrl = new Map();
  for (const p of existing) {
    if (p.deeplink) existingByUrl.set(p.deeplink, p);
  }

  let updated = 0, added = 0;

  for (const fp of feedProducts) {
    const exists = existingByUrl.get(fp.deeplink);
    if (exists) {
      // Atualiza preço e imagem do produto já existente
      exists.imageUrl    = fp.imageUrl;     // imagem oficial AWIN sempre tem prioridade
      exists.priceCurrent = fp.priceCurrent;
      exists.priceOriginal = fp.priceOriginal || exists.priceOriginal;
      exists.discount    = fp.discount || exists.discount;
      exists.feedSyncedAt = fp.feedSyncedAt;
      exists.source      = 'awin_feed';
      updated++;
    } else {
      existing.push(fp);
      existingByUrl.set(fp.deeplink, fp);
      added++;
    }
  }

  console.log(`  [${brandKey}] 🔄 ${updated} atualizados, ➕ ${added} novos`);
  return existing;
}

// ── Ponto de entrada principal ────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║       PreçoSmart — AWIN Feed Sync                   ║');
  console.log(`║  ${new Date().toLocaleString('pt-BR')}${DRY_RUN ? ' [DRY RUN]' : ''}`.padEnd(54) + '║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // Verificar chave
  if (!AWIN_FEED_API_KEY) {
    console.error('❌ AWIN_FEED_API_KEY não configurada no .env');
    console.error('');
    console.error('Como obter:');
    console.error('  1. Acesse https://ui.awin.com');
    console.error('  2. Vá em Toolbox > Create-a-Feed');
    console.error('  3. Crie um feed qualquer e copie a API Key da URL gerada');
    console.error('  4. Adicione no .env: AWIN_FEED_API_KEY=<sua_chave>');
    console.error('');
    console.error('Alternativa: use o script crawl_all_approved_brands.js');
    console.error('  npm run crawl:brands');
    process.exit(1);
  }

  // Descobrir feedIds disponíveis
  const feedIdMap = await discoverFeedIds(); // { mid → feedId }

  // Carregar dados existentes
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (e) {
    console.warn('awinDealsData.json não encontrado — criando do zero.');
  }

  // Determinar quais marcas sincronizar
  const brandsToSync = BRAND_FILTER
    ? Object.keys(BRAND_FEEDS).filter(k => k.toLowerCase() === BRAND_FILTER)
    : Object.keys(BRAND_FEEDS);

  if (brandsToSync.length === 0) {
    console.error(`❌ Marca '${BRAND_FILTER}' não reconhecida.`);
    console.error(`   Opções: ${Object.keys(BRAND_FEEDS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n📦 Sincronizando ${brandsToSync.length} marca(s)...\n`);

  const stats = { total: 0, brands: {} };

  for (const brandKey of brandsToSync) {
    const cfg = BRAND_FEEDS[brandKey];
    const feedId = feedIdMap[cfg.mid] || cfg.feedId;

    const feedProducts = await syncBrand(brandKey, feedId);
    const dataKey      = BRAND_KEY_MAP[brandKey];

    if (!dataKey) { console.warn(`  [${brandKey}] Sem mapeamento de chave JSON — pulando`); continue; }

    const existing = Array.isArray(data[dataKey]) ? data[dataKey] : [];

    if (!DRY_RUN) {
      data[dataKey] = mergeProducts(existing, feedProducts, brandKey);
    }

    stats.brands[brandKey] = {
      feed:    feedProducts.length,
      total:   DRY_RUN ? existing.length : data[dataKey].length,
    };
    stats.total += feedProducts.length;

    // Rate limiting — respeita os limites da AWIN
    await sleep(1500);
  }

  // Reconstruir array products combinado
  if (!DRY_RUN) {
    data.products = [];
    for (const dataKey of Object.values(BRAND_KEY_MAP)) {
      if (Array.isArray(data[dataKey])) {
        data.products.push(...data[dataKey]);
      }
    }
    // Incluir ML e Amazon que não vêm do AWIN feed
    if (Array.isArray(data.mlDeals))     data.products.push(...data.mlDeals);
    if (Array.isArray(data.amazonDeals)) data.products.push(...data.amazonDeals);

    data._feedSyncedAt    = new Date().toISOString();
    data._totalProducts   = data.products.length;

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`\n✅ awinDealsData.json salvo — ${data._totalProducts} produtos totais`);
  }

  // ── Relatório Final ──────────────────────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────┐');
  console.log('│                   RELATÓRIO DE SYNC                 │');
  console.log('├──────────────────┬──────────────┬───────────────────┤');
  console.log('│ Marca            │ Feed         │ Total no JSON     │');
  console.log('├──────────────────┼──────────────┼───────────────────┤');
  for (const [k, s] of Object.entries(stats.brands)) {
    const name  = (BRAND_FEEDS[k]?.name || k).padEnd(16).substring(0, 16);
    const feed  = String(s.feed).padStart(12);
    const total = String(s.total).padStart(17);
    console.log(`│ ${name} │ ${feed} │ ${total} │`);
  }
  console.log('├──────────────────┴──────────────┴───────────────────┤');
  console.log(`│ TOTAL DO FEED: ${String(stats.total).padStart(6)} produtos encontrados          │`);
  console.log('└─────────────────────────────────────────────────────┘');

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN — nenhum arquivo foi modificado.');
  }

  console.log('\n✔ Sync concluído!\n');
}

main().catch(err => {
  console.error('\n[ERRO FATAL]', err.message);
  process.exit(1);
});
