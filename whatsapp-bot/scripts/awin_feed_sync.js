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

// ── Resolver csv-parse (está em precosmart/node_modules, 3 níveis acima de scripts/) ──
let csv;
const CSV_PARSE_PATHS = [
  path.join(__dirname, '../node_modules/csv-parse/sync'),    // whatsapp-bot/node_modules
  path.join(__dirname, '../../node_modules/csv-parse/sync'), // precosmart/node_modules ← aqui está
  path.join(__dirname, '../../../node_modules/csv-parse/sync'),
  'csv-parse/sync',
];
for (const csvPath of CSV_PARSE_PATHS) {
  try { csv = require(csvPath); break; } catch (_) {}
}
if (!csv) {
  console.error('[ERRO] Módulo csv-parse não encontrado.');
  console.error('Execute: cd precosmart && npm install csv-parse');
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

// ── Colunas exatas do feed AWIN (extraídas da URL Create-a-Feed do usuário) ────
const FEED_COLUMNS = [
  'aw_deep_link',
  'product_name',
  'aw_product_id',
  'merchant_product_id',
  'merchant_image_url',
  'description',
  'merchant_category',
  'search_price',
  'merchant_name',
  'merchant_id',
  'category_name',
  'category_id',
  'aw_image_url',
  'currency',
  'store_price',
  'delivery_cost',
  'merchant_deep_link',
  'language',
  'last_updated',
  'display_price',
  'data_feed_id',
].join(',');

// ── Mapeamento de marcas com feedIds reais descobertos na AWIN ────────────────
// feedId: descoberto via productdata.awin.com/datafeed/list — marcas sem feed
//         usam null e o script tenta pelo mid (pode não funcionar para todas).
// maxItems: limite de produtos por marca para evitar catálogos gigantes no JSON
const BRAND_FEEDS = {
  cea:        { feedId: 58627,  mid: 17648,  name: 'C&A Brasil',         maxItems: 300 },
  nike:       { feedId: 93360,  mid: 17652,  name: 'Nike Brasil',        maxItems: 200 },
  olympikus:  { feedId: 51837,  mid: 17698,  name: 'Olympikus',          maxItems: 250 },
  kabum:      { feedId: 46967,  mid: 17729,  name: 'KaBuM!',             maxItems: 150 },
  underArmour:{ feedId: null,   mid: 18864,  name: 'Under Armour',       maxItems: 150 },
  aliexpress: { feedId: 47247,  mid: 18879,  name: 'AliExpress Brasil',  maxItems: 150 },
  decathlon:  { feedId: null,   mid: 19296,  name: 'Decathlon',          maxItems: 200 },
  lego:       { feedId: 72027,  mid: 30511,  name: 'LEGO Brasil',        maxItems: 200 },
  stanley:    { feedId: 72033,  mid: 30599,  name: 'Stanley Brasil',     maxItems: 200 },
  puma:       { feedId: null,   mid: 32675,  name: 'Puma Brasil',        maxItems: 150 },
  lg:         { feedId: 103134, mid: 33061,  name: 'LG Brasil',          maxItems: 150 },
  venancio:   { feedId: null,   mid: 47165,  name: 'Drogaria Venâncio',  maxItems: 150 },
  ninja:      { feedId: 98682,  mid: 106763, name: 'Shark-Ninja',        maxItems: 100 },
  hope:       { feedId: null,   mid: 107039, name: 'Hope Lingerie',      maxItems: 150 },
  clovis:     { feedId: 98680,  mid: 107702, name: 'Clovis Calçados',    maxItems: 250 },
  lacoste:    { feedId: null,   mid: 112756, name: 'Lacoste Brasil',     maxItems: 100 },
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
    https.get(url, { timeout: 60000 }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        res.resume();
        return downloadFeed(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} para ${url}`));
      }

      const chunks = [];
      // Detecta gzip pelo header OU pela URL (AWIN nem sempre envia Content-Encoding)
      const isGzip = (res.headers['content-encoding'] || '').includes('gzip')
                  || url.includes('/compression/gzip');

      const stream = isGzip ? res.pipe(zlib.createGunzip()) : res;

      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      stream.on('error', reject);
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout ao baixar feed')));
  });
}

// ── Construção da URL do feed ─────────────────────────────────────────────────
function buildFeedUrl(feedId) {
  if (!AWIN_FEED_API_KEY || !feedId) return null;

  const base = `https://productdata.awin.com/datafeed/download/apikey/${AWIN_FEED_API_KEY}`;
  const tail = `/columns/${FEED_COLUMNS}/format/csv/delimiter/%2C/compression/gzip/adultcontent/1/`;

  return `${base}/fid/${feedId}${tail}`;
}

// ── Parseia uma linha CSV em um produto normalizado ───────────────────────────
// Colunas disponíveis: aw_deep_link, product_name, aw_product_id,
//   merchant_product_id, merchant_image_url, description, merchant_category,
//   search_price, merchant_name, merchant_id, category_name, category_id,
//   aw_image_url, currency, store_price, delivery_cost, merchant_deep_link,
//   language, last_updated, display_price, data_feed_id
function parseRow(row, brandKey, mid) {
  const name  = (row.product_name || '').trim();
  // merchant_image_url = imagem HD direto da loja (ex: stanley.fbitsstatic.net/?w=800)
  // aw_image_url = thumbnail productserve.com com 200px — usar só como fallback
  const img   = (row.merchant_image_url || row.aw_image_url || '').trim();
  // aw_deep_link já é o link de afiliado pronto da AWIN
  const url   = (row.aw_deep_link || row.merchant_deep_link || '').trim();
  const id    = (row.aw_product_id || row.merchant_product_id || '').trim();
  const cat   = (row.category_name || row.merchant_category || '').trim();

  // Preço: search_price é o preço atual (com desconto), store_price é o original
  const price = parseFloat((row.search_price  || '').replace(',', '.')) || 0;
  const orig  = parseFloat((row.store_price   || '').replace(',', '.')) || 0;

  // Ignora linha de cabeçalho caso venha no CSV
  if (!name || name.toLowerCase() === 'product_name') return null;
  if (!img || !img.startsWith('http') || img.toLowerCase() === 'merchant_image_url') return null;
  if (!url || !url.startsWith('http') || url.toLowerCase() === 'aw_deep_link') return null;
  if (price <= 5)                         return null;

  const priceFmt = formatPrice(price);
  const origFmt  = orig > price ? formatPrice(orig) : null;
  const discount = calcDiscount(price, orig);

  // display_price já vem formatado pela AWIN (ex: "R$ 299,90")
  const displayPrice = (row.display_price || '').trim();

  return {
    id:               `${brandKey}_feed_${id || Math.random().toString(36).slice(2)}`,
    advertiser:       BRAND_FEEDS[brandKey]?.name || (row.merchant_name || '').trim(),
    advertiserId:     String(mid),
    source:           'awin_feed',
    type:             'product',
    title:            name,
    description:      (row.description || '').substring(0, 200).trim()
                        || `${name} — oferta especial com preço garantido`,
    priceOriginal:    origFmt,
    priceCurrent:     displayPrice || priceFmt,
    discount:         discount,
    categories:       cat || brandKey,
    imageUrl:         img,
    deeplink:         url,        // já é o link afiliado AWIN (aw_deep_link)
    deeplinkTracking: url,        // mesmo link — aw_deep_link já rastreia
    feedSyncedAt:     new Date().toISOString().split('T')[0],
  };
}

// ── Tenta descobrir feedIds disponíveis via API ───────────────────────────────
async function discoverFeedIds() {
  if (!AWIN_FEED_API_KEY) return {};

  console.log('\n🔍 Descobrindo feed IDs disponíveis na AWIN...');
  try {
    const listUrl = `https://productdata.awin.com/datafeed/list/apikey/${AWIN_FEED_API_KEY}`;
    const raw = await downloadFeed(listUrl);

    // A lista retorna CSV com cabeçalho: "Advertiser ID","Advertiser Name",...,"Feed ID",...
    const rows = csv.parse(raw, { columns: true, skip_empty_lines: true, relax_quotes: true, trim: true });
    const map = {};

    for (const row of rows) {
      const mid = parseInt(row['Advertiser ID'] || row['advertiser_id'] || row.merchantId || row.merchant_id || 0, 10);
      const feedId = parseInt(row['Feed ID'] || row['feed_id'] || row.feedId || row.id || 0, 10);
      const status = (row['Membership Status'] || row['membership_status'] || '').toLowerCase();
      if (mid && feedId && (status === 'active' || status === 'joined' || !status)) {
        // Guarda o feed ID se ainda não tinha ou se tem mais produtos
        if (!map[mid]) {
          map[mid] = feedId;
        }
      }
    }

    console.log(`   Encontrados ${Object.keys(map).length} anunciantes com feeds ativos.`);
    return map;
  } catch (e) {
    console.warn(`   Aviso: não foi possível obter lista de feeds (${e.message})`);
    console.warn('   Usando feed IDs estáticos configurados.');
    return {};
  }
}

// ── Colunas na ordem exata que o feed CSV entrega (sem cabeçalho) ─────────────
const FEED_COLUMN_NAMES = [
  'aw_deep_link',
  'product_name',
  'aw_product_id',
  'merchant_product_id',
  'merchant_image_url',
  'description',
  'merchant_category',
  'search_price',
  'merchant_name',
  'merchant_id',
  'category_name',
  'category_id',
  'aw_image_url',
  'currency',
  'store_price',
  'delivery_cost',
  'merchant_deep_link',
  'language',
  'last_updated',
  'display_price',
  'data_feed_id',
];

// ── Sincroniza uma marca ──────────────────────────────────────────────────────
async function syncBrand(brandKey, feedIdOverride) {
  const cfg = BRAND_FEEDS[brandKey];
  if (!cfg) return [];

  const feedId = feedIdOverride || cfg.feedId;
  if (!feedId) {
    console.log(`  [${brandKey}] ℹ️  Marca sem feed CSV ativo na AWIN — mantendo catálogo existente`);
    return [];
  }

  const url = buildFeedUrl(feedId);
  if (!url) {
    console.log(`  [${brandKey}] ℹ️  Sem chave AWIN_FEED_API_KEY — pulando feed AWIN`);
    return [];
  }

  console.log(`  [${brandKey}] Baixando feed: ${cfg.name}...`);

  try {
    const raw = await downloadFeed(url);

    // O feed AWIN não inclui linha de cabeçalho — fornecemos os nomes manualmente
    const rows = csv.parse(raw, {
      columns:          FEED_COLUMN_NAMES,
      skip_empty_lines: true,
      relax_quotes:     true,
      relax_column_count: true,
      trim:             true,
      bom:              true,
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
    console.log(`  [${brandKey}] ⚠️  Aviso: ${e.message}`);
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
