/**
 * @file importPromotions.js — Importador de Cupons e Ofertas AWIN
 * @description Lê o arquivo CSV com promoções oficiais e sincroniza com awinDealsData.json
 */
'use strict';

const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'latest_awin_promotions.csv');
const jsonPath = path.join(__dirname, 'awinDealsData.json');

if (!fs.existsSync(csvPath)) {
  console.error('Arquivo CSV não encontrado em:', csvPath);
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

const records = parseCsv(fs.readFileSync(csvPath, 'utf8'));
console.log(`[IMPORT] Total de registros encontrados no CSV: ${records.length}`);

let masterData = { vouchers: [], products: [] };
if (fs.existsSync(jsonPath)) {
  try {
    masterData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (e) {
    console.error('Falha ao ler awinDealsData.json:', e.message);
  }
}

if (!Array.isArray(masterData.vouchers)) masterData.vouchers = [];
if (!Array.isArray(masterData.products)) masterData.products = [];

const existingVoucherIds = new Set(masterData.vouchers.map(v => String(v.id || v.code)));
const existingProductLinks = new Set(masterData.products.map(p => p.deeplink || p.title));

let addedVouchers = 0;
let addedProducts = 0;

for (const item of records) {
  const isVoucher = item.type === 'voucher' || (item.code && item.code.trim().length > 0);

  if (isVoucher) {
    const key = String(item.id || item.code);
    if (!existingVoucherIds.has(key)) {
      masterData.vouchers.unshift({
        id: item.id,
        advertiser: item.advertiser,
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
    const key = item.deeplink || item.title;
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
console.log(`[IMPORT] Novos produtos inseridos: ${addedProducts}`);
console.log(`[IMPORT] Total vouchers agora: ${masterData.vouchers.length}`);
console.log(`[IMPORT] Total produtos agora: ${masterData.products.length}`);

fs.writeFileSync(jsonPath, JSON.stringify(masterData, null, 2), 'utf8');
console.log('[IMPORT] awinDealsData.json atualizado com sucesso!');
