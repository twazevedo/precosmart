/**
 * @file importPromotions.js — Importador de Cupons e Ofertas AWIN
 * @description Lê arquivos CSV com promoções oficiais da AWIN e sincroniza com awinDealsData.json
 */
'use strict';

const fs = require('fs');
const path = require('path');

const targetCsvFile = process.argv[2]
  ? path.resolve(process.argv[2])
  : (fs.existsSync(path.join(__dirname, 'kabum_promotions_latest.csv'))
      ? path.join(__dirname, 'kabum_promotions_latest.csv')
      : path.join(__dirname, 'latest_awin_promotions.csv'));

const jsonPath = path.join(__dirname, 'awinDealsData.json');

if (!fs.existsSync(targetCsvFile)) {
  console.error('[IMPORT] Arquivo CSV não encontrado em:', targetCsvFile);
  process.exit(1);
}

function parseCsv(content) {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const row = [];
    let inQuotes = false;
    let curr = '';

    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(curr.trim());
        curr = '';
      } else {
        curr += char;
      }
    }
    row.push(curr.trim());

    if (row.length >= 13) {
      const clean = row.map(cell => cell.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
      records.push({
        id: clean[0],
        advertiser: clean[1],
        advertiserId: clean[2],
        type: clean[3],
        code: clean[4],
        description: clean[5],
        starts: clean[6],
        ends: clean[7],
        categories: clean[8],
        deeplinkTracking: clean[11],
        deeplink: clean[12],
        dateAdded: clean[16] || '',
        title: clean[17] || clean[5]
      });
    }
  }

  return records;
}

const records = parseCsv(fs.readFileSync(targetCsvFile, 'utf8'));
console.log(`[IMPORT] Lendo arquivo: ${path.basename(targetCsvFile)}`);
console.log(`[IMPORT] Total de registros encontrados no CSV: ${records.length}`);

let masterData = { vouchers: [], products: [], kabumDeals: [] };
if (fs.existsSync(jsonPath)) {
  try {
    masterData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (e) {
    console.error('Falha ao ler awinDealsData.json:', e.message);
  }
}

if (!Array.isArray(masterData.vouchers)) masterData.vouchers = [];
if (!Array.isArray(masterData.products)) masterData.products = [];
if (!Array.isArray(masterData.kabumDeals)) masterData.kabumDeals = [];

const existingVoucherIds = new Set(masterData.vouchers.map(v => String(v.id || v.code).toUpperCase()));
const existingProductLinks = new Set(masterData.products.map(p => (p.deeplink || p.title || '').trim()));
const existingKabumLinks = new Set(masterData.kabumDeals.map(k => (k.deeplink || '').trim()));

let addedVouchers = 0;
let addedProducts = 0;
let addedKabum = 0;

for (const item of records) {
  const isVoucher = item.type === 'voucher' || (item.code && item.code.trim().length > 0);

  if (isVoucher) {
    const key = String(item.code || item.id).trim().toUpperCase();
    if (!existingVoucherIds.has(key)) {
      masterData.vouchers.unshift({
        id: item.id,
        advertiser: item.advertiserId === '17729' ? 'KaBuM! Brasil Oficial' : item.advertiser,
        advertiserId: item.advertiserId,
        type: 'voucher',
        code: item.code,
        description: item.description,
        starts: item.starts,
        ends: item.ends,
        categories: item.categories,
        deeplinkTracking: item.deeplinkTracking,
        deeplink: item.deeplink,
        title: item.title,
        imageUrl: null
      });
      existingVoucherIds.add(key);
      addedVouchers++;
    }
  } else {
    const link = (item.deeplink || '').trim();
    const key = link || item.title;

    // Se for da KaBuM (17729), sincroniza em kabumDeals
    if (item.advertiserId === '17729' && link && !existingKabumLinks.has(link)) {
      masterData.kabumDeals.unshift({
        id: `kabum_${item.id}`,
        advertiser: 'KaBuM! Brasil Oficial',
        advertiserId: '17729',
        type: 'product',
        title: item.title,
        description: item.description,
        priceOriginal: null,
        priceCurrent: null,
        discount: null,
        categories: item.categories || 'Hardware & Tecnologia',
        imageUrl: null,
        deeplink: item.deeplink,
        deeplinkTracking: item.deeplinkTracking
      });
      existingKabumLinks.add(link);
      addedKabum++;
    }

    if (!existingProductLinks.has(key)) {
      const pId = `awin_${item.advertiserId}_${item.id}`;
      masterData.products.unshift({
        id: pId,
        advertiser: `${item.advertiser} Oficial`,
        advertiserId: item.advertiserId,
        type: 'product',
        title: item.title,
        description: item.description,
        priceOriginal: null,
        priceCurrent: null,
        discount: null,
        categories: item.categories,
        imageUrl: null,
        deeplink: item.deeplink,
        deeplinkTracking: item.deeplinkTracking
      });
      existingProductLinks.add(key);
      addedProducts++;
    }
  }
}

console.log(`[IMPORT] Novos cupons inseridos: ${addedVouchers}`);
console.log(`[IMPORT] Novos produtos globais inseridos: ${addedProducts}`);
console.log(`[IMPORT] Novos produtos KaBuM inseridos: ${addedKabum}`);
console.log(`[IMPORT] Total vouchers agora: ${masterData.vouchers.length}`);
console.log(`[IMPORT] Total produtos globais agora: ${masterData.products.length}`);
console.log(`[IMPORT] Total kabumDeals agora: ${masterData.kabumDeals.length}`);

// Verificação de segurança: garantir que nenhum link de redirecionador externo (TinyURL/VigLink) entrou
let jsonOutput = JSON.stringify(masterData, null, 2);
if (jsonOutput.toLowerCase().includes('tinyurl.com') || jsonOutput.toLowerCase().includes('viglink')) {
  console.error('[ERRO DE SEGURANÇA] Tentativa de inserir TinyURL/VigLink bloqueada!');
  process.exit(1);
}

fs.writeFileSync(jsonPath, jsonOutput, 'utf8');
console.log('[IMPORT] awinDealsData.json atualizado com sucesso e 100% verificado!');
